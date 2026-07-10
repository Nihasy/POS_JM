# Cahier des charges — POS JIABY Andapa (v2)

**Version :** 2.1 — Juillet 2026 (logiques validées par prototype : 36/36 scénarios)
**Projet :** Système de point de vente (caisse + stock + rapports) pour la boutique JIABY, Andapa
**Base fonctionnelle de référence :** [OpenSourcePOS (OSPOS)](https://github.com/opensourcepos/opensourcepos) — logiques métier reprises et filtrées, **stack technique conservée** (Tauri + React/TS + SQLite)
**Devise :** **Ariary uniquement**, partout (base, écrans, tickets, rapports, imports)

---

## 1. Contexte

JIABY : boutique détail + semi-gros à Andapa (électronique, matériel électrique, solaire, audio). Journaux de ventes et stocks disponibles pour l'amorçage. Contraintes : internet instable (→ offline-first), coupures électriques (→ transactions atomiques), personnel non technique (→ UI simple, français, clavier).

## 2. Méthode : ce qu'on prend d'OSPOS, ce qu'on écarte

OSPOS (15+ ans de production, PHP/CodeIgniter/MySQL) sert de **référence fonctionnelle** : on extrait ses raisonnements métier validés par le terrain, on les filtre selon nos besoins, et on les réimplémente dans notre stack.

### 2.1 Logiques REPRISES (alignées avec JIABY)

| Logique OSPOS | Ce qu'on en retient |
|---|---|
| **Inventory ledger** (`trans_inventory` signé : +réception, −vente, ±ajustement, avec user, date, commentaire) | Le stock n'est jamais un champ modifié à la main : c'est la **somme d'un journal de mouvements infalsifiable**. Toute correction = contre-écriture. |
| **Ventes suspendues** (`sale_status = SUSPENDED`) | Mise en attente d'un panier (client qui revient), stockée dans la même table `sales` avec un statut — pas de table séparée. |
| **Types de vente** (`POS / QUOTE / RETURN`) | On garde 3 types : vente comptoir, **devis/proforma** (utile en semi-gros), **retour** (mouvement de stock inverse + avoir). On écarte `INVOICE` et `WORK_ORDER`. |
| **Paiements multiples par vente** (table `sales_payments`) | Une vente peut combiner espèces + MVola + crédit. Chaque paiement est une ligne avec type, montant, référence. |
| **Cashup** (ouverture/clôture : `open_cash_amount`, montants clôturés par mode, `transfer_cash_amount`, note, employé d'ouverture/clôture) | Notre rapport Z devient une **session de caisse** complète : fonds d'ouverture → ventes par mode → montant compté → **écart calculé automatiquement** → transfert/retrait. |
| **Receivings** (réception fournisseur : référence, lignes avec coût unitaire, commentaire) | Les entrées de stock passent par une **réception structurée** liée à un fournisseur (lot d'import Chine, grossiste Tana), qui met à jour le coût. |
| **`receiving_quantity` / multi-pack** (`qty_per_pack`, `pack_name`) | On achète en cartons/rouleaux, on vend à l'unité/au mètre : **conversion conditionnement → unité de vente** à la réception. Essentiel pour les câbles et l'import par CBM. |
| **`reorder_level`** + rapport `Inventory_low` | Seuil de réapprovisionnement par produit + liste "à commander" — alimente directement les listes d'achat import. |
| **Item kits** (`item_kits`, `item_kit_items`) | **Kits solaires** (panneau + batterie + régulateur + câble) vendus comme un article, déstockage automatique des composants. |
| **Grille de permissions par module** (table `grants`, `permission_id`, `menu_group`) | Plus fin que 2 rôles codés en dur : chaque employé a des droits par module/sous-module. On livre 2 profils préconfigurés (Admin, Caissier) sur cette grille. |
| **Soft delete** (`deleted = 1`) partout | Aucun produit/vente n'est physiquement supprimé → l'historique et les rapports restent cohérents. |
| **Comptes clients / crédit** | Vente à crédit : client nommé, solde dû, suivi des impayés — repris en version simplifiée. |
| **Dépenses** (`expenses` + catégories) | Module léger : loyer, transport, salaires, électricité — pour que la clôture de caisse reflète la réalité du tiroir. |
| **Numérotation par année** (invoice/quote number) | Numérotation des tickets/devis : `V-2026-00001`, `D-2026-00001`. |
| **Structure multi-emplacements** (`stock_locations`, `item_quantities` par lieu) | On garde le **schéma** (1 seul emplacement actif en V1) → la V2 multi-boutique (Sambava ?) ne demandera aucune migration. |

### 2.2 Logiques ÉCARTÉES (hors besoin JIABY)

| Module OSPOS | Raison de l'exclusion |
|---|---|
| Taxes (jurisdictions, codes, catégories) | Pas de TVA à gérer au comptoir ; un champ taxe optionnel simple suffit si besoin futur |
| Giftcards, Rewards (fidélité à points) | Hors périmètre V1 |
| Dinner tables (mode restaurant) | Sans objet |
| Messages (SMS) | Sans objet V1 |
| Attributs dynamiques (champs personnalisés) | Complexité inutile — nos champs sont fixes et connus |
| Articles sérialisés (IMEI) | Téléphones = catégorie écartée des imports ; on garde juste le champ `is_serialized` inactif |
| Work orders, factures fiscales | Sans objet V1 |

### 2.3 Ce qu'OSPOS n'a pas et qu'on AJOUTE

- **Offline-first + synchronisation** (OSPOS est un serveur web centralisé — inadapté à Andapa)
- **Paliers de prix automatiques par quantité** (détail / semi-gros / gros) — OSPOS n'a que `unit_price` + `cost_price` ; c'est notre cœur de métier semi-gros
- **Vente au mètre** (quantités décimales natives pour les câbles)
- **MVola** comme mode de paiement de première classe (référence de transaction)
- **Rapports de vélocité** (ventes/jour, jours de stock restants) calibrés sur nos analyses d'import

## 3. Architecture technique (inchangée)

| Couche | Technologie |
|---|---|
| Desktop | **Tauri 2 + React + TypeScript** (Windows, PC 4 Go RAM) |
| Base locale | **SQLite** (WAL mode, transactions atomiques) |
| Backend sync | Node.js/TypeScript + PostgreSQL (ou Supabase) |
| Impression | ESC/POS USB, ticket 80 mm |
| Périphériques | **Douchette 2D** USB (mode clavier) — obligatoire pour lire les QR ; les douchettes 1D laser ne lisent pas les QR |

**Offline-first :** toutes les opérations sur SQLite local ; table `sync_queue` (UUID, horodatage, payload) ; push/pull incrémental dès connexion ; boutique = source de vérité ventes/stock, serveur = source de vérité catalogue ; sauvegarde chiffrée quotidienne (locale + serveur si connecté).

## 4. Modèle de données (SQLite, adapté du schéma OSPOS)

Tous les montants en **Ariary** (INTEGER — pas de centimes en Ariary). Quantités en REAL (vente au mètre). Tous les IDs exposés à la sync sont des UUID.

```
items            (item_id, item_number [code-barres], name, category,
                  supplier_id, cost_price, unit_price,        -- prix détail
                  price_semi_gros, qty_semi_gros,             -- palier 2  [ajout JIABY]
                  price_gros, qty_gros,                       -- palier 3  [ajout JIABY]
                  reorder_level, receiving_quantity,          -- unités par colis (OSPOS)
                  pack_name, unit_name [pièce|m|rouleau],
                  pic_filename, is_serialized, deleted)

stock_locations  (location_id, name, deleted)                 -- 1 seul actif en V1
item_quantities  (item_id, location_id, quantity)             -- cache, recalculable
inventory        (trans_id, item_id, trans_user, trans_date,
                  trans_comment, trans_location,
                  trans_inventory [signé], ref_type, ref_id)  -- LEDGER (OSPOS)

item_kits        (kit_id, name, price_option, deleted)
item_kit_items   (kit_id, item_id, quantity)

sales            (sale_id, sale_time, customer_id, employee_id,
                  sale_status [0=COMPLETED,1=SUSPENDED],       -- OSPOS
                  sale_type [POS|QUOTE|RETURN],                -- OSPOS filtré
                  number [V-2026-00001], comment, deleted)
sales_items      (sale_id, item_id, line, quantity,
                  cost_price [figé à la vente → marge exacte], -- OSPOS
                  catalog_price, applied_price,                -- traçage négociation
                  discount, discount_type [%|montant])
sales_payments   (payment_id, sale_id, payment_type
                  [ESPECES|MVOLA|CREDIT], amount, reference)

receivings       (receiving_id, receiving_time, supplier_id,
                  employee_id, reference [n° lot import],
                  payment_type, comment, deleted)
receiving_items  (receiving_id, item_id, line, quantity_units,
                  cost_price_unit)                             -- recalcul PMP

suppliers        (supplier_id, company_name, phone, category, deleted)
customers        (customer_id, name, phone, balance_due, credit_limit, deleted)

employees        (employee_id, username, pin_hash, deleted)
grants           (permission_id, employee_id)                  -- grille OSPOS
permissions      (permission_id, module_id, menu_group)

cashups          (cashup_id, open_date, open_employee_id,
                  open_cash_amount,
                  close_date, close_employee_id,
                  closed_amount_cash, closed_amount_mvola,
                  closed_amount_due, closed_amount_total,
                  expected_cash, variance,                     -- écart auto [ajout]
                  transfer_cash_amount, note)                  -- OSPOS

expenses         (expense_id, date, category_id, amount,
                  description, employee_id, deleted)
expense_categories (category_id, name)

sync_queue       (id, entity, entity_id, operation, payload,
                  created_at, synced_at)
app_config       (key, value)                                  -- OSPOS appconfig
```

**Règles métier précisées (validées par 36 scénarios de test — voir `test_scenarios.py`) :**
- **Ordre de calcul du prix** : palier automatique (détail/semi-gros/gros) → prix négocié éventuel → remise ligne (% ou Ar) → remise globale (%)
- **Rendu monnaie** : imputé exclusivement sur la part espèces ; un trop-perçu MVola/crédit est refusé à la validation
- **Crédit** : exige un client nommé ET `balance_due + montant ≤ credit_limit`, sinon refus
- **Devis** : numéroté `D-2026-xxxxx`, ne génère AUCUN mouvement de stock ; seul le passage en vente déstocke
- **Retour partiel** autorisé : remboursé au prix appliqué de la vente d'origine (remises comprises), PIN admin obligatoire
- **Vente > stock disponible** : bloquée par défaut ; déblocage possible par autorisation admin (paramètre)
- **Marge figée** : `sales_items.cost_price` copié au moment de la vente (PMP du jour)

**Règles métier clés (reprises d'OSPOS) :**
- `item_quantities.quantity` = Σ `inventory.trans_inventory` — recalculable à tout moment, jamais édité directement
- Vente validée → une ligne `inventory` négative par article ; retour → ligne positive ; réception → positive
- `sales_items.cost_price` est **copié au moment de la vente** → les marges historiques ne bougent pas quand le PMP change
- Suppression = `deleted = 1` + contre-écritures d'inventaire (fonction `delete/restore` d'OSPOS)
- PMP recalculé à chaque `receiving` : `(stock×PMP + qté×coût) / (stock+qté)`

## 5. Module Caisse

- Recherche produit < 200 ms (nom, référence, scan) ; navigation 100 % clavier (F1–F12)
- Panier : quantités décimales (mètres), remise ligne (% ou Ar), remise globale
- **Paliers automatiques** : le prix bascule détail → semi-gros → gros selon la quantité ; prix modifiable à la ligne avec traçage `catalog_price` vs `applied_price`
- Kits (ex. kit solaire) : ajout en 1 ligne, déstockage des composants
- **Vente suspendue** : mise en attente / rappel d'un panier (logique OSPOS)
- **Devis/proforma** (semi-gros) : imprimable, convertible en vente en 1 clic
- Paiements multiples : espèces (rendu monnaie), MVola (référence saisie), crédit client (plafond par client), mixte
- **Retour** : PIN admin requis, ticket d'avoir, stock ré-incrémenté via le ledger
- Ticket 80 mm : en-tête JIABY, lignes, total Ar, mode(s) de paiement, n° `V-2026-xxxxx` ; réimpression depuis l'historique

## 6. Module Stock

- Catalogue : fiche produit complète (cf. schéma), catégories alignées sur les registres (câbles/cordons, torches, solaire, audio, électricité, accessoires)
- **Réceptions** : sélection fournisseur, référence de lot (ex. import Chine n°X), saisie en conditionnement (cartons/rouleaux) → conversion automatique en unités de vente, coût unitaire en Ar, recalcul PMP
- Ajustements d'inventaire : comptage physique par catégorie → écarts générés → validation admin → contre-écritures
- **Étiquetage QR** (repris de la génération d'étiquettes OSPOS, adapté en QR) :
  - Chaque produit possède un QR unique encodant son `item_number` (généré automatiquement à la création de la fiche si aucun code-barres fournisseur n'existe)
  - **À la réception : proposition d'impression automatique de N étiquettes** (ex. réception de 50 torches → 50 étiquettes identiques à coller)
  - Impression au choix : planche A4 (étiquettes autocollantes standard 24/40 par page) ou rouleau d'étiquettes sur imprimante thermique
  - Réimpression à la demande depuis la fiche produit (quantité libre)
  - Étiquette = QR + nom court + prix détail (prix optionnel, paramétrable)
  - À la caisse : scan du QR → ajout instantané au panier
- Alertes seuil (`reorder_level`) + liste "à réapprovisionner" exportable CSV (base des commandes d'import)
- Historique de mouvements consultable par produit (le ledger, filtrable)

## 7. Module Rapports

Adaptés des 21 rapports OSPOS, filtrés à l'essentiel. Tous : écran + impression + export CSV.

| Rapport | Origine OSPOS | Contenu |
|---|---|---|
| Ventes détaillées | `Detailed_sales` | Chaque ticket, lignes, paiements — jour/plage |
| Synthèse ventes | `Summary_sales` | CA, coût, **marge brute**, nb tickets, panier moyen |
| Par produit | `Summary_items` | Qté, CA, marge par article |
| Par catégorie | `Summary_categories` | CA/marge par famille (pilotage import) |
| Par paiement | `Summary_payments` | Espèces vs MVola vs crédit |
| Par caissier | `Summary_employees` | CA et tickets par employé |
| Stock bas | `Inventory_low` | Produits ≤ seuil |
| Valorisation stock | `Inventory_summary` | Qté × PMP par catégorie, total Ar |
| Réceptions détaillées | `Detailed_receivings` | Historique des entrées par fournisseur/lot |
| Clients à crédit | `Specific_customer` | Soldes dus, échéances |
| Dépenses | `Summary_expenses` | Par catégorie, par période |
| **Vélocité** | *ajout JIABY* | Ventes/jour par produit, jours de stock restants (30/90 j) |
| **Session de caisse (Z)** | `Cashups` | Ouverture, ventes par mode, compté, **écart**, transfert |

## 8. Utilisateurs et sécurité

- Grille de permissions par module (modèle OSPOS `grants`) ; 2 profils livrés : **Admin** (tout) et **Caissier** (vendre, encaisser, consulter stock sans coûts/marges, clôturer sa session)
- Connexion PIN ; coûts d'achat et marges invisibles pour Caissier
- Journal d'audit (annulations, changements de prix, ajustements) — découle naturellement du ledger et du traçage `applied_price`
- Base chiffrée au repos (SQLCipher)

## 9. Reprise des données existantes

- Journaux de ventes et stocks fournis → CSV normalisés **en Ariary**
- Import initial : catalogue + PMP de départ + stock compté + historique agrégé (amorçage vélocité)
- Script d'import Node/TS livré ; mapping des catégories des registres vers le catalogue

## 10. Exigences non fonctionnelles

- Coupure de courant en pleine vente → zéro corruption (SQLite WAL + transactions)
- Encaissement complet < 30 s ; démarrage < 5 s ; 100 % fonctionnel sans réseau
- Interface français, montants `12 500 Ar`, clavier-first
- Sauvegarde auto quotidienne + procédure de restauration testée

## 11. Découpage en lots

| Lot | Contenu | Estimation |
|---|---|---|
| **1 — Socle** | Tauri + SQLite, schéma complet, catalogue, import CSV, PIN + permissions | 2 sem. |
| **2 — Caisse** | Vente, paliers, kits, suspension, devis, paiements multiples, ticket, retours | 2–3 sem. |
| **3 — Stock** | Réceptions + PMP, ajustements, inventaire, alertes, ledger, **étiquettes QR** | 2 sem. |
| **4 — Rapports** | Les 13 rapports + sessions de caisse + dépenses | 1–1,5 sem. |
| **5 — Sync** | sync_queue, backend, dashboard distant lecture seule, sauvegardes | 2 sem. |

Lots 1–4 = boutique exploitable sans le Lot 5. Total : **8–10 semaines** solo avec Claude Code.

## 12. Critères d'acceptation

- [ ] Vente 3 articles + remise + espèces + ticket < 30 s
- [ ] Coupure en pleine vente → aucune donnée corrompue
- [ ] Σ ledger = stock affiché, pour 100 % des produits, à tout moment
- [ ] Palier semi-gros appliqué automatiquement au bon seuil ; négociation tracée
- [ ] Vente d'un kit solaire → composants déstockés individuellement
- [ ] Réception d'un carton de 50 torches saisie en 1 ligne → +50 unités, PMP recalculé, **50 étiquettes QR imprimées en 1 clic**
- [ ] Scan d'une étiquette QR à la caisse → article dans le panier en < 200 ms
- [ ] Session de caisse : écart calculé automatiquement entre attendu et compté
- [ ] 7 jours hors ligne → sync complète sans doublon
- [ ] Caissier : marges invisibles, retour impossible sans PIN admin
