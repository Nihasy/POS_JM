"""Prototype de validation du CDC POS JIABY v2 — règles métier + scénarios."""
import uuid, sqlite3

db = sqlite3.connect(":memory:")
db.executescript("""
CREATE TABLE items(item_id TEXT PRIMARY KEY, name TEXT, category TEXT, cost_price INT DEFAULT 0,
 unit_price INT, price_semi_gros INT, qty_semi_gros REAL, price_gros INT, qty_gros REAL,
 reorder_level REAL DEFAULT 0, unit_name TEXT DEFAULT 'pièce', item_number TEXT, deleted INT DEFAULT 0);
CREATE TABLE inventory(trans_id TEXT, item_id TEXT, trans_user TEXT, trans_date TEXT,
 trans_comment TEXT, trans_inventory REAL, ref_type TEXT, ref_id TEXT);
CREATE TABLE item_kits(kit_id TEXT PRIMARY KEY, name TEXT, kit_price INT);
CREATE TABLE item_kit_items(kit_id TEXT, item_id TEXT, quantity REAL);
CREATE TABLE sales(sale_id TEXT PRIMARY KEY, number TEXT, status TEXT, sale_type TEXT,
 customer_id TEXT, employee_id TEXT, deleted INT DEFAULT 0);
CREATE TABLE sales_items(sale_id TEXT, item_id TEXT, quantity REAL, cost_price INT,
 catalog_price INT, applied_price INT, discount REAL, discount_type TEXT);
CREATE TABLE sales_payments(sale_id TEXT, payment_type TEXT, amount INT, reference TEXT);
CREATE TABLE customers(customer_id TEXT PRIMARY KEY, name TEXT, balance_due INT DEFAULT 0, credit_limit INT DEFAULT 0);
CREATE TABLE receivings(receiving_id TEXT PRIMARY KEY, supplier TEXT, reference TEXT);
CREATE TABLE cashups(cashup_id TEXT PRIMARY KEY, open_cash INT, closed_cash INT, closed_mvola INT,
 expected_cash INT, variance INT, status TEXT);
CREATE TABLE expenses(expense_id TEXT, cashup_id TEXT, amount INT, category TEXT);
CREATE TABLE sync_queue(id TEXT PRIMARY KEY, entity TEXT, entity_id TEXT, op TEXT, synced INT DEFAULT 0);
CREATE TABLE counters(year TEXT, kind TEXT, n INT);
""")

def uid(): return str(uuid.uuid4())
def q(item_id):  # stock = somme du ledger (règle clé)
    r = db.execute("SELECT COALESCE(SUM(trans_inventory),0) FROM inventory WHERE item_id=?", (item_id,)).fetchone()
    return r[0]
def ledger(item_id, qty, ref_type, ref_id, user="admin", comment=""):
    db.execute("INSERT INTO inventory VALUES(?,?,?,datetime('now'),?,?,?,?)",
               (uid(), item_id, user, comment, qty, ref_type, ref_id))
def enqueue(entity, entity_id, op):
    db.execute("INSERT OR IGNORE INTO sync_queue VALUES(?,?,?,?,0)", (f"{entity}:{entity_id}:{op}", entity, entity_id, op))
def next_number(kind, year="2026"):
    row = db.execute("SELECT n FROM counters WHERE year=? AND kind=?", (year, kind)).fetchone()
    n = (row[0] if row else 0) + 1
    db.execute("DELETE FROM counters WHERE year=? AND kind=?", (year, kind))
    db.execute("INSERT INTO counters VALUES(?,?,?)", (year, kind, n))
    return f"{kind}-{year}-{n:05d}"

def create_item(name, cat, unit_price, semi=None, qty_semi=None, gros=None, qty_gros=None, unit="pièce", reorder=0):
    i = uid()
    db.execute("INSERT INTO items(item_id,name,category,unit_price,price_semi_gros,qty_semi_gros,price_gros,qty_gros,unit_name,reorder_level,item_number) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
               (i, name, cat, unit_price, semi, qty_semi, gros, qty_gros, unit, reorder, f"JIA-{name[:4].upper()}-{i[:6]}"))
    return i

