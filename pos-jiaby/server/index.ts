/**
 * Serveur de synchronisation JIABY POS.
 *
 * Fastify + PostgreSQL + Drizzle ORM (fallback en mémoire sans DATABASE_URL,
 * pour le développement et les tests).
 *
 * Endpoints :
 * - POST /sync/push — Réception batch d'événements (idempotent par UUID, S35)
 * - GET  /sync/pull?since= — Envoi catalogue/prix modifiés depuis date
 * - GET  /dashboard/summary — CA du jour par boutique, dernières ventes (lecture seule)
 * - GET  /health — Healthcheck
 *
 * Auth par token boutique : variable d'env SHOP_TOKENS="shop-01:secret1,shop-02:secret2".
 * Sans SHOP_TOKENS, l'auth est désactivée (dev uniquement).
 *
 * Règle de conflit :
 * - Boutique = vérité ventes/stock
 * - Serveur = vérité catalogue
 * - Last-write-wins horodaté ailleurs
 */

import Fastify from 'fastify';

const fastify = Fastify({ logger: true });

// ─── Types ─────────────────────────────────────────────────────────

interface SyncEvent {
  id: string; // UUID, idempotent
  event_type: 'SALE' | 'RECEIVING' | 'ADJUSTMENT' | 'CASHUP' | 'CUSTOMER_PAYMENT';
  entity_id: string;
  payload: string; // JSON
  created_at: string;
}

interface SalePayload {
  sale?: {
    id: string;
    sale_number: string;
    customer_id: string | null;
    user_id: string;
    status: string;
    subtotal: number;
    discount_global_percent: number | null;
    discount_global_amount: number | null;
    total: number;
    is_quote: number;
    is_return: number;
    original_sale_id: string | null;
  };
  items?: {
    id: string;
    sale_id: string;
    item_id: string;
    name_snapshot: string;
    quantity: number;
    catalog_price: number;
    applied_price: number;
    discount_percent: number | null;
    discount_amount: number | null;
    line_total: number;
    cost_price_snapshot: number;
    tier_applied: string | null;
  }[];
  payments?: {
    id: string;
    sale_id: string;
    method: string;
    amount: number;
    reference: string | null;
    change_given: number | null;
  }[];
  // Ancien format (résumé) — toujours accepté
  sale_number?: string;
  total?: number;
  is_quote?: number;
  is_return?: number;
}

interface SaleSummary {
  saleNumber: string;
  total: number;
  isReturn: number;
  createdAt: string;
}

/** Abstraction de stockage : PostgreSQL (Drizzle) ou mémoire (dev/test). */
interface Store {
  /** Enregistre un événement ; retourne DUPLICATE si l'UUID est déjà connu (S35). */
  saveEvent(shopId: string, event: SyncEvent): Promise<'NEW' | 'DUPLICATE'>;
  /** Ingestion d'une vente complète dans le data warehouse. */
  saveSale(shopId: string, payload: SalePayload, createdAt: string): Promise<void>;
  /** Catalogue modifié depuis une date (serveur = vérité catalogue). */
  pullItems(since: Date): Promise<unknown[]>;
  /** Résumé dashboard : CA du jour et dernières ventes par boutique. */
  dashboardSummary(): Promise<{
    shops: { shopId: string; todayTotal: number; todaySales: number; lastSales: SaleSummary[] }[];
  }>;
}

// ─── Store en mémoire (dev / tests sans PostgreSQL) ────────────────

class MemoryStore implements Store {
  private events = new Map<string, { shopId: string; event: SyncEvent }>();
  private sales = new Map<string, { shopId: string; summary: SaleSummary }>();
  private catalog = new Map<string, { id: string; data: unknown; updated_at: string }>();

  async saveEvent(shopId: string, event: SyncEvent): Promise<'NEW' | 'DUPLICATE'> {
    if (this.events.has(event.id)) return 'DUPLICATE';
    this.events.set(event.id, { shopId, event });
    return 'NEW';
  }

  async saveSale(shopId: string, payload: SalePayload, createdAt: string): Promise<void> {
    const sale = payload.sale;
    const id = sale?.id ?? payload.sale_number ?? crypto.randomUUID();
    if (this.sales.has(id)) return;
    this.sales.set(id, {
      shopId,
      summary: {
        saleNumber: sale?.sale_number ?? payload.sale_number ?? '?',
        total: sale?.total ?? payload.total ?? 0,
        isReturn: sale?.is_return ?? payload.is_return ?? 0,
        createdAt,
      },
    });
  }

  async pullItems(since: Date): Promise<unknown[]> {
    return Array.from(this.catalog.values()).filter(
      (item) => new Date(item.updated_at) > since
    );
  }

