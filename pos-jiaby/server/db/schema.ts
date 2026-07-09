/**
 * Schéma PostgreSQL — Drizzle ORM.
 *
 * Mêmes entités que SQLite, pour le serveur de synchronisation.
 * Les UUIDs sont en type TEXT (compatibles SQLite ↔ PostgreSQL).
 */

import { pgTable, text, integer, real, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core';

// ─── Catalogue ─────────────────────────────────────────────────────

export const categories = pgTable('categories', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  parentId: text('parent_id'),
  sortOrder: integer('sort_order').notNull().default(0),
});

export const items = pgTable('items', {
  id: text('id').primaryKey(),
  itemNumber: text('item_number').notNull().unique(),
  name: text('name').notNull(),
  shortName: text('short_name').notNull().default(''),
  categoryId: text('category_id').references(() => categories.id),
  unitName: text('unit_name').notNull().default('pièce'),
  packName: text('pack_name'),
  qtyPerPack: real('qty_per_pack'),
  costPrice: integer('cost_price').notNull().default(0),
  sellingPrice: integer('selling_price').notNull().default(0),
  qtySemiGros: real('qty_semi_gros'),
  priceSemiGros: integer('price_semi_gros'),
  qtyGros: real('qty_gros'),
  priceGros: integer('price_gros'),
  reorderLevel: real('reorder_level'),
  receivingQuantity: real('receiving_quantity'),
  photoPath: text('photo_path'),
  deleted: integer('deleted').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  nameIdx: index('idx_items_name').on(table.name),
  numberIdx: index('idx_items_number').on(table.itemNumber),
}));

// ─── Ventes ────────────────────────────────────────────────────────

export const sales = pgTable('sales', {
  id: text('id').primaryKey(),
  shopId: text('shop_id').notNull(), // Identifiant de la boutique
  saleNumber: text('sale_number').notNull(),
  customerId: text('customer_id'),
  userId: text('user_id').notNull(),
  status: text('status').notNull().default('COMPLETED'),
  subtotal: integer('subtotal').notNull().default(0),
  discountGlobalPercent: real('discount_global_percent'),
  discountGlobalAmount: integer('discount_global_amount'),
  total: integer('total').notNull().default(0),
  isQuote: integer('is_quote').notNull().default(0),
  isReturn: integer('is_return').notNull().default(0),
  originalSaleId: text('original_sale_id'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  shopIdx: index('idx_sales_shop').on(table.shopId),
  timeIdx: index('idx_sales_time').on(table.createdAt),
  uniqueShopNumber: uniqueIndex('idx_sales_shop_number').on(table.shopId, table.saleNumber),
}));

export const salesItems = pgTable('sales_items', {
  id: text('id').primaryKey(),
  saleId: text('sale_id').notNull().references(() => sales.id),
  itemId: text('item_id').notNull(),
  nameSnapshot: text('name_snapshot').notNull(),
  quantity: real('quantity').notNull(),
  catalogPrice: integer('catalog_price').notNull(),
  appliedPrice: integer('applied_price').notNull(),
  discountPercent: real('discount_percent'),
  discountAmount: integer('discount_amount'),
  lineTotal: integer('line_total').notNull(),
  costPriceSnapshot: integer('cost_price_snapshot').notNull(),
  tierApplied: text('tier_applied'),
}, (table) => ({
  saleIdx: index('idx_sales_items_sale').on(table.saleId),
}));

export const salesPayments = pgTable('sales_payments', {
  id: text('id').primaryKey(),
  saleId: text('sale_id').notNull().references(() => sales.id),
  method: text('method').notNull(),
  amount: integer('amount').notNull(),
  reference: text('reference'),
  changeGiven: integer('change_given'),
});

// ─── Sync ──────────────────────────────────────────────────────────

export const syncEvents = pgTable('sync_events', {
  id: text('id').primaryKey(), // UUID idempotent
  shopId: text('shop_id').notNull(),
  eventType: text('event_type').notNull(),
  entityId: text('entity_id').notNull(),
  payload: text('payload').notNull(), // JSON
  createdAt: timestamp('created_at').notNull().defaultNow(),
  receivedAt: timestamp('received_at').notNull().defaultNow(),
}, (table) => ({
  shopIdx: index('idx_sync_shop').on(table.shopId, table.createdAt),
}));

// ─── Sessions de caisse ────────────────────────────────────────────

export const cashupSessions = pgTable('cashup_sessions', {
  id: text('id').primaryKey(),
  shopId: text('shop_id').notNull(),
  userId: text('user_id').notNull(),
  openingAmount: integer('opening_amount').notNull(),
  closingAmount: integer('closing_amount'),
  expectedCash: integer('expected_cash'),
  countedCash: integer('counted_cash'),
  cashDifference: integer('cash_difference'),
  note: text('note'),
  openedAt: timestamp('opened_at').notNull().defaultNow(),
  closedAt: timestamp('closed_at'),
});

// ─── Clients ───────────────────────────────────────────────────────

export const customers = pgTable('customers', {
  id: text('id').primaryKey(),
  shopId: text('shop_id').notNull(),
  firstName: text('first_name').notNull().default(''),
  lastName: text('last_name').notNull(),
  phone: text('phone'),
  email: text('email'),
  balanceDue: integer('balance_due').notNull().default(0),
  creditLimit: integer('credit_limit').notNull().default(0),
  deleted: integer('deleted').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
