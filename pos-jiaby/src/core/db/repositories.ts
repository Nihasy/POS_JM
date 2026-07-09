/**
 * Repositories — Accès typé à la base SQLite.
 *
 * Chaque repository expose des méthodes avec des requêtes préparées.
 * Les repositories sont utilisés par les modules UI pour accéder aux données.
 *
 * En environnement Tauri, ces fonctions utilisent @tauri-apps/plugin-sql.
 * En test, on mocke les repositories.
 */

import type { UUID } from '@/core/domain/types';
import type {
  Item,
  Category,
  InventoryTransaction,
  Sale,
  SaleItem,
  SalePayment,
  Customer,
  CashupSession,
  CashupExpense,
  SyncQueueEvent,
} from '@/core/domain/types';

// ─── Helpers ───────────────────────────────────────────────────────

/** Interface minimale pour la DB Tauri SQL */
interface Db {
  execute(sql: string, params?: unknown[]): Promise<{ rows: unknown[] }>;
  select<T>(sql: string, params?: unknown[]): Promise<T[]>;
}

// ─── Item Repository ───────────────────────────────────────────────

export class ItemRepo {
  constructor(private db: Db) {}

  async findAll(includeDeleted = false): Promise<Item[]> {
    const where = includeDeleted ? '' : 'WHERE deleted = 0';
    return this.db.select<Item>(`SELECT * FROM items ${where} ORDER BY name`);
  }

  async findById(id: UUID): Promise<Item | null> {
    const rows = await this.db.select<Item>(
      'SELECT * FROM items WHERE id = ?',
      [id]
    );
    return rows[0] ?? null;
  }

  async findByNumber(itemNumber: string): Promise<Item | null> {
    const rows = await this.db.select<Item>(
      'SELECT * FROM items WHERE item_number = ? AND deleted = 0',
      [itemNumber]
    );
    return rows[0] ?? null;
  }

  async search(query: string): Promise<Item[]> {
    const pattern = `%${query}%`;
    return this.db.select<Item>(
      `SELECT * FROM items
       WHERE deleted = 0
         AND (name LIKE ? OR short_name LIKE ? OR item_number LIKE ?)
       ORDER BY name
       LIMIT 50`,
      [pattern, pattern, pattern]
    );
  }

  async findByCategory(categoryId: UUID): Promise<Item[]> {
    return this.db.select<Item>(
      'SELECT * FROM items WHERE category_id = ? AND deleted = 0 ORDER BY name',
      [categoryId]
    );
  }

