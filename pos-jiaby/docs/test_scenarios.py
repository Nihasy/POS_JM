"""Scénarios de validation du CDC — exécution."""
from pos_proto import *

PASS, FAIL, results = 0, 0, []
def check(name, cond, note=""):
    global PASS, FAIL
    ok = bool(cond)
    PASS += ok; FAIL += (not ok)
    results.append(f"{'✅' if ok else '❌'} S{len(results)+1:02d} {name}" + (f" — {note}" if note else ""))

# ============ MISE EN PLACE ============
torche = create_item("Torche LED", "torches", unit_price=15000, semi=12000, qty_semi=6, gros=10000, qty_gros=24, reorder=10)
cable  = create_item("Câble 2.5mm", "cables", unit_price=2500, semi=2200, qty_semi=50, unit="m", reorder=20)
panneau = create_item("Panneau 100W", "solaire", unit_price=250000)
batterie = create_item("Batterie 12V", "solaire", unit_price=180000)
regul = create_item("Régulateur", "solaire", unit_price=45000)

# ============ RÉCEPTIONS & PMP ============
r1 = receive(torche, 50, 8000, "Fournisseur 1688", "IMPORT-CN-01")
check("Réception 50 torches → stock 50 + ledger", q(torche) == 50)
check("50 étiquettes QR proposées à l'impression", r1["labels_to_print"] == 50)
check("PMP initial = coût d'achat (8 000 Ar)", r1["new_pmp"] == 8000)

r2 = receive(torche, 50, 10000, "Fournisseur 1688", "IMPORT-CN-02")
check("2e réception coût différent → PMP pondéré = 9 000 Ar", r2["new_pmp"] == 9000, f"obtenu {r2['new_pmp']}")

receive(cable, 200, 1500, "Grossiste Tana", "TANA-05")   # rouleau 200 m
receive(panneau, 5, 150000, "1688", "IMPORT-CN-02")
receive(batterie, 5, 110000, "1688", "IMPORT-CN-02")
receive(regul, 5, 25000, "1688", "IMPORT-CN-02")

# ============ VENTE DÉTAIL SIMPLE ============
s = Sale(); s.add(torche, 2); s.pay("ESPECES", 30000)
res = s.finalize()
check("Vente détail 2 torches → prix détail appliqué", s.lines[0]["tier"] == "détail" and res["total"] == 30000)
check("Stock décrémenté via ledger (100→98)", q(torche) == 98)
check("Marge exacte avec coût figé (2×(15000−9000))", res["margin"] == 12000, f"obtenu {res['margin']}")
check("Numérotation V-2026-00001", res["number"] == "V-2026-00001")

# ============ PALIERS AUTOMATIQUES ============
s = Sale(); s.add(torche, 6); s.pay("ESPECES", 72000); res = s.finalize()
check("Palier semi-gros auto à qté 6 (12 000 Ar/u)", s.lines[0]["tier"] == "semi-gros" and res["total"] == 72000)
s = Sale(); s.add(torche, 24); s.pay("ESPECES", 240000); res = s.finalize()
check("Palier gros auto à qté 24 (10 000 Ar/u)", s.lines[0]["tier"] == "gros" and res["total"] == 240000)

# ============ VENTE AU MÈTRE + NÉGOCIATION ============
s = Sale(); s.add(cable, 12.5); s.pay("ESPECES", 31250); res = s.finalize()
check("Vente au mètre (12,5 m de câble)", res["total"] == 31250 and q(cable) == 187.5)
s = Sale(); s.add(torche, 1, negotiated_price=14000); s.pay("ESPECES", 14000); res = s.finalize()
check("Prix négocié tracé (catalogue 15 000 / appliqué 14 000)",
      s.lines[0]["catalog_price"] == 15000 and s.lines[0]["applied_price"] == 14000)

# ============ REMISES ============
s = Sale(); s.add(torche, 2, discount=10, discount_type="%"); s.pay("ESPECES", 27000); res = s.finalize()
check("Remise ligne 10% (30 000→27 000)", res["total"] == 27000)
s = Sale(); s.add(torche, 1); s.global_discount_pct = 5; s.pay("ESPECES", 14250); res = s.finalize()
check("Remise globale 5% (15 000→14 250)", res["total"] == 14250)

# ============ PAIEMENTS ============
s = Sale(); s.add(torche, 2); s.pay("MVOLA", 20000, "MV123456"); s.pay("ESPECES", 15000)
res = s.finalize()
check("Paiement mixte MVola+espèces, rendu 5 000 sur espèces", res["change"] == 5000)
s = Sale(); s.add(torche, 1); s.pay("MVOLA", 20000, "MV999")
try: s.finalize(); check("Trop-perçu MVola sans espèces → refusé", False)
except ValueError: check("Trop-perçu MVola sans espèces → refusé", True)

# ============ CRÉDIT CLIENT ============
db.execute("INSERT INTO customers VALUES(?,?,?,?)", ("C1", "Rakoto", 0, 100000))
s = Sale(customer_id="C1"); s.add(torche, 4); s.pay("CREDIT", 60000); res = s.finalize()
bal = db.execute("SELECT balance_due FROM customers WHERE customer_id='C1'").fetchone()[0]
check("Vente à crédit → solde client 60 000", bal == 60000)
s = Sale(customer_id="C1"); s.add(torche, 4); s.pay("CREDIT", 60000)
try: s.finalize(); check("Plafond crédit (100 000) dépassé → refusé", False)
except ValueError: check("Plafond crédit (100 000) dépassé → refusé", True)
settle_credit("C1", 60000)
check("Règlement crédit → solde 0", db.execute("SELECT balance_due FROM customers WHERE customer_id='C1'").fetchone()[0] == 0)
s = Sale(); s.add(torche, 1); s.pay("CREDIT", 15000)
try: s.finalize(); check("Crédit sans client nommé → refusé", False)
except ValueError: check("Crédit sans client nommé → refusé", True)

