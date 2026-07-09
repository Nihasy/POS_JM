/**
 * Serveur de synchronisation JIABY POS.
 *
 * Fastify + PostgreSQL + Drizzle ORM.
 *
 * Endpoints :
 * - POST /sync/push — Réception batch d'événements (idempotent par UUID)
 * - GET  /sync/pull?since= — Envoi catalogue/prix modifiés depuis date
 * - GET  /health — Healthcheck
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
  shop_id: string;
  created_at: string;
}

// ─── Store en mémoire (à remplacer par PostgreSQL + Drizzle) ──────

const events: Map<string, SyncEvent> = new Map();
const catalog: Map<string, { id: string; data: unknown; updated_at: string }> = new Map();

// ─── Routes ────────────────────────────────────────────────────────

/**
 * Healthcheck.
 */
fastify.get('/health', async () => {
  return { status: 'ok', timestamp: new Date().toISOString() };
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

  const results: { event_id: string; status: 'NEW' | 'DUPLICATE' | 'ERROR' }[] = [];

  for (const event of batch) {
    if (events.has(event.id)) {
      results.push({ event_id: event.id, status: 'DUPLICATE' });
      continue;
    }

    try {
      events.set(event.id, event);

      // Appliquer selon le type d'événement
      switch (event.event_type) {
        case 'SALE':
          // Stocker la vente dans le data warehouse
          break;
        case 'RECEIVING':
          // Mettre à jour le catalogue distant si nécessaire
          break;
        case 'ADJUSTMENT':
          break;
        case 'CASHUP':
          break;
        case 'CUSTOMER_PAYMENT':
          break;
      }

      results.push({ event_id: event.id, status: 'NEW' });
    } catch (err) {
      fastify.log.error(err);
      results.push({ event_id: event.id, status: 'ERROR' });
    }
  }

  return { received: batch.length, results };
});

/**
 * PULL — Récupération des modifications catalogue/prix depuis une date.
 */
fastify.get('/sync/pull', async (request) => {
  const { since } = request.query as { since?: string };

  const sinceDate = since ? new Date(since) : new Date(0);

  // Filtrer les entrées catalogue modifiées depuis
  const updatedItems = Array.from(catalog.values()).filter(
    (item) => new Date(item.updated_at) > sinceDate
  );

  return {
    items: updatedItems,
    server_time: new Date().toISOString(),
  };
});

// ─── Démarrage ─────────────────────────────────────────────────────

const PORT = Number(process.env.PORT) || 3001;

fastify.listen({ port: PORT, host: '0.0.0.0' }, (err, address) => {
  if (err) {
    fastify.log.error(err);
    process.exit(1);
  }
  console.log(`[JIABY Sync] Serveur démarré sur ${address}`);
});
