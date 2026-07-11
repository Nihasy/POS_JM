/**
 * Couche service — Opérations base de données de l'application.
 *
 * Relie les écrans (modules UI) au domaine pur (core/domain) et à SQLite.
 * Toutes les écritures critiques (vente, réception, ajustement, cashup)
 * sont exécutées dans UNE transaction SQLite — tout ou rien (règle n°6).
 */

import type { Db } from '@/core/db';
import { withTransaction } from '@/core/db';
import type {
  UUID,
  Item,
  Category,
  Customer,
  Supplier,
  Sale,
  SaleItem,
  CartLine,
  CartPayment,
  CashupSession,
  CashupExpense,
} from '@/core/domain/types';
import {
  prepareFinalize,
  prepareSuspend,
  checkStock,
  checkCreditLimit,
} from '@/core/domain/finalize';
import { prepareReceive, type ReceiveLine } from '@/core/domain/receive';
import {
  prepareAdjustment,
  prepareManualOut,
  type AdjustmentReason,
  type AdjustmentLine,
} from '@/core/domain/adjustment';
import { prepareCashupClose } from '@/core/domain/cashup';

// ─── Chargement des données ────────────────────────────────────────

export interface AppData {
  items: Item[];
  categories: Category[];
  customers: Customer[];
  suppliers: Supplier[];
  stockLevels: Map<string, number>;
  sales: Sale[];
  saleItems: SaleItem[];
  activeSession: CashupSession | null;
  sessionExpenses: CashupExpense[];
  sessionCashSales: number;
  sessionCashReturns: number;
  sessionMvolaTotal: number;
  sessionCreditTotal: number;
  itemSales30d: Map<string, number>;
  itemSales90d: Map<string, number>;
  pendingSyncCount: number;
  users: AppUser[];
}

/** Charge toutes les données nécessaires aux écrans. */
export async function loadAppData(db: Db): Promise<AppData> {
  const items = await db.select<Item>('SELECT * FROM items WHERE deleted = 0 ORDER BY name');
  const categories = await db.select<Category>('SELECT * FROM categories ORDER BY sort_order, name');
  const customers = await db.select<Customer>('SELECT * FROM customers WHERE deleted = 0 ORDER BY last_name');
  const suppliers = await db.select<Supplier>('SELECT * FROM suppliers WHERE deleted = 0 ORDER BY name');

  // Stock = Σ ledger (JAMAIS un champ édité — règle n°4)
  const stockRows = await db.select<{ item_id: string; qty: number }>(
    'SELECT item_id, COALESCE(SUM(quantity), 0) as qty FROM inventory GROUP BY item_id'
  );
  const stockLevels = new Map(stockRows.map((r) => [r.item_id, r.qty]));

  const sales = await db.select<Sale>(
    "SELECT * FROM sales ORDER BY created_at DESC LIMIT 1000"
  );
  const saleItems = await db.select<SaleItem>(
    `SELECT si.* FROM sales_items si
     JOIN sales s ON s.id = si.sale_id
     WHERE s.created_at >= datetime('now', '-90 days')`
  );

  const sessionRows = await db.select<CashupSession>(
    'SELECT * FROM cashup_sessions WHERE closed_at IS NULL ORDER BY opened_at DESC LIMIT 1'
  );
  const activeSession = sessionRows[0] ?? null;

  let sessionExpenses: CashupExpense[] = [];
  let sessionCashSales = 0;
  let sessionCashReturns = 0;
  let sessionMvolaTotal = 0;
  let sessionCreditTotal = 0;

  if (activeSession) {
    sessionExpenses = await db.select<CashupExpense>(
      'SELECT * FROM cashup_expenses WHERE session_id = ? ORDER BY created_at',
      [activeSession.id]
    );
    const totals = await getSessionTotals(db, activeSession);
    sessionCashSales = totals.ESPECES;
    sessionCashReturns = totals.cashReturns;
    sessionMvolaTotal = totals.MVOLA;
    sessionCreditTotal = totals.CREDIT;
  }

  // Ventes agrégées par produit sur 30 / 90 jours (vélocité)
  const sales30 = await db.select<{ item_id: string; qty: number }>(
    `SELECT si.item_id, COALESCE(SUM(si.quantity), 0) as qty
     FROM sales_items si JOIN sales s ON s.id = si.sale_id
     WHERE s.status = 'COMPLETED' AND s.is_quote = 0 AND s.is_return = 0
       AND s.created_at >= datetime('now', '-30 days')
     GROUP BY si.item_id`
  );
  const sales90 = await db.select<{ item_id: string; qty: number }>(
    `SELECT si.item_id, COALESCE(SUM(si.quantity), 0) as qty
     FROM sales_items si JOIN sales s ON s.id = si.sale_id
     WHERE s.status = 'COMPLETED' AND s.is_quote = 0 AND s.is_return = 0
       AND s.created_at >= datetime('now', '-90 days')
     GROUP BY si.item_id`
  );

  const pendingRows = await db.select<{ cnt: number }>(
    'SELECT COUNT(*) as cnt FROM sync_queue WHERE synced_at IS NULL'
  );

  return {
    items,
    categories,
    customers,
    suppliers,
    stockLevels,
    sales,
    saleItems,
    activeSession,
    sessionExpenses,
    sessionCashSales,
    sessionCashReturns,
    sessionMvolaTotal,
    sessionCreditTotal,
    itemSales30d: new Map(sales30.map((r) => [r.item_id, r.qty])),
    itemSales90d: new Map(sales90.map((r) => [r.item_id, r.qty])),
    pendingSyncCount: pendingRows[0]?.cnt ?? 0,
    users: await listUsers(db),
  };
}