  async create(item: Omit<Item, 'created_at' | 'updated_at'>): Promise<void> {
    await this.db.execute(
      `INSERT INTO items (
        id, item_number, name, short_name, category_id,
        unit_name, pack_name, qty_per_pack,
        cost_price, selling_price,
        qty_semi_gros, price_semi_gros, qty_gros, price_gros,
        reorder_level, receiving_quantity, photo_path, deleted
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        item.id, item.item_number, item.name, item.short_name,
        item.category_id, item.unit_name, item.pack_name,
        item.qty_per_pack, item.cost_price, item.selling_price,
        item.qty_semi_gros, item.price_semi_gros,
        item.qty_gros, item.price_gros,
        item.reorder_level, item.receiving_quantity,
        item.photo_path, item.deleted,
      ]
    );
  }

  async update(id: UUID, updates: Partial<Item>): Promise<void> {
    const fields: string[] = [];
    const values: unknown[] = [];

    const allowedFields = [
      'name', 'short_name', 'category_id', 'unit_name',
      'pack_name', 'qty_per_pack', 'cost_price', 'selling_price',
      'qty_semi_gros', 'price_semi_gros', 'qty_gros', 'price_gros',
      'reorder_level', 'receiving_quantity', 'photo_path',
    ];

    for (const field of allowedFields) {
      if (field in updates) {
        fields.push(`${field} = ?`);
        values.push((updates as Record<string, unknown>)[field]);
      }
    }

    if (fields.length === 0) return;

    fields.push('updated_at = datetime(\'now\')');
    values.push(id);

    await this.db.execute(
      `UPDATE items SET ${fields.join(', ')} WHERE id = ?`,
      values
    );
  }

  async softDelete(id: UUID): Promise<void> {
    await this.db.execute(
      'UPDATE items SET deleted = 1, updated_at = datetime(\'now\') WHERE id = ?',
      [id]
    );
  }

  async getNextSequence(): Promise<number> {
    const rows = await this.db.select<{ cnt: number }>(
      'SELECT COUNT(*) + 1 as cnt FROM items'
    );
    return rows[0]?.cnt ?? 1;
  }
}

// ─── Inventory Repository ──────────────────────────────────────────

export class InventoryRepo {
  constructor(private db: Db) {}

  async getQuantity(itemId: UUID): Promise<number> {
    const rows = await this.db.select<{ qty: number }>(
      'SELECT COALESCE(SUM(quantity), 0) as qty FROM inventory WHERE item_id = ?',
      [itemId]
    );
    return rows[0]?.qty ?? 0;
  }

  async getTransactionsByItem(itemId: UUID): Promise<InventoryTransaction[]> {
    return this.db.select<InventoryTransaction>(
      'SELECT * FROM inventory WHERE item_id = ? ORDER BY created_at DESC',
      [itemId]
    );
  }

  async insert(tx: Omit<InventoryTransaction, 'created_at'>): Promise<void> {
    await this.db.execute(
      `INSERT INTO inventory (id, item_id, quantity, cost_price, ref_type, ref_id, user_id, comment)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [tx.id, tx.item_id, tx.quantity, tx.cost_price, tx.ref_type, tx.ref_id, tx.user_id, tx.comment]
    );
  }

  async updateQuantityCache(itemId: UUID): Promise<void> {
    await this.db.execute(
      `INSERT INTO item_quantities (item_id, quantity)
       VALUES (?, (SELECT COALESCE(SUM(quantity), 0) FROM inventory WHERE item_id = ?))
       ON CONFLICT(item_id) DO UPDATE SET quantity = excluded.quantity`,
      [itemId, itemId]
    );
  }

  async getLedgerForIntegrity(): Promise<{ item_id: UUID; ledger_sum: number }[]> {
    return this.db.select<{ item_id: UUID; ledger_sum: number }>(
      'SELECT item_id, COALESCE(SUM(quantity), 0) as ledger_sum FROM inventory GROUP BY item_id'
    );
  }

  async getQuantityCache(): Promise<{ item_id: UUID; quantity: number }[]> {
    return this.db.select<{ item_id: UUID; quantity: number }>(
      'SELECT item_id, quantity FROM item_quantities'
    );
  }
}

// ─── Category Repository ───────────────────────────────────────────

export class CategoryRepo {
  constructor(private db: Db) {}

  async findAll(): Promise<Category[]> {
    return this.db.select<Category>(
      'SELECT * FROM categories ORDER BY sort_order, name'
    );
  }

  async create(cat: Omit<Category, 'id'> & { id: UUID }): Promise<void> {
    await this.db.execute(
      'INSERT INTO categories (id, name, parent_id, sort_order) VALUES (?, ?, ?, ?)',
      [cat.id, cat.name, cat.parent_id, cat.sort_order]
    );
  }

  async update(id: UUID, updates: Partial<Category>): Promise<void> {
    const fields: string[] = [];
    const values: unknown[] = [];

    if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name); }
    if (updates.parent_id !== undefined) { fields.push('parent_id = ?'); values.push(updates.parent_id); }
    if (updates.sort_order !== undefined) { fields.push('sort_order = ?'); values.push(updates.sort_order); }

    if (fields.length === 0) return;
    values.push(id);

    await this.db.execute(
      `UPDATE categories SET ${fields.join(', ')} WHERE id = ?`,
      values
    );
  }

  async delete(id: UUID): Promise<void> {
    await this.db.execute('DELETE FROM categories WHERE id = ?', [id]);
  }
}