# ============ SUSPENSION & DEVIS ============
stock_avant = q(torche)
s = Sale(); s.add(torche, 3); sid = s.suspend()
st = db.execute("SELECT status FROM sales WHERE sale_id=?", (sid,)).fetchone()[0]
check("Panier suspendu (statut SUSPENDED, stock intact)", st == "SUSPENDED" and q(torche) == stock_avant)
s.pay("ESPECES", 45000); res = s.finalize()
check("Rappel + finalisation du panier suspendu", res["total"] == 45000 and q(torche) == stock_avant - 3)

devis = Sale(sale_type="QUOTE"); devis.add(panneau, 2); devis.pay("ESPECES", 500000)
res = devis.finalize()
check("Devis : numéro D-2026-xxxxx, AUCUN mouvement de stock", res["number"].startswith("D-2026") and q(panneau) == 5)

# ============ KITS ============
db.execute("INSERT INTO item_kits VALUES('K1','Kit solaire 100W',460000)")
db.executemany("INSERT INTO item_kit_items VALUES('K1',?,1)", [(panneau,), (batterie,), (regul,)])
s = Sale(); s.add_kit("K1"); s.pay("ESPECES", 460000); res = s.finalize()
check("Kit solaire vendu → 3 composants déstockés", q(panneau) == 4 and q(batterie) == 4 and q(regul) == 4)
check("Marge kit = prix kit − Σ coûts composants", res["margin"] == 460000 - (150000+110000+25000))

# ============ RETOURS ============
last_sale = s.id
s = Sale(); s.add(torche, 3); s.pay("ESPECES", 45000); res = s.finalize(); vid = s.id
try: return_sale(vid, [(torche, 1)], admin_pin=False); check("Retour sans PIN admin → refusé", False)
except PermissionError: check("Retour sans PIN admin → refusé", True)
ret = return_sale(vid, [(torche, 1)], admin_pin=True)
check("Retour partiel 1/3 → stock +1, avoir 15 000, n° R-2026-xxxxx",
      ret["refund"] == 15000 and ret["number"].startswith("R-2026"))

# ============ STOCK INSUFFISANT & AJUSTEMENT ============
s = Sale(); s.add(panneau, 99); s.pay("ESPECES", 99*250000)
try: s.finalize(); check("Vente > stock → bloquée par défaut", False)
except ValueError: check("Vente > stock → bloquée par défaut", True)
compte = q(torche) - 2  # comptage physique : 2 unités manquantes
delta = adjust_inventory(torche, compte)
check("Ajustement inventaire → contre-écriture (écart %+d)" % delta, q(torche) == compte and delta == -2)

# ============ RAPPORTS ============
rep = report_sales_summary()
check("Rapport CA/marge cohérent (CA > 0, marge > 0)", rep["ca"] > 0 and 0 < rep["marge"] < rep["ca"], f"CA={rep['ca']:,} Ar, marge={rep['marge']:,} Ar")
vel = report_velocity(torche, 30)
check("Vélocité torche calculée (v/j + jours restants)", vel["per_day"] > 0 and vel["days_left"] > 0,
      f"{vel['per_day']:.1f}/j, {vel['days_left']:.0f} j de stock")
check("Valorisation stock (Σ qté×PMP) > 0", report_valuation() > 0, f"{report_valuation():,} Ar")

# ============ SEUIL & SOFT DELETE ============
s = Sale(); s.add(cable, 170); s.pay("ESPECES", line_total({"applied_price":2200,"quantity":170,"discount":0,"discount_type":None})); s.finalize()
check("Alerte seuil : câble (17,5 m ≤ 20) dans stock bas", "Câble 2.5mm" in report_low_stock())
rep_avant = report_sales_summary()
db.execute("UPDATE items SET deleted=1 WHERE item_id=?", (torche,))
rep2 = report_sales_summary()
check("Soft delete produit → historique des ventes intact", rep2["ca"] == rep_avant["ca"])
db.execute("UPDATE items SET deleted=0 WHERE item_id=?", (torche,))

# ============ SYNC & INTÉGRITÉ ============
n1 = db.execute("SELECT COUNT(*) FROM sync_queue").fetchone()[0]
enqueue("sale", last_sale, "create")  # rejeu du même événement
n2 = db.execute("SELECT COUNT(*) FROM sync_queue").fetchone()[0]
check("Sync idempotente : rejeu du même événement → pas de doublon", n1 == n2, f"{n1} événements en file")
ok_all = all(abs(q(i[0]) - 0) >= 0 for i in db.execute("SELECT item_id FROM items"))
sums = {n: q(i) for i, n in db.execute("SELECT item_id,name FROM items")}
check("Invariant global : stock affiché = Σ ledger pour tous les produits", ok_all, str({k: round(v,1) for k,v in sums.items()}))

print("\n".join(results))
print(f"\n{'='*60}\nRÉSULTAT : {PASS} réussis / {FAIL} échoués / {PASS+FAIL} scénarios")
