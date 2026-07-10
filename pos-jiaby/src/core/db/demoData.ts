/**
 * Données de démonstration — mode navigateur uniquement (dev + E2E).
 *
 * JAMAIS chargées sous Tauri : la production démarre avec un
 * catalogue vide, rempli par l'import historique (Phase 1.5).
 */

import type { Db } from './index';
import { withTransaction } from './index';

const DEMO_ITEMS = [
  {
    id: 'd0000001-0001-4000-8000-000000000001',
    item_number: 'JIA-CABL-0001',
    name: 'Câble 2,5 mm² (m)',
    short_name: 'Câble 2,5mm²',
    category: 'Câbles et cordons',
    unit_name: 'm',
    pack_name: 'rouleau',
    qty_per_pack: 100,
    cost_price: 2500,
    selling_price: 4000,
    qty_semi_gros: 20,
    price_semi_gros: 3500,
    qty_gros: 100,
    price_gros: 3000,
    reorder_level: 50,
    stock: 200,
  },
  {
    id: 'd0000001-0001-4000-8000-000000000002',
    item_number: 'JIA-TORC-0002',
    name: 'Torche LED rechargeable',
    short_name: 'Torche LED',
    category: 'Torches',
    unit_name: 'pièce',
    pack_name: 'carton',
    qty_per_pack: 24,
    cost_price: 8000,
    selling_price: 15000,
    qty_semi_gros: 6,
    price_semi_gros: 13000,
    qty_gros: 24,
    price_gros: 11000,
    reorder_level: 10,
    stock: 48,
  },
  {
    id: 'd0000001-0001-4000-8000-000000000003',
    item_number: 'JIA-SOLA-0003',
    name: 'Panneau solaire 50 W',
    short_name: 'Panneau 50W',
    category: 'Solaire',
    unit_name: 'pièce',
    pack_name: null,
    qty_per_pack: null,
    cost_price: 90000,
    selling_price: 150000,
    qty_semi_gros: null,
    price_semi_gros: null,
    qty_gros: null,
    price_gros: null,
    reorder_level: 3,
    stock: 8,
  },
  {
    id: 'd0000001-0001-4000-8000-000000000004',
    item_number: 'JIA-ELEC-0004',
    name: 'Ampoule LED E27 9 W',
    short_name: 'Ampoule 9W',
    category: 'Électricité',
    unit_name: 'pièce',
    pack_name: 'boîte',
    qty_per_pack: 50,
    cost_price: 1500,
    selling_price: 3000,
    qty_semi_gros: 10,
    price_semi_gros: 2500,
    qty_gros: 50,
    price_gros: 2000,
    reorder_level: 20,
    stock: 150,
  },
];

const DEMO_CUSTOMER = {
  id: 'd0000002-0001-4000-8000-000000000001',
  first_name: 'Jean',
  last_name: 'RAKOTO',
  phone: '034 00 000 00',
  credit_limit: 100000,
};

const DEMO_SUPPLIER = {
  id: 'd0000003-0001-4000-8000-000000000001',
  name: 'Import CN Guangzhou',
  phone: '+86 000 0000',
  category: 'import',
};

/**
 * Insère le catalogue de démonstration si la base est vide.
 * Stock initial via écritures ledger OPENING (règle n°4).
 */
export async function seedDemoData(db: Db): Promise<void> {
  const rows = await db.select<{ cnt: number }>('SELECT COUNT(*) as cnt FROM items');
  if ((rows[0]?.cnt ?? 0) > 0) return;

  const categories = await db.select<{ id: string; name: string }>(
    'SELECT id, name FROM categories'
  );
  const catByName = new Map(categories.map((c) => [c.name, c.id]));

  await withTransaction(db, async (tx) => {
    for (const item of DEMO_ITEMS) {
      await tx.execute(
        `INSERT INTO items (
          id, item_number, name, short_name, category_id, unit_name, pack_name,
          qty_per_pack, cost_price, selling_price, qty_semi_gros, price_semi_gros,
          qty_gros, price_gros, reorder_level, receiving_quantity, photo_path, deleted
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, 0)`,
        [
          item.id, item.item_number, item.name, item.short_name,
          catByName.get(item.category) ?? null, item.unit_name, item.pack_name,
          item.qty_per_pack, item.cost_price, item.selling_price,
          item.qty_semi_gros, item.price_semi_gros, item.qty_gros, item.price_gros,
          item.reorder_level,
        ]
      );

      // Stock initial = écriture ledger OPENING
      await tx.execute(
        `INSERT INTO inventory (id, item_id, quantity, cost_price, ref_type, ref_id, user_id, comment)
         VALUES (?, ?, ?, ?, 'OPENING', ?, 'b0000001-0001-4000-8000-000000000001', 'Stock initial démo')`,
        [crypto.randomUUID(), item.id, item.stock, item.cost_price, crypto.randomUUID()]
      );
      await tx.execute(
        `INSERT INTO item_quantities (item_id, quantity) VALUES (?, ?)
         ON CONFLICT(item_id) DO UPDATE SET quantity = excluded.quantity`,
        [item.id, item.stock]
      );
    }

    await tx.execute(
      `INSERT INTO customers (id, first_name, last_name, phone, email, balance_due, credit_limit, deleted)
       VALUES (?, ?, ?, ?, NULL, 0, ?, 0)`,
      [DEMO_CUSTOMER.id, DEMO_CUSTOMER.first_name, DEMO_CUSTOMER.last_name,
       DEMO_CUSTOMER.phone, DEMO_CUSTOMER.credit_limit]
    );

    await tx.execute(
      'INSERT INTO suppliers (id, name, phone, category, deleted) VALUES (?, ?, ?, ?, 0)',
      [DEMO_SUPPLIER.id, DEMO_SUPPLIER.name, DEMO_SUPPLIER.phone, DEMO_SUPPLIER.category]
    );
  });

  console.log('[Démo] Catalogue de démonstration chargé (mode navigateur).');
}