/** Totaux de paiement de la session en cours (ventes espèces nettes de rendu). */
async function getSessionTotals(db: Db, session: CashupSession) {
  const rows = await db.select<{
    method: 'ESPECES' | 'MVOLA' | 'CREDIT';
    amount: number;
    change_given: number | null;
    is_return: number;
  }>(
    `SELECT sp.method, sp.amount, sp.change_given, s.is_return
     FROM sales_payments sp
     JOIN sales s ON s.id = sp.sale_id
     WHERE s.status = 'COMPLETED' AND s.is_quote = 0
       AND s.created_at >= ?`,
    [session.opened_at]
  );

  const totals = { ESPECES: 0, MVOLA: 0, CREDIT: 0, cashReturns: 0 };
  for (const r of rows) {
    if (r.is_return === 1) {
      if (r.method === 'ESPECES') totals.cashReturns += r.amount;
      continue;
    }
    const net = r.method === 'ESPECES' ? r.amount - (r.change_given ?? 0) : r.amount;
    totals[r.method] += net;
  }
  return totals;
}

async function getConfig(db: Db, key: string): Promise<string | null> {
  const rows = await db.select<{ value: string }>(
    'SELECT value FROM app_config WHERE key = ?',
    [key]
  );
  return rows[0]?.value ?? null;
}

/** Numéro de pièce suivant (V/D/R/P-année-NNNNN). */
async function nextNumber(db: Db, prefix: string): Promise<string> {
  const year = new Date().getFullYear();
  const rows = await db.select<{ cnt: number }>(
    'SELECT COUNT(*) + 1 as cnt FROM sales WHERE sale_number LIKE ?',
    [`${prefix}-${year}-%`]
  );
  return `${prefix}-${year}-${String(rows[0]?.cnt ?? 1).padStart(5, '0')}`;
}

/** Composition des kits présents dans le panier (composant + qté par kit). */
async function getKitComponents(
  db: Db,
  kitItemIds: UUID[]
): Promise<Map<UUID, { itemId: UUID; quantity: number }[]>> {
  const result = new Map<UUID, { itemId: UUID; quantity: number }[]>();
  for (const kitItemId of kitItemIds) {
    const rows = await db.select<{ component_item_id: UUID; quantity: number }>(
      `SELECT iki.component_item_id, iki.quantity
       FROM item_kits ik JOIN item_kit_items iki ON iki.kit_id = ik.id
       WHERE ik.kit_item_id = ? AND ik.deleted = 0`,
      [kitItemId]
    );
    result.set(
      kitItemId,
      rows.map((r) => ({ itemId: r.component_item_id, quantity: r.quantity }))
    );
  }
  return result;
}

async function updateQuantityCache(db: Db, itemIds: UUID[]): Promise<void> {
  for (const itemId of new Set(itemIds)) {
    await db.execute(
      `INSERT INTO item_quantities (item_id, quantity)
       VALUES (?, (SELECT COALESCE(SUM(quantity), 0) FROM inventory WHERE item_id = ?))
       ON CONFLICT(item_id) DO UPDATE SET quantity = excluded.quantity`,
      [itemId, itemId]
    );
  }
}

async function enqueueSyncEvent(
  db: Db,
  eventType: string,
  entityId: UUID,
  payload: unknown
): Promise<void> {
  await db.execute(
    'INSERT INTO sync_queue (id, event_type, entity_id, payload) VALUES (?, ?, ?, ?)',
    [crypto.randomUUID(), eventType, entityId, JSON.stringify(payload)]
  );
}

// ─── Finalisation de vente ─────────────────────────────────────────

export interface FinalizeSaleParams {
  lines: CartLine[];
  payments: CartPayment[];
  customerId: UUID | null;
  userId: UUID;
  discountGlobalPercent: number | null;
  discountGlobalAmount: number | null;
  isQuote?: boolean;
  isReturn?: boolean;
  originalSaleId?: UUID | null;
}

export interface FinalizeSaleResult {
  saleId: UUID;
  saleNumber: string;
  changeGiven: number | null;
}

/**
 * Finalise une vente (ou un devis, ou un retour) — transaction atomique.
 * Contrôles : stock (S28), plafond crédit (S17–S20), paiements (S15–S16).
 */