def receive(item_id, qty_units, cost_unit, supplier, ref):
    """Réception : ledger + recalcul PMP pondéré. Retourne nb d'étiquettes QR à imprimer."""
    rid = uid()
    old_q, old_pmp = q(item_id), db.execute("SELECT cost_price FROM items WHERE item_id=?", (item_id,)).fetchone()[0]
    db.execute("INSERT INTO receivings VALUES(?,?,?)", (rid, supplier, ref))
    ledger(item_id, qty_units, "RECEIVING", rid, comment=ref)
    new_pmp = round((old_q * old_pmp + qty_units * cost_unit) / (old_q + qty_units)) if (old_q + qty_units) > 0 else cost_unit
    db.execute("UPDATE items SET cost_price=? WHERE item_id=?", (new_pmp, item_id))
    enqueue("receiving", rid, "create")
    return {"labels_to_print": int(qty_units), "new_pmp": new_pmp}

def tier_price(item, qty):
    """Palier automatique : gros > semi-gros > détail."""
    if item["price_gros"] and qty >= item["qty_gros"]: return item["price_gros"], "gros"
    if item["price_semi_gros"] and qty >= item["qty_semi_gros"]: return item["price_semi_gros"], "semi-gros"
    return item["unit_price"], "détail"

def get_item(i):
    r = db.execute("SELECT item_id,name,cost_price,unit_price,price_semi_gros,qty_semi_gros,price_gros,qty_gros FROM items WHERE item_id=?", (i,)).fetchone()
    return dict(zip(["item_id","name","cost_price","unit_price","price_semi_gros","qty_semi_gros","price_gros","qty_gros"], r))

def line_total(line):
    t = line["applied_price"] * line["quantity"]
    if line["discount_type"] == "%": t *= (1 - line["discount"]/100)
    elif line["discount_type"] == "Ar": t -= line["discount"]
    return round(t)

class Sale:
    def __init__(self, employee="caissier", sale_type="POS", customer_id=None):
        self.id, self.lines, self.payments = uid(), [], []
        self.type, self.customer_id, self.employee = sale_type, customer_id, employee
        self.global_discount_pct = 0
    def add(self, item_id, qty, negotiated_price=None, discount=0, discount_type=None):
        it = get_item(item_id)
        catalog, tier = tier_price(it, qty)
        self.lines.append({"item_id": item_id, "quantity": qty, "cost_price": it["cost_price"],
            "catalog_price": catalog, "applied_price": negotiated_price or catalog,
            "discount": discount, "discount_type": discount_type, "tier": tier})
    def add_kit(self, kit_id):
        kit = db.execute("SELECT name,kit_price FROM item_kits WHERE kit_id=?", (kit_id,)).fetchone()
        comps = db.execute("SELECT item_id,quantity FROM item_kit_items WHERE kit_id=?", (kit_id,)).fetchall()
        for cid, cq in comps:
            if q(cid) < cq: raise ValueError(f"Composant kit insuffisant: {get_item(cid)['name']}")
        total_cost = sum(get_item(c)["cost_price"] * cq for c, cq in comps)
        self.lines.append({"kit": True, "kit_id": kit_id, "components": comps, "quantity": 1,
            "cost_price": total_cost, "catalog_price": kit[1], "applied_price": kit[1],
            "discount": 0, "discount_type": None, "tier": "kit"})
    def total(self):
        t = sum(line_total(l) for l in self.lines)
        return round(t * (1 - self.global_discount_pct/100))
    def pay(self, ptype, amount, reference=None):
        self.payments.append({"type": ptype, "amount": amount, "reference": reference})
    def suspend(self):
        db.execute("INSERT INTO sales(sale_id,number,status,sale_type,customer_id,employee_id) VALUES(?,?,?,?,?,?)",
                   (self.id, None, "SUSPENDED", self.type, self.customer_id, self.employee))
        return self.id
    def finalize(self, allow_negative_stock=False, admin_pin=False):
        # 1. contrôle stock
        for l in self.lines:
            checks = l["components"] if l.get("kit") else [(l["item_id"], l["quantity"])]
            for iid, iq in checks:
                if q(iid) < iq and not allow_negative_stock:
                    raise ValueError(f"Stock insuffisant: {get_item(iid)['name']} (dispo {q(iid)}, demandé {iq})")
        # 2. contrôle paiement
        total = self.total()
        paid = sum(p["amount"] for p in self.payments)
        credit = next((p for p in self.payments if p["type"] == "CREDIT"), None)
        if credit:
            if not self.customer_id: raise ValueError("Crédit sans client nommé")
            c = db.execute("SELECT balance_due,credit_limit FROM customers WHERE customer_id=?", (self.customer_id,)).fetchone()
            if c[0] + credit["amount"] > c[1]: raise ValueError("Plafond de crédit dépassé")
        if paid < total: raise ValueError(f"Paiement insuffisant ({paid} < {total})")
        change = paid - total  # rendu monnaie imputé sur espèces
        cash = next((p for p in self.payments if p["type"] == "ESPECES"), None)
        if change > 0:
            if not cash or cash["amount"] < change: raise ValueError("Rendu impossible: trop-perçu non-espèces")
            cash["amount"] -= change
        # 3. écriture atomique
        number = next_number({"POS": "V", "QUOTE": "D", "RETURN": "R"}[self.type])
        with db:  # transaction — tout ou rien (coupure de courant)
            db.execute("INSERT OR REPLACE INTO sales(sale_id,number,status,sale_type,customer_id,employee_id) VALUES(?,?,?,?,?,?)",
                       (self.id, number, "COMPLETED", self.type, self.customer_id, self.employee))
            for l in self.lines:
                db.execute("INSERT INTO sales_items VALUES(?,?,?,?,?,?,?,?)",
                    (self.id, l.get("kit_id") or l["item_id"], l["quantity"], l["cost_price"],
                     l["catalog_price"], l["applied_price"], l["discount"], l["discount_type"]))
                if self.type == "POS":
                    moves = l["components"] if l.get("kit") else [(l["item_id"], l["quantity"])]
                    for iid, iq in moves: ledger(iid, -iq, "SALE", self.id, self.employee)
            for p in self.payments:
                db.execute("INSERT INTO sales_payments VALUES(?,?,?,?)", (self.id, p["type"], p["amount"], p["reference"]))
                if p["type"] == "CREDIT":
                    db.execute("UPDATE customers SET balance_due=balance_due+? WHERE customer_id=?", (p["amount"], self.customer_id))
            enqueue("sale", self.id, "create")
        return {"number": number, "total": total, "change": change, "margin":
                sum((line_total(l) - l["cost_price"]*l["quantity"]) for l in self.lines)}

