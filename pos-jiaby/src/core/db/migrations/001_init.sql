-- ============================================================================
-- JIABY POS — Schéma initial complet (16 tables)
-- Phase 1.1 : toutes les tables sont créées dès maintenant.
-- ============================================================================

-- ─── Catalogue ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS categories (
    id          TEXT PRIMARY KEY,          -- UUID v4
    name        TEXT NOT NULL,
    parent_id   TEXT,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (parent_id) REFERENCES categories(id)
);

CREATE TABLE IF NOT EXISTS items (
    id                  TEXT PRIMARY KEY,      -- UUID v4
    item_number         TEXT NOT NULL UNIQUE,  -- JIA-XXXX-NNNN
    name                TEXT NOT NULL,
    short_name          TEXT NOT NULL DEFAULT '',
    category_id         TEXT,
    unit_name           TEXT NOT NULL DEFAULT 'pièce',
    pack_name           TEXT,
    qty_per_pack        REAL,
    cost_price          INTEGER NOT NULL DEFAULT 0,   -- PMP, en Ariary
    selling_price       INTEGER NOT NULL DEFAULT 0,   -- Prix détail, Ariary
    qty_semi_gros       REAL,                         -- Seuil qté semi-gros
    price_semi_gros     INTEGER,                      -- Prix semi-gros, Ariary
    qty_gros            REAL,                         -- Seuil qté gros
    price_gros          INTEGER,                      -- Prix gros, Ariary
    reorder_level       REAL,                         -- Seuil réappro
    receiving_quantity  REAL,                         -- Qté par défaut en réception
    photo_path          TEXT,
    deleted             INTEGER NOT NULL DEFAULT 0,   -- Soft delete
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (category_id) REFERENCES categories(id)
);

CREATE INDEX idx_items_item_number ON items(item_number);
CREATE INDEX idx_items_name ON items(name);
CREATE INDEX idx_items_category ON items(category_id);

-- ─── Kits ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS item_kits (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    kit_item_id TEXT NOT NULL,              -- Le produit "kit" dans items
    deleted     INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (kit_item_id) REFERENCES items(id)
);

CREATE TABLE IF NOT EXISTS item_kit_items (
    id                TEXT PRIMARY KEY,
    kit_id            TEXT NOT NULL,
    component_item_id TEXT NOT NULL,
    quantity          REAL NOT NULL,        -- Qté du composant nécessaire
    FOREIGN KEY (kit_id) REFERENCES item_kits(id),
    FOREIGN KEY (component_item_id) REFERENCES items(id)
);

-- ─── Stock / Inventory (immutable ledger) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS inventory (
    id          TEXT PRIMARY KEY,
    item_id     TEXT NOT NULL,
    quantity    REAL NOT NULL,              -- Positif = entrée, négatif = sortie
    cost_price  INTEGER,                   -- Coût unitaire au moment de la transaction
    ref_type    TEXT NOT NULL,              -- SALE | RETURN | RECEIVING | ADJUSTMENT | OPENING | MANUAL_OUT
    ref_id      TEXT NOT NULL,
    user_id     TEXT NOT NULL,
    comment     TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (item_id) REFERENCES items(id)
);

CREATE INDEX idx_inventory_item ON inventory(item_id);
CREATE INDEX idx_inventory_ref ON inventory(ref_type, ref_id);
CREATE INDEX idx_inventory_created ON inventory(created_at);

-- ─── Cache qté stock (recalculable) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS item_quantities (
    item_id  TEXT PRIMARY KEY,
    quantity REAL NOT NULL DEFAULT 0,
    FOREIGN KEY (item_id) REFERENCES items(id)
);