export async function finalizeSaleTx(
  db: Db,
  params: FinalizeSaleParams
): Promise<FinalizeSaleResult> {
  const isQuote = params.isQuote ?? false;
  const isReturn = params.isReturn ?? false;

  // PMP courants — figés dans la vente (S07)
  const costPrices = new Map<UUID, number>();
  const kitFlags = new Map<UUID, boolean>();
  for (const line of params.lines) {
    const rows = await db.select<{ cost_price: number }>(
      'SELECT cost_price FROM items WHERE id = ?',
      [line.itemId]
    );
    costPrices.set(line.itemId, rows[0]?.cost_price ?? 0);
    kitFlags.set(line.itemId, line.isKit);
  }

  // Contrôle de stock (S28) — sauf devis et retours
  if (!isQuote && !isReturn) {
    const allowNegative = (await getConfig(db, 'allow_negative_stock')) === 'true';
    if (!allowNegative) {
      const stockRows = await db.select<{ item_id: string; qty: number }>(
        'SELECT item_id, COALESCE(SUM(quantity), 0) as qty FROM inventory GROUP BY item_id'
      );
      const stockLevels = new Map(stockRows.map((r) => [r.item_id, r.qty]));

      // Kits : contrôle sur les composants (S24)
      const kitLines = params.lines.filter((l) => l.isKit);
      const kitComponents = await getKitComponents(db, kitLines.map((l) => l.itemId));
      const directLines = params.lines.filter((l) => !l.isKit);

      const shortages = checkStock(directLines, stockLevels);
      for (const kitLine of kitLines) {
        for (const comp of kitComponents.get(kitLine.itemId) ?? []) {
          const needed = comp.quantity * kitLine.quantity;
          const available = stockLevels.get(comp.itemId) ?? 0;
          if (needed > available) {
            shortages.push({
              itemId: comp.itemId,
              name: `${kitLine.name} (composant)`,
              requested: needed,
              available,
            });
          }
        }
      }

      if (shortages.length > 0) {
        const detail = shortages
          .map((s) => `${s.name} : demandé ${s.requested}, disponible ${s.available}`)
          .join(' ; ');
        throw new Error(`Stock insuffisant — ${detail}`);
      }
    }
  }

  // Contrôle plafond crédit (S17–S20) — sauf retours : un avoir sur
  // le compte client DIMINUE la dette, le plafond n'a pas de sens.
  const creditAmount = params.payments
    .filter((p) => p.method === 'CREDIT')
    .reduce((s, p) => s + p.amount, 0);
  if (creditAmount > 0) {
    if (!params.customerId) {
      throw new Error('Paiement à crédit : client obligatoire.');
    }
    const rows = await db.select<{ balance_due: number; credit_limit: number }>(
      'SELECT balance_due, credit_limit FROM customers WHERE id = ?',
      [params.customerId]
    );
    const customer = rows[0];
    if (!customer) throw new Error('Client introuvable.');
    if (!isReturn && !checkCreditLimit(customer.balance_due, customer.credit_limit, creditAmount)) {
      throw new Error(
        `Plafond crédit dépassé : solde ${customer.balance_due} + ${creditAmount} > ${customer.credit_limit} Ar.`
      );
    }
  }

  const result = prepareFinalize({
    cartLines: params.lines,
    payments: params.payments,
    customerId: params.customerId,
    userId: params.userId,
    allowNegativeStock: false,
    isQuote,
    isReturn,
    originalSaleId: params.originalSaleId ?? null,
    costPrices,
    discountGlobalPercent: params.discountGlobalPercent,
    discountGlobalAmount: params.discountGlobalAmount,
  });

  if (result.errors.length > 0) {
    throw new Error(result.errors.join(' ; '));
  }

  const prefix = isReturn ? 'R' : isQuote ? 'D' : 'V';
  const saleNumber = await nextNumber(db, prefix);
  const refType = isReturn ? 'RETURN' : 'SALE';

  // Décomposition des kits en écritures composants
  const kitLines = params.lines.filter((l) => l.isKit);
  const kitComponents = await getKitComponents(db, kitLines.map((l) => l.itemId));

  await withTransaction(db, async (tx) => {
    await tx.execute(
      `INSERT INTO sales (
        id, sale_number, customer_id, user_id, status,
        subtotal, discount_global_percent, discount_global_amount, total,
        is_quote, is_return, original_sale_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        result.sale.id, saleNumber, params.customerId, params.userId,
        result.sale.status, result.sale.subtotal,
        result.sale.discountGlobalPercent, result.sale.discountGlobalAmount,
        result.sale.total, result.sale.isQuote, result.sale.isReturn,
        result.sale.originalSaleId,
      ]
    );

    for (const item of result.items) {
      await tx.execute(
        `INSERT INTO sales_items (
          id, sale_id, item_id, name_snapshot, quantity,
          catalog_price, applied_price, discount_percent, discount_amount,
          line_total, cost_price_snapshot, tier_applied
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          item.id, item.saleId, item.itemId, item.nameSnapshot, item.quantity,
          item.catalogPrice, item.appliedPrice, item.discountPercent,
          item.discountAmount, item.lineTotal, item.costPriceSnapshot,
          item.tierApplied,
        ]
      );
    }

    if (!isQuote) {
      for (const p of result.payments) {
        await tx.execute(
          'INSERT INTO sales_payments (id, sale_id, method, amount, reference, change_given) VALUES (?, ?, ?, ?, ?, ?)',
          [p.id, result.sale.id, p.method, p.amount, p.reference, p.changeGiven]
        );
      }

      // Ledger : lignes directes (retour = positif, vente = négatif)
      const touchedItems: UUID[] = [];
      for (const entry of result.ledgerEntries) {
        await tx.execute(
          'INSERT INTO inventory (id, item_id, quantity, cost_price, ref_type, ref_id, user_id, comment) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [crypto.randomUUID(), entry.itemId, entry.quantity, entry.costPrice,
           refType, result.sale.id, params.userId, saleNumber]
        );
        touchedItems.push(entry.itemId);
      }

      // Ledger : composants de kits (S24)
      for (const kitLine of kitLines) {
        for (const comp of kitComponents.get(kitLine.itemId) ?? []) {
          const qty = comp.quantity * kitLine.quantity;
          await tx.execute(
            'INSERT INTO inventory (id, item_id, quantity, cost_price, ref_type, ref_id, user_id, comment) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [crypto.randomUUID(), comp.itemId, isReturn ? qty : -qty,
             costPrices.get(comp.itemId) ?? null, refType, result.sale.id,
             params.userId, `${saleNumber} (kit ${kitLine.name})`]
          );
          touchedItems.push(comp.itemId);
        }
      }

      await updateQuantityCache(tx, touchedItems);

      // Crédit : mise à jour du solde client (retour = diminution)
      if (creditAmount > 0 && params.customerId) {
        const delta = isReturn ? -creditAmount : creditAmount;
        await tx.execute(
          "UPDATE customers SET balance_due = balance_due + ?, updated_at = datetime('now') WHERE id = ?",
          [delta, params.customerId]
        );
      }
    }

    // Conversion de devis : le devis d'origine est marqué CANCELLED
    if (!isQuote && params.originalSaleId && !isReturn) {
      await tx.execute(
        "UPDATE sales SET status = 'CANCELLED' WHERE id = ? AND is_quote = 1",
        [params.originalSaleId]
      );
    }

    // Payload complet : le serveur ingère la vente pour le dashboard
    await enqueueSyncEvent(tx, 'SALE', result.sale.id, {
      sale: {
        id: result.sale.id,
        sale_number: saleNumber,
        customer_id: params.customerId,
        user_id: params.userId,
        status: result.sale.status,
        subtotal: result.sale.subtotal,
        discount_global_percent: result.sale.discountGlobalPercent,
        discount_global_amount: result.sale.discountGlobalAmount,
        total: result.sale.total,
        is_quote: result.sale.isQuote,
        is_return: result.sale.isReturn,
        original_sale_id: result.sale.originalSaleId,
      },
      items: result.items.map((i) => ({
        id: i.id,
        sale_id: i.saleId,
        item_id: i.itemId,
        name_snapshot: i.nameSnapshot,
        quantity: i.quantity,
        catalog_price: i.catalogPrice,
        applied_price: i.appliedPrice,
        discount_percent: i.discountPercent,
        discount_amount: i.discountAmount,
        line_total: i.lineTotal,
        cost_price_snapshot: i.costPriceSnapshot,
        tier_applied: i.tierApplied,
      })),
      payments: result.payments.map((p) => ({
        id: p.id,
        sale_id: result.sale.id,
        method: p.method,
        amount: p.amount,
        reference: p.reference,
        change_given: p.changeGiven,
      })),
    });
  });

  const changeGiven = result.payments.find((p) => p.changeGiven)?.changeGiven ?? null;
  return { saleId: result.sale.id, saleNumber, changeGiven };
}