def return_sale(sale_id, items_qty, admin_pin=False):
    """Retour (partiel ou total) — PIN admin requis, stock ré-incrémenté."""
    if not admin_pin: raise PermissionError("Retour: PIN admin requis")
    rid = uid()
    number = next_number("R")
    with db:
        db.execute("INSERT INTO sales(sale_id,number,status,sale_type,customer_id,employee_id) VALUES(?,?,?,?,?,?)",
                   (rid, number, "COMPLETED", "RETURN", None, "admin"))
        refund = 0
        for item_id, qty in items_qty:
            row = db.execute("SELECT applied_price,discount,discount_type FROM sales_items WHERE sale_id=? AND item_id=?", (sale_id, item_id)).fetchone()
            if not row: raise ValueError("Article absent de la vente d'origine")
            ledger(item_id, +qty, "RETURN", rid, "admin", f"retour sur {sale_id}")
            refund += line_total({"applied_price": row[0], "quantity": qty, "discount": row[1], "discount_type": row[2]})
        enqueue("sale", rid, "create")
    return {"number": number, "refund": refund}

def adjust_inventory(item_id, counted_qty, user="admin"):
    delta = counted_qty - q(item_id)
    if delta != 0: ledger(item_id, delta, "ADJUSTMENT", uid(), user, f"inventaire: compté {counted_qty}")
    return delta

def settle_credit(customer_id, amount):
    db.execute("UPDATE customers SET balance_due=balance_due-? WHERE customer_id=?", (amount, customer_id))

# ---------- rapports ----------
def report_sales_summary():
    rows = db.execute("""SELECT si.applied_price*si.quantity AS gross, si.cost_price*si.quantity AS cost
        FROM sales_items si JOIN sales s ON s.sale_id=si.sale_id
        WHERE s.status='COMPLETED' AND s.sale_type='POS' AND s.deleted=0""").fetchall()
    ca = sum(r[0] for r in rows); cost = sum(r[1] for r in rows)
    return {"ca": ca, "marge": ca - cost}
def report_low_stock():
    out = []
    for iid, name, lvl in db.execute("SELECT item_id,name,reorder_level FROM items WHERE deleted=0"):
        if q(iid) <= lvl: out.append(name)
    return out
def report_valuation():
    return sum(q(iid) * cp for iid, cp in db.execute("SELECT item_id,cost_price FROM items WHERE deleted=0"))
def report_velocity(item_id, days=30):
    sold = db.execute("""SELECT COALESCE(SUM(-trans_inventory),0) FROM inventory
        WHERE item_id=? AND ref_type='SALE'""", (item_id,)).fetchone()[0]
    per_day = sold / days
    return {"per_day": per_day, "days_left": (q(item_id)/per_day if per_day else None)}