// ─── Sale Repository ───────────────────────────────────────────────

export class SaleRepo {
  constructor(private db: Db) {}

  async getNextSaleNumber(year: number, prefix: string): Promise<string> {
    const rows = await this.db.select<{ cnt: number }>(
      `SELECT COUNT(*) + 1 as cnt FROM sales
       WHERE sale_number LIKE ? AND created_at >= ?`,
      [`${prefix}-${year}-%`, `${year}-01-01`]
    );
    const seq = rows[0]?.cnt ?? 1;
    return `${prefix}-${year}-${String(seq).padStart(5, '0')}`;
  }

  async create(sale: Omit<Sale, 'created_at'>): Promise<void> {
    await this.db.execute(
      `INSERT INTO sales (
        id, sale_number, customer_id, user_id, status,
        subtotal, discount_global_percent, discount_global_amount, total,
        is_quote, is_return, original_sale_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        sale.id, sale.sale_number, sale.customer_id, sale.user_id, sale.status,
        sale.subtotal, sale.discount_global_percent, sale.discount_global_amount,
        sale.total, sale.is_quote, sale.is_return, sale.original_sale_id,
      ]
    );
  }

  async createItem(item: Omit<SaleItem, 'id'> & { id: UUID }): Promise<void> {
    await this.db.execute(
      `INSERT INTO sales_items (
        id, sale_id, item_id, name_snapshot, quantity,
        catalog_price, applied_price, discount_percent, discount_amount,
        line_total, cost_price_snapshot, tier_applied
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        item.id, item.sale_id, item.item_id, item.name_snapshot,
        item.quantity, item.catalog_price, item.applied_price,
        item.discount_percent, item.discount_amount,
        item.line_total, item.cost_price_snapshot, item.tier_applied,
      ]
    );
  }

  async createPayment(payment: Omit<SalePayment, 'id'> & { id: UUID }): Promise<void> {
    await this.db.execute(
      `INSERT INTO sales_payments (id, sale_id, method, amount, reference, change_given)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [payment.id, payment.sale_id, payment.method, payment.amount,
       payment.reference, payment.change_given]
    );
  }

  async findByDateRange(start: string, end: string): Promise<Sale[]> {
    return this.db.select<Sale>(
      'SELECT * FROM sales WHERE created_at BETWEEN ? AND ? AND status = \'COMPLETED\' ORDER BY created_at DESC',
      [start, end]
    );
  }

  async getSuspendedSales(): Promise<Sale[]> {
    return this.db.select<Sale>(
      'SELECT * FROM sales WHERE status = \'SUSPENDED\' AND is_quote = 0 ORDER BY created_at DESC'
    );
  }

  async updateStatus(id: UUID, status: string): Promise<void> {
    await this.db.execute(
      'UPDATE sales SET status = ? WHERE id = ?',
      [status, id]
    );
  }
}

// ─── Customer Repository ───────────────────────────────────────────

export class CustomerRepo {
  constructor(private db: Db) {}

  async findAll(includeDeleted = false): Promise<Customer[]> {
    const where = includeDeleted ? '' : 'WHERE deleted = 0';
    return this.db.select<Customer>(
      `SELECT * FROM customers ${where} ORDER BY last_name, first_name`
    );
  }

  async findById(id: UUID): Promise<Customer | null> {
    const rows = await this.db.select<Customer>(
      'SELECT * FROM customers WHERE id = ?',
      [id]
    );
    return rows[0] ?? null;
  }

  async search(query: string): Promise<Customer[]> {
    const pattern = `%${query}%`;
    return this.db.select<Customer>(
      `SELECT * FROM customers
       WHERE deleted = 0 AND (last_name LIKE ? OR first_name LIKE ? OR phone LIKE ?)
       ORDER BY last_name LIMIT 20`,
      [pattern, pattern, pattern]
    );
  }

  async create(customer: Omit<Customer, 'created_at' | 'updated_at'>): Promise<void> {
    await this.db.execute(
      `INSERT INTO customers (id, first_name, last_name, phone, email, balance_due, credit_limit, deleted)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [customer.id, customer.first_name, customer.last_name,
       customer.phone, customer.email, customer.balance_due,
       customer.credit_limit, customer.deleted]
    );
  }