  async dashboardSummary() {
    const today = new Date().toISOString().slice(0, 10);
    const byShop = new Map<string, { todayTotal: number; todaySales: number; lastSales: SaleSummary[] }>();

    for (const { shopId, summary } of this.sales.values()) {
      const entry = byShop.get(shopId) ?? { todayTotal: 0, todaySales: 0, lastSales: [] };
      if (summary.createdAt.startsWith(today) && summary.isReturn === 0) {
        entry.todayTotal += summary.total;
        entry.todaySales += 1;
      }
      entry.lastSales.push(summary);
      byShop.set(shopId, entry);
    }

    return {
      shops: Array.from(byShop.entries()).map(([shopId, entry]) => ({
        shopId,
        todayTotal: entry.todayTotal,
        todaySales: entry.todaySales,
        lastSales: entry.lastSales
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .slice(0, 10),
      })),
    };
  }
}

// ─── Store PostgreSQL (Drizzle) ────────────────────────────────────

async function createPgStore(): Promise<Store> {
  const { db, schema } = await import('./db/index');
  const { sql, gt, eq, and, desc } = await import('drizzle-orm');

  return {
    async saveEvent(shopId, event) {
      const inserted = await db
        .insert(schema.syncEvents)
        .values({
          id: event.id,
          shopId,
          eventType: event.event_type,
          entityId: event.entity_id,
          payload: event.payload,
          createdAt: new Date(event.created_at),
        })
        .onConflictDoNothing({ target: schema.syncEvents.id })
        .returning({ id: schema.syncEvents.id });
      return inserted.length > 0 ? 'NEW' : 'DUPLICATE';
    },

    async saveSale(shopId, payload, createdAt) {
      const sale = payload.sale;
      if (!sale) return; // ancien format résumé : l'événement suffit

      await db
        .insert(schema.sales)
        .values({
          id: sale.id,
          shopId,
          saleNumber: sale.sale_number,
          customerId: sale.customer_id,
          userId: sale.user_id,
          status: sale.status,
          subtotal: sale.subtotal,
          discountGlobalPercent: sale.discount_global_percent,
          discountGlobalAmount: sale.discount_global_amount,
          total: sale.total,
          isQuote: sale.is_quote,
          isReturn: sale.is_return,
          originalSaleId: sale.original_sale_id,
          createdAt: new Date(createdAt),
        })
        .onConflictDoNothing({ target: schema.sales.id });

      for (const item of payload.items ?? []) {
        await db
          .insert(schema.salesItems)
          .values({
            id: item.id,
            saleId: item.sale_id,
            itemId: item.item_id,
            nameSnapshot: item.name_snapshot,
            quantity: item.quantity,
            catalogPrice: item.catalog_price,
            appliedPrice: item.applied_price,
            discountPercent: item.discount_percent,
            discountAmount: item.discount_amount,
            lineTotal: item.line_total,
            costPriceSnapshot: item.cost_price_snapshot,
            tierApplied: item.tier_applied,
          })
          .onConflictDoNothing({ target: schema.salesItems.id });
      }

      for (const payment of payload.payments ?? []) {
        await db
          .insert(schema.salesPayments)
          .values({
            id: payment.id,
            saleId: payment.sale_id,
            method: payment.method,
            amount: payment.amount,
            reference: payment.reference,
            changeGiven: payment.change_given,
          })
          .onConflictDoNothing({ target: schema.salesPayments.id });
      }
    },

    async pullItems(since) {
      return db
        .select()
        .from(schema.items)
        .where(gt(schema.items.updatedAt, since));
    },

    async dashboardSummary() {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      const shopRows = await db
        .selectDistinct({ shopId: schema.sales.shopId })
        .from(schema.sales);

      const shops = [];
      for (const { shopId } of shopRows) {
        const [todayAgg] = await db
          .select({
            total: sql<number>`COALESCE(SUM(${schema.sales.total}), 0)`,
            count: sql<number>`COUNT(*)`,
          })
          .from(schema.sales)
          .where(
            and(
              eq(schema.sales.shopId, shopId),
              eq(schema.sales.isReturn, 0),
              gt(schema.sales.createdAt, startOfDay)
            )
          );

        const lastSales = await db
          .select({
            saleNumber: schema.sales.saleNumber,
            total: schema.sales.total,
            isReturn: schema.sales.isReturn,
            createdAt: schema.sales.createdAt,
          })
          .from(schema.sales)
          .where(eq(schema.sales.shopId, shopId))
          .orderBy(desc(schema.sales.createdAt))
          .limit(10);

        shops.push({
          shopId,
          todayTotal: Number(todayAgg?.total ?? 0),
          todaySales: Number(todayAgg?.count ?? 0),
          lastSales: lastSales.map((s) => ({
            saleNumber: s.saleNumber,
            total: s.total,
            isReturn: s.isReturn,
            createdAt: s.createdAt.toISOString(),
          })),
        });
      }

      return { shops };
    },
  };
}

// ─── Sélection du store ────────────────────────────────────────────

const usePostgres = Boolean(process.env.DATABASE_URL);
let store: Store;

// ─── Auth par token boutique ───────────────────────────────────────

/** SHOP_TOKENS="shop-01:secret1,shop-02:secret2" */
function parseShopTokens(): Map<string, string> {
  const raw = process.env.SHOP_TOKENS ?? '';
  const tokens = new Map<string, string>();
  for (const pair of raw.split(',')) {
    const [shopId, token] = pair.split(':');
    if (shopId && token) tokens.set(shopId.trim(), token.trim());
  }
  return tokens;
}