-- ─── Clients ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customers (
    id           TEXT PRIMARY KEY,
    first_name   TEXT NOT NULL DEFAULT '',
    last_name    TEXT NOT NULL,
    phone        TEXT,
    email        TEXT,
    balance_due  INTEGER NOT NULL DEFAULT 0,   -- Solde crédit, Ariary
    credit_limit INTEGER NOT NULL DEFAULT 0,   -- Plafond crédit, Ariary
    deleted      INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─── Fournisseurs ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS suppliers (
    id       TEXT PRIMARY KEY,
    name     TEXT NOT NULL,
    phone    TEXT,
    category TEXT,
    deleted  INTEGER NOT NULL DEFAULT 0
);

-- ─── Ventes ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sales (
    id                      TEXT PRIMARY KEY,
    sale_number             TEXT NOT NULL UNIQUE,  -- V-2026-NNNNN, D-..., R-...
    customer_id             TEXT,
    user_id                 TEXT NOT NULL,
    status                  TEXT NOT NULL DEFAULT 'COMPLETED',  -- COMPLETED | SUSPENDED | CANCELLED
    subtotal                INTEGER NOT NULL DEFAULT 0,
    discount_global_percent REAL,
    discount_global_amount  INTEGER,
    total                   INTEGER NOT NULL DEFAULT 0,
    is_quote                INTEGER NOT NULL DEFAULT 0,
    is_return               INTEGER NOT NULL DEFAULT 0,
    original_sale_id        TEXT,
    created_at              TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (customer_id) REFERENCES customers(id),
    FOREIGN KEY (original_sale_id) REFERENCES sales(id)
);

CREATE INDEX idx_sales_time ON sales(created_at);
CREATE INDEX idx_sales_customer ON sales(customer_id);

CREATE TABLE IF NOT EXISTS sales_items (
    id                   TEXT PRIMARY KEY,
    sale_id              TEXT NOT NULL,
    item_id              TEXT NOT NULL,
    name_snapshot        TEXT NOT NULL,
    quantity             REAL NOT NULL,
    catalog_price        INTEGER NOT NULL,
    applied_price        INTEGER NOT NULL,
    discount_percent     REAL,
    discount_amount      INTEGER,
    line_total           INTEGER NOT NULL,
    cost_price_snapshot  INTEGER NOT NULL,   -- Coût FIGÉ (S07)
    tier_applied         TEXT,               -- 'detail' | 'semi-gros' | 'gros'
    FOREIGN KEY (sale_id) REFERENCES sales(id),
    FOREIGN KEY (item_id) REFERENCES items(id)
);

CREATE INDEX idx_sales_items_sale ON sales_items(sale_id);

CREATE TABLE IF NOT EXISTS sales_payments (
    id           TEXT PRIMARY KEY,
    sale_id      TEXT NOT NULL,
    method       TEXT NOT NULL,              -- ESPECES | MVOLA | CREDIT
    amount       INTEGER NOT NULL,
    reference    TEXT,                       -- Obligatoire pour MVOLA
    change_given INTEGER,                    -- Rendu (espèces uniquement)
    FOREIGN KEY (sale_id) REFERENCES sales(id)
);

-- ─── Auth / Utilisateurs ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id              TEXT PRIMARY KEY,
    username        TEXT NOT NULL UNIQUE,
    pin_hash        TEXT NOT NULL,
    full_name       TEXT NOT NULL,
    role            TEXT NOT NULL DEFAULT 'caissier',  -- 'admin' | 'caissier'
    failed_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until    TEXT,
    deleted         INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS permissions (
    id          TEXT PRIMARY KEY,
    module_id   TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_grants (
    id            TEXT PRIMARY KEY,
    user_id       TEXT NOT NULL,
    permission_id TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (permission_id) REFERENCES permissions(id),
    UNIQUE(user_id, permission_id)
);

-- ─── Sessions de caisse ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cashup_sessions (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL,
    opening_amount  INTEGER NOT NULL,
    closing_amount  INTEGER,
    expected_cash   INTEGER,
    counted_cash    INTEGER,
    cash_difference INTEGER,
    note            TEXT,
    opened_at       TEXT NOT NULL DEFAULT (datetime('now')),
    closed_at       TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS cashup_expenses (
    id         TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    category   TEXT NOT NULL,
    amount     INTEGER NOT NULL,
    reason     TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (session_id) REFERENCES cashup_sessions(id)
);

-- ─── Sync ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sync_queue (
    id          TEXT PRIMARY KEY,
    event_type  TEXT NOT NULL,              -- SALE | RECEIVING | ADJUSTMENT | CASHUP | CUSTOMER_PAYMENT
    entity_id   TEXT NOT NULL,
    payload     TEXT NOT NULL,              -- JSON
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    synced_at   TEXT,
    retry_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_sync_pending ON sync_queue(synced_at, retry_count);

-- ─── Configuration ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_config (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- ─── Version de schéma ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS schema_version (
    version   INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Marquer la version 1
INSERT OR IGNORE INTO schema_version (version) VALUES (1);