  async updateBalance(id: UUID, newBalance: number): Promise<void> {
    await this.db.execute(
      'UPDATE customers SET balance_due = ?, updated_at = datetime(\'now\') WHERE id = ?',
      [newBalance, id]
    );
  }
}

// ─── Cashup Repository ─────────────────────────────────────────────

export class CashupRepo {
  constructor(private db: Db) {}

  async findOpenSession(): Promise<CashupSession | null> {
    const rows = await this.db.select<CashupSession>(
      'SELECT * FROM cashup_sessions WHERE closed_at IS NULL ORDER BY opened_at DESC LIMIT 1'
    );
    return rows[0] ?? null;
  }

  async create(session: Omit<CashupSession, 'opened_at' | 'closed_at'>): Promise<void> {
    await this.db.execute(
      `INSERT INTO cashup_sessions (id, user_id, opening_amount)
       VALUES (?, ?, ?)`,
      [session.id, session.user_id, session.opening_amount]
    );
  }

  async close(id: UUID, params: {
    closing_amount: number;
    expected_cash: number;
    counted_cash: number;
    cash_difference: number;
    note: string | null;
  }): Promise<void> {
    await this.db.execute(
      `UPDATE cashup_sessions
       SET closing_amount = ?, expected_cash = ?, counted_cash = ?,
           cash_difference = ?, note = ?, closed_at = datetime('now')
       WHERE id = ?`,
      [params.closing_amount, params.expected_cash, params.counted_cash,
       params.cash_difference, params.note, id]
    );
  }

  async createExpense(expense: Omit<CashupExpense, 'id' | 'created_at'> & { id: UUID }): Promise<void> {
    await this.db.execute(
      `INSERT INTO cashup_expenses (id, session_id, category, amount, reason)
       VALUES (?, ?, ?, ?, ?)`,
      [expense.id, expense.session_id, expense.category, expense.amount, expense.reason]
    );
  }
}

// ─── Sync Queue Repository ─────────────────────────────────────────

export class SyncRepo {
  constructor(private db: Db) {}

  async enqueue(event: Omit<SyncQueueEvent, 'id' | 'created_at' | 'synced_at' | 'retry_count'> & { id: UUID }): Promise<void> {
    await this.db.execute(
      `INSERT INTO sync_queue (id, event_type, entity_id, payload)
       VALUES (?, ?, ?, ?)`,
      [event.id, event.event_type, event.entity_id, event.payload]
    );
  }

  async getPending(limit = 100): Promise<SyncQueueEvent[]> {
    return this.db.select<SyncQueueEvent>(
      'SELECT * FROM sync_queue WHERE synced_at IS NULL AND retry_count < 5 ORDER BY created_at LIMIT ?',
      [limit]
    );
  }

  async markSynced(ids: UUID[]): Promise<void> {
    const placeholders = ids.map(() => '?').join(',');
    await this.db.execute(
      `UPDATE sync_queue SET synced_at = datetime('now') WHERE id IN (${placeholders})`,
      ids
    );
  }

  async pendingCount(): Promise<number> {
    const rows = await this.db.select<{ cnt: number }>(
      'SELECT COUNT(*) as cnt FROM sync_queue WHERE synced_at IS NULL'
    );
    return rows[0]?.cnt ?? 0;
  }
}