// ─── Suspension / rappel (S21–S22) ─────────────────────────────────

export async function suspendSaleTx(
  db: Db,
  lines: CartLine[],
  customerId: UUID | null,
  userId: UUID,
  discountGlobalPercent: number | null = null,
  discountGlobalAmount: number | null = null
): Promise<string> {
  const result = prepareSuspend(
    lines,
    customerId,
    userId,
    discountGlobalPercent,
    discountGlobalAmount
  );
  if (result.errors.length > 0) throw new Error(result.errors.join(' ; '));

  const saleNumber = await nextNumber(db, 'P');

  await withTransaction(db, async (tx) => {
    await tx.execute(
      `INSERT INTO sales (id, sale_number, customer_id, user_id, status, subtotal,
        discount_global_percent, discount_global_amount, total, is_quote, is_return)
       VALUES (?, ?, ?, ?, 'SUSPENDED', ?, ?, ?, ?, 0, 0)`,
      [result.sale.id, saleNumber, customerId, userId, result.sale.subtotal,
       result.sale.discountGlobalPercent, result.sale.discountGlobalAmount,
       result.sale.total]
    );
    for (const item of result.items) {
      await tx.execute(
        `INSERT INTO sales_items (
          id, sale_id, item_id, name_snapshot, quantity,
          catalog_price, applied_price, discount_percent, discount_amount,
          line_total, cost_price_snapshot, tier_applied
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [item.id, item.saleId, item.itemId, item.nameSnapshot, item.quantity,
         item.catalogPrice, item.appliedPrice, item.discountPercent,
         item.discountAmount, item.lineTotal, item.costPriceSnapshot, item.tierApplied]
      );
    }
  });

  return saleNumber;
}

export interface SuspendedSale {
  sale: Sale;
  items: SaleItem[];
}

/** Paniers suspendus et devis en attente. */
export async function listSuspendedSales(db: Db): Promise<SuspendedSale[]> {
  const sales = await db.select<Sale>(
    "SELECT * FROM sales WHERE status = 'SUSPENDED' ORDER BY created_at DESC LIMIT 50"
  );
  const result: SuspendedSale[] = [];
  for (const sale of sales) {
    const items = await db.select<SaleItem>(
      'SELECT * FROM sales_items WHERE sale_id = ?',
      [sale.id]
    );
    result.push({ sale, items });
  }
  return result;
}

/**
 * Rappelle un panier suspendu : reconstruit les lignes de panier
 * et libère l'enregistrement (CANCELLED). Un devis rappelé reste
 * actif jusqu'à sa conversion (S23).
 */
export async function recallSaleTx(
  db: Db,
  saleId: UUID
): Promise<{
  lines: CartLine[];
  customerId: UUID | null;
  isQuote: boolean;
  saleNumber: string;
  discountGlobalPercent: number | null;
  discountGlobalAmount: number | null;
}> {
  const sales = await db.select<Sale>('SELECT * FROM sales WHERE id = ?', [saleId]);
  const sale = sales[0];
  if (!sale || sale.status !== 'SUSPENDED') {
    throw new Error('Panier suspendu introuvable.');
  }

  const items = await db.select<SaleItem>(
    'SELECT * FROM sales_items WHERE sale_id = ?',
    [saleId]
  );

  const lines: CartLine[] = items.map((item) => ({
    tempId: crypto.randomUUID(),
    itemId: item.item_id,
    name: item.name_snapshot,
    quantity: item.quantity,
    unitPrice: item.catalog_price,
    appliedPrice: item.applied_price,
    discountPercent: item.discount_percent,
    discountAmount: item.discount_amount,
    lineTotal: item.line_total,
    tierApplied: item.tier_applied,
    isKit: false,
  }));

  // Un panier suspendu (non-devis) est consommé au rappel
  if (sale.is_quote === 0) {
    await db.execute("UPDATE sales SET status = 'CANCELLED' WHERE id = ?", [saleId]);
  }

  return {
    lines,
    customerId: sale.customer_id,
    isQuote: sale.is_quote === 1,
    saleNumber: sale.sale_number,
    // La remise globale suspendue est restaurée au rappel
    discountGlobalPercent: sale.discount_global_percent,
    discountGlobalAmount: sale.discount_global_amount,
  };
}

// ─── Retours (S26–S27) ─────────────────────────────────────────────

/** Recherche une vente COMPLETED par numéro (pour retour / réimpression). */
export async function findSaleByNumber(
  db: Db,
  saleNumber: string
): Promise<{ sale: Sale; items: SaleItem[] } | null> {
  const sales = await db.select<Sale>(
    'SELECT * FROM sales WHERE sale_number = ?',
    [saleNumber.trim().toUpperCase()]
  );
  const sale = sales[0];
  if (!sale) return null;
  const items = await db.select<SaleItem>(
    'SELECT * FROM sales_items WHERE sale_id = ?',
    [sale.id]
  );
  return { sale, items };
}

/**
 * Retour (partiel ou total) sur une vente d'origine.
 * Remboursement au prix appliqué d'origine remises comprises,
 * ledger positif, avoir R-année-NNNNN (S26–S27).
 *
 * Garde-fous : impossible de retourner plus que le restant (les
 * retours précédents sur la même vente sont décomptés) ; le
 * remboursement CREDIT diminue le solde dû du client.
 */
export async function returnSaleTx(
  db: Db,
  params: {
    originalSale: Sale;
    returnLines: { item: SaleItem; quantity: number }[];
    refundMethod: 'ESPECES' | 'MVOLA' | 'CREDIT';
    refundReference: string | null;
    userId: UUID;
  }
): Promise<FinalizeSaleResult> {
  if (params.returnLines.length === 0) {
    throw new Error('Aucune ligne sélectionnée pour le retour.');
  }
  if (params.refundMethod === 'CREDIT' && !params.originalSale.customer_id) {
    throw new Error('Avoir sur compte client : la vente d’origine n’a pas de client.');
  }

  // Quantités déjà retournées sur cette vente (anti sur-retour)
  const prevRows = await db.select<{ item_id: string; qty: number }>(
    `SELECT si.item_id, COALESCE(SUM(si.quantity), 0) as qty
     FROM sales_items si
     JOIN sales s ON s.id = si.sale_id
     WHERE s.original_sale_id = ? AND s.is_return = 1 AND s.status = 'COMPLETED'
     GROUP BY si.item_id`,
    [params.originalSale.id]
  );
  const alreadyReturned = new Map(prevRows.map((r) => [r.item_id, r.qty]));

  const lines: CartLine[] = params.returnLines.map(({ item, quantity }) => {
    const remaining = item.quantity - (alreadyReturned.get(item.item_id) ?? 0);
    if (quantity <= 0 || quantity > item.quantity) {
      throw new Error(`Quantité de retour invalide pour ${item.name_snapshot}.`);
    }
    if (quantity > remaining) {
      throw new Error(
        `Retour impossible pour ${item.name_snapshot} : déjà retourné ${
          item.quantity - remaining
        }, restant ${Math.max(0, remaining)}.`
      );
    }
    // Prix appliqué d'origine, remises comprises : total au prorata
    const lineTotal = Math.round((item.line_total / item.quantity) * quantity);
    return {
      tempId: crypto.randomUUID(),
      itemId: item.item_id,
      name: item.name_snapshot,
      quantity,
      unitPrice: item.catalog_price,
      appliedPrice: item.applied_price,
      discountPercent: item.discount_percent,
      discountAmount: item.discount_amount,
      lineTotal,
      tierApplied: item.tier_applied,
      isKit: false,
    };
  });

  const total = lines.reduce((s, l) => s + l.lineTotal, 0);

  return finalizeSaleTx(db, {
    lines,
    payments: [
      {
        method: params.refundMethod,
        amount: total,
        reference: params.refundReference,
      },
    ],
    customerId: params.originalSale.customer_id,
    userId: params.userId,
    discountGlobalPercent: null,
    discountGlobalAmount: null,
    isReturn: true,
    originalSaleId: params.originalSale.id,
  });
}

// ─── Réceptions (S01–S04) ──────────────────────────────────────────

export async function receiveStockTx(
  db: Db,
  params: {
    lines: ReceiveLine[];
    supplierId: UUID | null;
    lotRef: string;
    userId: UUID;
  }
): Promise<{ refId: UUID; totalCost: number; totalUnits: Map<UUID, number> }> {
  const refId = crypto.randomUUID();
  const result = prepareReceive(params.lines, refId, params.userId);

  const totalUnits = new Map<UUID, number>();
  for (const entry of result.ledgerEntries) {
    totalUnits.set(entry.itemId, (totalUnits.get(entry.itemId) ?? 0) + entry.quantity);
  }

  await withTransaction(db, async (tx) => {
    for (const entry of result.ledgerEntries) {
      await tx.execute(
        'INSERT INTO inventory (id, item_id, quantity, cost_price, ref_type, ref_id, user_id, comment) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [crypto.randomUUID(), entry.itemId, entry.quantity, entry.costPrice,
         'RECEIVING', refId, params.userId,
         params.lotRef || (params.supplierId ? `Fournisseur ${params.supplierId}` : null)]
      );
    }

    // PMP pondéré recalculé (S01–S04)
    for (const [itemId, newPmp] of result.newPmps) {
      await tx.execute(
        "UPDATE items SET cost_price = ?, updated_at = datetime('now') WHERE id = ?",
        [newPmp, itemId]
      );
    }

    await updateQuantityCache(tx, [...result.newPmps.keys()]);

    await enqueueSyncEvent(tx, 'RECEIVING', refId, {
      lot_ref: params.lotRef,
      supplier_id: params.supplierId,
      total_cost: result.totalCost,
    });
  });

  return { refId, totalCost: result.totalCost, totalUnits };
}

// ─── Ajustements & sorties manuelles (S29) ─────────────────────────

export async function adjustStockTx(
  db: Db,
  params: {
    lines: AdjustmentLine[];
    reason: AdjustmentReason;
    userId: UUID;
  }
): Promise<{ refId: UUID; adjustedCount: number }> {
  const refId = crypto.randomUUID();
  const result = prepareAdjustment(params.lines, params.reason, params.userId);

  if (result.ledgerEntries.length === 0) {
    return { refId, adjustedCount: 0 };
  }

  await withTransaction(db, async (tx) => {
    for (const entry of result.ledgerEntries) {
      await tx.execute(
        'INSERT INTO inventory (id, item_id, quantity, cost_price, ref_type, ref_id, user_id, comment) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [crypto.randomUUID(), entry.itemId, entry.quantity, null,
         'ADJUSTMENT', refId, params.userId, entry.comment]
      );
    }
    await updateQuantityCache(tx, result.ledgerEntries.map((e) => e.itemId));
    await enqueueSyncEvent(tx, 'ADJUSTMENT', refId, {
      reason: params.reason,
      lines: result.summary,
    });
  });

  return { refId, adjustedCount: result.ledgerEntries.length };
}

export async function manualOutTx(
  db: Db,
  params: {
    itemId: UUID;
    quantity: number;
    reason: AdjustmentReason;
    userId: UUID;
    comment?: string;
  }
): Promise<void> {
  const refId = crypto.randomUUID();
  const { ledgerEntry } = prepareManualOut(params);

  await withTransaction(db, async (tx) => {
    await tx.execute(
      'INSERT INTO inventory (id, item_id, quantity, cost_price, ref_type, ref_id, user_id, comment) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [crypto.randomUUID(), ledgerEntry.itemId, ledgerEntry.quantity, null,
       'MANUAL_OUT', refId, params.userId, ledgerEntry.comment]
    );
    await updateQuantityCache(tx, [params.itemId]);
    await enqueueSyncEvent(tx, 'ADJUSTMENT', refId, {
      manual_out: true,
      item_id: params.itemId,
      quantity: params.quantity,
      reason: params.reason,
    });
  });
}

// ─── Sessions de caisse (S30, S32) ─────────────────────────────────

export async function openSessionTx(
  db: Db,
  userId: UUID,
  openingAmount: number
): Promise<UUID> {
  const existing = await db.select<{ id: string }>(
    'SELECT id FROM cashup_sessions WHERE closed_at IS NULL LIMIT 1'
  );
  if (existing.length > 0) {
    throw new Error('Une session de caisse est déjà ouverte.');
  }

  const id = crypto.randomUUID();
  await db.execute(
    'INSERT INTO cashup_sessions (id, user_id, opening_amount) VALUES (?, ?, ?)',
    [id, userId, openingAmount]
  );
  return id;
}

export async function closeSessionTx(
  db: Db,
  params: { session: CashupSession; countedCash: number; note: string }
): Promise<{ expectedCash: number; difference: number }> {
  const totals = await getSessionTotals(db, params.session);
  const expenses = await db.select<{ total: number }>(
    'SELECT COALESCE(SUM(amount), 0) as total FROM cashup_expenses WHERE session_id = ?',
    [params.session.id]
  );

  const result = prepareCashupClose({
    openingAmount: params.session.opening_amount,
    cashSales: totals.ESPECES,
    cashReturns: totals.cashReturns,
    expenses: expenses[0]?.total ?? 0,
    countedCash: params.countedCash,
    mvolaTotal: totals.MVOLA,
    creditTotal: totals.CREDIT,
    note: params.note,
  });

  await withTransaction(db, async (tx) => {
    await tx.execute(
      `UPDATE cashup_sessions
       SET closing_amount = ?, expected_cash = ?, counted_cash = ?,
           cash_difference = ?, note = ?, closed_at = datetime('now')
       WHERE id = ?`,
      [params.countedCash, result.expectedCash, result.countedCash,
       result.difference, result.note, params.session.id]
    );
    await enqueueSyncEvent(tx, 'CASHUP', params.session.id, {
      expected: result.expectedCash,
      counted: result.countedCash,
      difference: result.difference,
    });
  });

  return { expectedCash: result.expectedCash, difference: result.difference };
}

export async function addExpenseTx(
  db: Db,
  params: {
    sessionId: UUID;
    category: string;
    amount: number;
    reason: string;
  }
): Promise<void> {
  if (!params.reason.trim()) {
    throw new Error('Le motif de la dépense est obligatoire.');
  }
  await db.execute(
    'INSERT INTO cashup_expenses (id, session_id, category, amount, reason) VALUES (?, ?, ?, ?, ?)',
    [crypto.randomUUID(), params.sessionId, params.category, params.amount, params.reason]
  );
}

// ─── Clients & crédit ──────────────────────────────────────────────

export async function createCustomerTx(
  db: Db,
  params: {
    firstName: string;
    lastName: string;
    phone: string | null;
    creditLimit: number;
  }
): Promise<UUID> {
  if (!params.lastName.trim()) throw new Error('Le nom du client est obligatoire.');
  const id = crypto.randomUUID();
  await db.execute(
    'INSERT INTO customers (id, first_name, last_name, phone, email, balance_due, credit_limit, deleted) VALUES (?, ?, ?, ?, NULL, 0, ?, 0)',
    [id, params.firstName.trim(), params.lastName.trim(), params.phone, params.creditLimit]
  );
  return id;
}

/** Règlement d'un crédit client (diminue le solde dû). */
export async function customerPaymentTx(
  db: Db,
  params: { customerId: UUID; amount: number; userId: UUID }
): Promise<void> {
  if (params.amount <= 0) throw new Error('Le montant du règlement doit être positif.');

  const rows = await db.select<{ balance_due: number }>(
    'SELECT balance_due FROM customers WHERE id = ?',
    [params.customerId]
  );
  const balance = rows[0]?.balance_due ?? 0;
  if (params.amount > balance) {
    throw new Error(`Règlement supérieur au solde dû (${balance} Ar).`);
  }

  await withTransaction(db, async (tx) => {
    await tx.execute(
      "UPDATE customers SET balance_due = balance_due - ?, updated_at = datetime('now') WHERE id = ?",
      [params.amount, params.customerId]
    );
    await enqueueSyncEvent(tx, 'CUSTOMER_PAYMENT', params.customerId, {
      amount: params.amount,
      user_id: params.userId,
    });
  });
}

// ─── Catalogue ─────────────────────────────────────────────────────

export interface ItemFormData {
  name: string;
  shortName: string;
  categoryId: UUID | null;
  unitName: string;
  packName: string | null;
  qtyPerPack: number | null;
  sellingPrice: number;
  costPrice: number;
  qtySemiGros: number | null;
  priceSemiGros: number | null;
  qtyGros: number | null;
  priceGros: number | null;
  reorderLevel: number | null;
  receivingQuantity: number | null;
}

export async function createItemTx(db: Db, data: ItemFormData): Promise<UUID> {
  const id = crypto.randomUUID();

  // Génération auto du numéro d'article : JIA-XXXX-NNNN
  const seqRows = await db.select<{ cnt: number }>('SELECT COUNT(*) + 1 as cnt FROM items');
  const seq = seqRows[0]?.cnt ?? 1;
  let catCode = 'GENE';
  if (data.categoryId) {
    const catRows = await db.select<{ name: string }>(
      'SELECT name FROM categories WHERE id = ?',
      [data.categoryId]
    );
    const catName = catRows[0]?.name ?? '';
    catCode = catName
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z]/g, '')
      .toUpperCase()
      .slice(0, 4)
      .padEnd(4, 'X');
  }
  const itemNumber = `JIA-${catCode}-${String(seq).padStart(4, '0')}`;

  await db.execute(
    `INSERT INTO items (
      id, item_number, name, short_name, category_id, unit_name, pack_name,
      qty_per_pack, cost_price, selling_price, qty_semi_gros, price_semi_gros,
      qty_gros, price_gros, reorder_level, receiving_quantity, photo_path, deleted
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 0)`,
    [id, itemNumber, data.name, data.shortName, data.categoryId, data.unitName,
     data.packName, data.qtyPerPack, data.costPrice, data.sellingPrice,
     data.qtySemiGros, data.priceSemiGros, data.qtyGros, data.priceGros,
     data.reorderLevel, data.receivingQuantity]
  );
  return id;
}

export async function updateItemTx(db: Db, id: UUID, data: ItemFormData): Promise<void> {
  await db.execute(
    `UPDATE items SET
      name = ?, short_name = ?, category_id = ?, unit_name = ?, pack_name = ?,
      qty_per_pack = ?, cost_price = ?, selling_price = ?, qty_semi_gros = ?,
      price_semi_gros = ?, qty_gros = ?, price_gros = ?, reorder_level = ?,
      receiving_quantity = ?, updated_at = datetime('now')
    WHERE id = ?`,
    [data.name, data.shortName, data.categoryId, data.unitName, data.packName,
     data.qtyPerPack, data.costPrice, data.sellingPrice, data.qtySemiGros,
     data.priceSemiGros, data.qtyGros, data.priceGros, data.reorderLevel,
     data.receivingQuantity, id]
  );
}

export async function deleteItemTx(db: Db, id: UUID): Promise<void> {
  // Soft delete uniquement (règle n°5)
  await db.execute(
    "UPDATE items SET deleted = 1, updated_at = datetime('now') WHERE id = ?",
    [id]
  );
}

export async function createSupplierTx(
  db: Db,
  params: { name: string; phone: string | null; category: string | null }
): Promise<UUID> {
  if (!params.name.trim()) throw new Error('Le nom du fournisseur est obligatoire.');
  const id = crypto.randomUUID();
  await db.execute(
    'INSERT INTO suppliers (id, name, phone, category, deleted) VALUES (?, ?, ?, ?, 0)',
    [id, params.name.trim(), params.phone, params.category]
  );
  return id;
}

// ─── Utilisateurs (admin.users) ────────────────────────────────────

export interface AppUser {
  id: UUID;
  username: string;
  full_name: string;
  role: 'admin' | 'caissier';
  failed_attempts: number;
  locked_until: string | null;
  deleted: number;
}

/** Liste des utilisateurs (sans les hash PIN), désactivés compris. */
export async function listUsers(db: Db): Promise<AppUser[]> {
  return db.select<AppUser>(
    `SELECT id, username, full_name, role, failed_attempts, locked_until, deleted
     FROM users ORDER BY username`
  );
}

/**
 * La connexion se fait par PIN seul : deux comptes actifs ne peuvent
 * pas partager le même PIN, sinon l'un des deux devient injoignable.
 */
async function assertPinAvailable(db: Db, pin: string, excludeUserId?: UUID): Promise<void> {
  const { verifyPin } = await import('@/modules/auth/pinHasher');
  const rows = await db.select<{ id: UUID; pin_hash: string }>(
    'SELECT id, pin_hash FROM users WHERE deleted = 0'
  );
  for (const row of rows) {
    if (excludeUserId && row.id === excludeUserId) continue;
    if (await verifyPin(pin, row.pin_hash)) {
      throw new Error('Ce PIN est déjà utilisé par un autre compte.');
    }
  }
}

export async function createUserTx(
  db: Db,
  params: { username: string; fullName: string; role: 'admin' | 'caissier'; pin: string }
): Promise<UUID> {
  const username = params.username.trim().toLowerCase();
  if (!username) throw new Error("Le nom d'utilisateur est obligatoire.");
  if (!params.fullName.trim()) throw new Error('Le nom complet est obligatoire.');

  const { validatePinFormat, hashPin } = await import('@/modules/auth/pinHasher');
  const pinError = validatePinFormat(params.pin);
  if (pinError) throw new Error(pinError);

  const existing = await db.select<{ id: string }>(
    'SELECT id FROM users WHERE username = ?',
    [username]
  );
  if (existing.length > 0) {
    throw new Error(`Le nom d'utilisateur « ${username} » existe déjà.`);
  }

  await assertPinAvailable(db, params.pin);
  const pinHash = await hashPin(params.pin);
  const id = crypto.randomUUID();

  const { getGrantsForUser } = await import('@/core/db/seed');
  await withTransaction(db, async (tx) => {
    await tx.execute(
      'INSERT INTO users (id, username, pin_hash, full_name, role) VALUES (?, ?, ?, ?, ?)',
      [id, username, pinHash, params.fullName.trim(), params.role]
    );
    for (const grant of getGrantsForUser(id, params.role)) {
      await tx.execute(
        'INSERT OR IGNORE INTO user_grants (id, user_id, permission_id) VALUES (?, ?, ?)',
        [grant.id, grant.user_id, grant.permission_id]
      );
    }
  });
  return id;
}

/** Change le PIN d'un compte (et déverrouille au passage). */
export async function updateUserPinTx(
  db: Db,
  params: { userId: UUID; pin: string }
): Promise<void> {
  const { validatePinFormat, hashPin } = await import('@/modules/auth/pinHasher');
  const pinError = validatePinFormat(params.pin);
  if (pinError) throw new Error(pinError);

  await assertPinAvailable(db, params.pin, params.userId);
  const pinHash = await hashPin(params.pin);
  await db.execute(
    'UPDATE users SET pin_hash = ?, failed_attempts = 0, locked_until = NULL WHERE id = ?',
    [pinHash, params.userId]
  );
}

/**
 * Active / désactive un compte (soft delete).
 * Garde-fous : pas son propre compte, jamais le dernier Admin actif.
 */
export async function setUserActiveTx(
  db: Db,
  params: { userId: UUID; active: boolean; currentUserId: UUID }
): Promise<void> {
  if (!params.active) {
    if (params.userId === params.currentUserId) {
      throw new Error('Impossible de désactiver votre propre compte.');
    }
    const target = await db.select<{ role: string }>(
      'SELECT role FROM users WHERE id = ?',
      [params.userId]
    );
    if (target[0]?.role === 'admin') {
      const admins = await db.select<{ cnt: number }>(
        "SELECT COUNT(*) as cnt FROM users WHERE role = 'admin' AND deleted = 0 AND id != ?",
        [params.userId]
      );
      if ((admins[0]?.cnt ?? 0) === 0) {
        throw new Error('Impossible de désactiver le dernier compte Admin.');
      }
    }
  }
  await db.execute('UPDATE users SET deleted = ? WHERE id = ?', [
    params.active ? 0 : 1,
    params.userId,
  ]);
}

/** Déverrouille un compte bloqué après 5 échecs. */
export async function unlockUserTx(db: Db, userId: UUID): Promise<void> {
  await db.execute(
    'UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = ?',
    [userId]
  );
}

// ─── Synchronisation (Phase 5) ─────────────────────────────────────

export interface SyncRunResult {
  pushed: number;
  online: boolean;
  error: string | null;
}

/**
 * Pousse la file sync_queue vers le serveur (batchs de 100,
 * idempotent par UUID d'événement — S35) puis marque synced_at.
 */
export async function runSync(db: Db): Promise<SyncRunResult> {
  const enabled = (await getConfig(db, 'sync_enabled')) === 'true';
  const online = typeof navigator !== 'undefined' ? navigator.onLine : true;
  if (!enabled) return { pushed: 0, online, error: null };

  const serverUrl = (await getConfig(db, 'sync_server_url')) ?? 'http://localhost:3001';
  const shopId = (await getConfig(db, 'shop_id')) ?? 'shop-01';
  const token = await getConfig(db, 'sync_token');
  let pushed = 0;

  try {
    // Batchs de 100 jusqu'à épuisement de la file
    for (;;) {
      const events = await db.select<{
        id: string;
        event_type: string;
        entity_id: string;
        payload: string;
        created_at: string;
      }>(
        'SELECT * FROM sync_queue WHERE synced_at IS NULL ORDER BY created_at LIMIT 100'
      );
      if (events.length === 0) break;

      const response = await fetch(`${serverUrl}/sync/push`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ shop_id: shopId, events }),
      });
      if (!response.ok) {
        throw new Error(`Serveur sync : HTTP ${response.status}`);
      }

      const ids = events.map((e) => e.id);
      const placeholders = ids.map(() => '?').join(',');
      await db.execute(
        `UPDATE sync_queue SET synced_at = datetime('now') WHERE id IN (${placeholders})`,
        ids
      );
      pushed += events.length;
    }

    return { pushed, online: true, error: null };
  } catch (e) {
    return {
      pushed,
      online: false,
      error: e instanceof Error ? e.message : 'Erreur sync inconnue',
    };
  }
}

// ─── Intégrité ─────────────────────────────────────────────────────

/** Audit S36 : le cache item_quantities doit égaler Σ ledger. */
export async function verifyLedgerIntegrityDb(
  db: Db
): Promise<{ ok: boolean; discrepancies: { itemId: string; ledger: number; cache: number }[] }> {
  const rows = await db.select<{ item_id: string; ledger_sum: number; cached: number | null }>(
    `SELECT i.item_id, COALESCE(SUM(i.quantity), 0) as ledger_sum, iq.quantity as cached
     FROM inventory i
     LEFT JOIN item_quantities iq ON iq.item_id = i.item_id
     GROUP BY i.item_id`
  );
  const discrepancies = rows
    .filter((r) => Math.abs(r.ledger_sum - (r.cached ?? 0)) > 0.001)
    .map((r) => ({ itemId: r.item_id, ledger: r.ledger_sum, cache: r.cached ?? 0 }));
  return { ok: discrepancies.length === 0, discrepancies };
}