const shopTokens = parseShopTokens();

function checkAuth(shopId: string, authHeader: string | undefined): boolean {
  if (shopTokens.size === 0) return true; // dev : auth désactivée
  const expected = shopTokens.get(shopId);
  if (!expected) return false;
  return authHeader === `Bearer ${expected}`;
}

// ─── Routes ────────────────────────────────────────────────────────

fastify.get('/health', async () => {
  return {
    status: 'ok',
    storage: usePostgres ? 'postgresql' : 'memory',
    timestamp: new Date().toISOString(),
  };
});

/**
 * PUSH — Réception d'un batch d'événements.
 * Idempotent par UUID d'événement (S35).
 */
fastify.post('/sync/push', async (request, reply) => {
  const { shop_id, events: batch } = request.body as {
    shop_id: string;
    events: SyncEvent[];
  };

  if (!shop_id || !Array.isArray(batch)) {
    return reply.status(400).send({ error: 'shop_id et events[] requis' });
  }

  if (!checkAuth(shop_id, request.headers.authorization)) {
    return reply.status(401).send({ error: 'Token boutique invalide' });
  }

  const results: { event_id: string; status: 'NEW' | 'DUPLICATE' | 'ERROR' }[] = [];

  for (const event of batch) {
    try {
      const status = await store.saveEvent(shop_id, event);

      // Un événement déjà reçu n'est JAMAIS ré-appliqué (S35)
      if (status === 'NEW' && event.event_type === 'SALE') {
        const payload = JSON.parse(event.payload) as SalePayload;
        await store.saveSale(shop_id, payload, event.created_at);
      }

      results.push({ event_id: event.id, status });
    } catch (err) {
      fastify.log.error(err);
      results.push({ event_id: event.id, status: 'ERROR' });
    }
  }

  return { received: batch.length, results };
});

/**
 * PULL — Récupération des modifications catalogue/prix depuis une date.
 * Le serveur est la vérité catalogue.
 */
fastify.get('/sync/pull', async (request) => {
  const { since } = request.query as { since?: string };
  const sinceDate = since ? new Date(since) : new Date(0);

  return {
    items: await store.pullItems(sinceDate),
    server_time: new Date().toISOString(),
  };
});

/**
 * Dashboard lecture seule (consultable depuis Tana) :
 * CA du jour par boutique + dernières ventes.
 */
fastify.get('/dashboard/summary', async () => {
  return store.dashboardSummary();
});

fastify.get('/', async (_request, reply) => {
  reply.type('text/html');
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>JIABY — Dashboard</title>
<style>
  body { font-family: system-ui, sans-serif; background: #F4F6F3; color: #15181B; margin: 0; padding: 2rem; }
  h1 { border-top: 4px solid; border-image: linear-gradient(90deg, #2E9E44 50%, #F2C218 50%) 1; padding-top: .75rem; }
  .shop { background: #fff; border-radius: 8px; padding: 1rem 1.5rem; margin-bottom: 1rem; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
  .ca { font-size: 1.75rem; font-weight: 700; font-variant-numeric: tabular-nums; }
  table { width: 100%; border-collapse: collapse; font-size: .875rem; margin-top: .5rem; }
  td, th { text-align: left; padding: .25rem .5rem; border-bottom: 1px solid #eee; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
</style>
</head>
<body>
<h1>JIABY — Tableau de bord</h1>
<div id="shops">Chargement…</div>
<script>
fetch('/dashboard/summary').then(r => r.json()).then(data => {
  const el = document.getElementById('shops');
  if (!data.shops.length) { el.textContent = 'Aucune vente synchronisée pour le moment.'; return; }
  el.innerHTML = data.shops.map(s =>
    '<div class="shop"><h2>' + s.shopId + '</h2>' +
    '<div class="ca">' + s.todayTotal.toLocaleString('fr-FR') + ' Ar</div>' +
    '<div>' + s.todaySales + ' vente(s) aujourd\\'hui</div>' +
    '<table><tr><th>N°</th><th>Date</th><th style="text-align:right">Total</th></tr>' +
    s.lastSales.map(v => '<tr><td>' + v.saleNumber + '</td><td>' +
      new Date(v.createdAt).toLocaleString('fr-FR') + '</td><td class="num">' +
      v.total.toLocaleString('fr-FR') + ' Ar</td></tr>').join('') +
    '</table></div>'
  ).join('');
});
</script>
</body>
</html>`;
});

// ─── Démarrage ─────────────────────────────────────────────────────

const PORT = Number(process.env.PORT) || 3001;

async function start() {
  store = usePostgres ? await createPgStore() : new MemoryStore();
  fastify.log.info(`Stockage : ${usePostgres ? 'PostgreSQL (Drizzle)' : 'mémoire (dev)'}`);

  fastify.listen({ port: PORT, host: '0.0.0.0' }, (err, address) => {
    if (err) {
      fastify.log.error(err);
      process.exit(1);
    }
    console.log(`[JIABY Sync] Serveur démarré sur ${address}`);
  });
}

void start();
