# PLAN D'EXÉCUTION — POS JIABY (pour Claude Code)

> **Ce document est le plan de travail de bout en bout.** Il s'exécute phase par phase, dans l'ordre.
> Une phase n'est commencée que si la précédente passe sa **checklist de sortie**.
> Références obligatoires dans le repo : `docs/cdc-pos-jiaby-v2.md` (spécification), `docs/pos_proto.py` + `docs/test_scenarios.py` (règles métier de référence, 36 scénarios validés — **la logique TypeScript doit reproduire exactement ces comportements**).

---

## 0. Règles permanentes (valables toutes phases)

1. **Devise** : Ariary uniquement. Tous les montants en `INTEGER` (pas de décimales monétaires). Affichage `12 500 Ar`.
2. **Quantités** : `REAL` (vente au mètre). Arrondi d'affichage à 0,1.
3. **IDs** : UUID v4 partout (générés côté client — nécessaire pour la sync offline).
4. **Stock** : JAMAIS un champ édité. Toujours `Σ inventory.trans_inventory`. `item_quantities` n'est qu'un cache recalculable.
5. **Suppression** : soft delete (`deleted = 1`) + contre-écritures d'inventaire si nécessaire.
6. **Écritures critiques** (vente, réception, ajustement, cashup) : une seule transaction SQLite — tout ou rien.
7. **Chaque règle métier a un test.** Aucun commit de logique sans son test Vitest.
8. Interface 100 % **français**, navigable **clavier d'abord** (la souris est un bonus).
9. Ne pas installer de dépendance non listée sans la justifier dans le commit.
10. Commits atomiques, messages en français : `feat(caisse): paliers automatiques`, `test(stock): PMP pondéré`.

## 1. Stack imposée

| Couche | Choix | Version cible |
|---|---|---|
| Desktop | Tauri 2 + React 18 + TypeScript strict + Vite | Tauri ≥ 2.x |
| État UI | Zustand | — |
| Base locale | SQLite via `@tauri-apps/plugin-sql`, mode WAL | — |
| Styles | Tailwind CSS | — |
| Tests | Vitest (unitaires métier) + Playwright (e2e plus tard) | — |
| Impression ticket | ESC/POS via `tauri-plugin-serialplugin` ou écriture USB raw (à valider Phase 2) | — |
| QR | `qrcode` (génération) ; lecture = douchette 2D en mode clavier (aucune lib) | — |
| Backend sync (Phase 5) | Node 20 + Fastify + PostgreSQL + Drizzle ORM | — |

## 2. Structure du repo

```
pos-jiaby/
├── docs/                      # CDC v2.1, pos_proto.py, test_scenarios.py
├── src/                       # React
│   ├── app/                   # routing, layout, providers
│   ├── modules/
│   │   ├── auth/              # PIN, permissions
│   │   ├── catalogue/         # produits, kits, catégories
│   │   ├── caisse/            # vente, paiements, suspension, devis, retours
│   │   ├── stock/             # réceptions, ajustements, étiquettes
│   │   ├── rapports/
│   │   ├── cashup/            # sessions de caisse
│   │   └── clients/           # crédit
│   ├── core/
│   │   ├── db/                # migrations, accès SQLite, repositories
│   │   ├── domain/            # RÈGLES MÉTIER PURES (portées du proto Python)
│   │   ├── printing/          # ESC/POS, étiquettes
│   │   ├── sync/              # queue (Phase 5)
│   │   └── format/            # formatAriary, formatQty, dates fr
│   └── components/            # UI partagée (SearchBox, NumPad, Modal…)
├── src-tauri/                 # Rust (config, plugins, backups)
├── tests/
│   ├── domain/                # les 36 scénarios portés en Vitest
│   └── e2e/
├── scripts/
│   └── import-historique/     # Node/TS : CSV registres → SQLite
└── server/                    # Phase 5 uniquement
```

**Principe d'architecture : `core/domain` ne dépend ni de React ni de Tauri** — fonctions pures testables (mêmes signatures que le proto Python : `tierPrice`, `lineTotal`, `finalizeSale`, `receive`, `adjustInventory`…). Les modules UI appellent le domain via des repositories.

---

## 3. Design system (obligatoire — voir `docs/maquette-caisse-jiaby.html`)

Direction : **« atelier électrique »** — moderne par la précision et la lisibilité, pas par la décoration. Écran de comptoir : lisible à 2 m, clavier d'abord, chiffres énormes.

**Tokens (CSS variables, Tailwind config) :**

| Token | Valeur | Usage |
|---|---|---|
| `--atelier` | `#F4F6F3` | Fond général (gris-vert clair, anti-éblouissement) |
| `--carte` | `#FFFFFF` | Surfaces (cartes, ticket, modales) |
| `--encre` / `--encre-2` | `#15181B` / `#5A6470` | Texte principal / secondaire |
| `--neutre` | `#1B4AC2` | Action principale (bleu « fil neutre ») |
| `--especes` | `#177245` | États positifs, espèces, sync OK |
| `--alerte` | `#B7791F` | Stock bas, hors-ligne, écarts |
| Liseré « terre » | `#2E9E44` / `#F2C218` | **Signature** : bande fine vert/jaune (couleur du fil de terre) en haut de l'app et des modales |

**Typographie :** `Archivo` (variable, graisse 400–800, légèrement élargie pour les titres) pour toute l'UI ; `IBM Plex Mono` avec chiffres tabulaires pour **tous les montants et quantités** (alignement parfait des colonnes de prix). Total de vente : 38 px minimum.

**Règles UI :**
- Chaque action a sa touche visible : rail permanent F2/F4/F6/F8/F9/F10/F12 en bas d'écran, `kbd` stylisés
- États réseau et session toujours visibles dans la barre du haut (pastille Synchronisé / Hors ligne + nb d'événements en attente)
- Badges de palier (`semi-gros`, `gros`) sur les lignes du ticket quand un palier s'applique
- Stock ≤ seuil : quantité en `--alerte` + ⚠ sur la carte produit
- Cibles cliquables ≥ 44 px ; focus clavier visible partout ; `prefers-reduced-motion` respecté
- Aucune donnée de coût/marge rendue dans le DOM pour le rôle Caissier

---

## PHASE 0 — Bootstrap (0,5 sem.)

### Tâches
- [ ] `npm create tauri-app` → React-TS + Vite ; config Tauri Windows (single instance, fenêtre 1024×768 min)
- [ ] Tailwind, Zustand, Vitest, ESLint/Prettier, TS `strict: true`
- [ ] Intégrer le design system (section 3) : tokens Tailwind, polices Archivo + IBM Plex Mono (fichiers locaux — pas de CDN, l'app est offline), composants de base (Kbd, Badge, Pastille, MontantAr)
- [ ] Plugin SQL Tauri ; ouverture DB en WAL ; helper `withTransaction()`
- [ ] `core/format` : `formatAriary(1250000) → "1 250 000 Ar"`, parse inverse ; tests
- [ ] Copier `docs/` (CDC + proto + scénarios) dans le repo
- [ ] Script `npm run dev`, `npm run test`, `npm run tauri build` fonctionnels

### Sortie de phase
- L'app s'ouvre, affiche "JIABY POS", écrit/lit une valeur test dans SQLite, `npm test` vert.

---

## PHASE 1 — Socle : schéma, auth, catalogue, import (2 sem.)

### 1.1 Schéma & migrations
- [ ] `core/db/migrations/001_init.sql` : **schéma complet de la section 4 du CDC** (16 tables, y compris `credit_limit` sur customers, `sync_queue`, `app_config`) — tout créer dès maintenant, même les tables des phases suivantes
- [ ] Système de migrations versionnées (table `schema_version`, exécution au démarrage)
- [ ] Index : `inventory(item_id)`, `sales(sale_time)`, `sales_items(sale_id)`, `items(item_number)`, `items(name)`
- [ ] Repositories typés : `ItemRepo`, `InventoryRepo`, `CustomerRepo`… (requêtes préparées uniquement)

### 1.2 Domain : stock & ledger
- [ ] Porter du proto : `quantity(itemId) = Σ ledger`, `postLedger(itemId, qty, refType, refId, user, comment)`
- [ ] Recalcul du cache `item_quantities` + fonction d'audit `verifyLedgerIntegrity()` (invariant S36)

### 1.3 Auth & permissions
- [ ] Login PIN (hash argon2/bcrypt), verrouillage après 5 échecs 1 min
- [ ] Tables `permissions`/`grants` (grille OSPOS) ; seed des 2 profils : **Admin** (tout), **Caissier** (vendre, encaisser, stock lecture SANS `cost_price` ni marges, clôturer sa session)
- [ ] Hook `usePermission(moduleId)` + masquage systématique des coûts pour Caissier (au niveau requête, pas seulement UI)

### 1.4 Catalogue
- [ ] CRUD produit : tous les champs du CDC (paliers + seuils, `receiving_quantity`, `pack_name`, `unit_name`, photo, `reorder_level`)
- [ ] Génération auto `item_number` (`JIA-XXXX-NNNN`) si vide + QR associé
- [ ] CRUD kits (`item_kits`, `item_kit_items`) avec contrôle d'existence des composants
- [ ] Catégories : câbles/cordons, torches, solaire, audio, électricité, accessoires (seed + libres)
- [ ] Recherche instantanée (nom / référence / scan) < 200 ms — index + debounce 80 ms

### 1.5 Import historique
- [ ] `scripts/import-historique` : lit les CSV normalisés (catalogue, stock initial, ventes agrégées) **en Ariary**
- [ ] Stock initial = écritures ledger `ref_type='OPENING'` ; PMP de départ ; historique agrégé pour amorcer la vélocité
- [ ] Rapport d'import : lignes OK / rejetées + motifs, en CSV

### Sortie de phase
- Login Caissier/Admin fonctionnels ; création produit + kit ; import d'un CSV d'essai ; `verifyLedgerIntegrity()` vert ; tests domain stock 100 %.

---

## PHASE 2 — Caisse (2,5–3 sem.)

### 2.1 Moteur de prix (domain pur — PORT DIRECT DU PROTO)
- [ ] `tierPrice(item, qty)` : gros ≥ `qty_gros` > semi-gros ≥ `qty_semi_gros` > détail (S09–S10)
- [ ] `lineTotal(line)` : prix appliqué × qté → remise ligne (% ou Ar) (S13)
- [ ] Total vente : Σ lignes → remise globale % (S14)
- [ ] **Ordre de calcul contractuel : palier → prix négocié → remise ligne → remise globale**
- [ ] Traçage `catalog_price` vs `applied_price` sur chaque ligne (S12)
- [ ] Tests : reproduire à l'identique S05, S09–S14

### 2.2 Écran de vente
- [ ] Layout 2 colonnes : recherche+résultats / panier+total ; raccourcis F2 recherche, F4 remise, F8 suspendre, F9 rappeler, F10 encaisser, F12 clôture
- [ ] Scan douchette (input clavier terminé par Enter) → ajout panier < 200 ms
- [ ] Quantités décimales pour `unit_name='m'` ; pavé numérique tactile/clavier
- [ ] Kits : ajout 1 ligne, contrôle stock composants (S24), refus si composant manquant
- [ ] Modification de prix à la ligne : libre pour Admin, demande PIN admin pour Caissier

### 2.3 Finalisation (domain — transaction atomique)
- [ ] Port de `finalize()` : contrôle stock (blocage par défaut, S28 ; option admin `allow_negative_stock`), contrôle paiement, écritures sales + sales_items (cost_price FIGÉ, S07) + sales_payments + ledger + sync_queue, numérotation `V-2026-NNNNN` (S08)
- [ ] Paiements multiples : ESPECES / MVOLA (référence obligatoire) / CREDIT ; **rendu imputé sur espèces uniquement, trop-perçu non-espèces refusé** (S15–S16)
- [ ] Crédit : client obligatoire + plafond `balance_due + montant ≤ credit_limit` (S17–S20) ; écran solde/règlements clients
- [ ] Suspension / rappel de panier (statut SUSPENDED, zéro mouvement de stock, S21–S22)
- [ ] Devis `D-2026-NNNNN` sans mouvement de stock + conversion en vente 1 clic (S23)
- [ ] Retours : PIN admin, partiels autorisés, remboursement au prix appliqué d'origine remises comprises, ledger positif, avoir `R-2026-NNNNN` (S26–S27)

### 2.4 Ticket
- [ ] Génération ESC/POS 80 mm : en-tête JIABY, n°, date, caissier, lignes (nom court, qté, PU, total), remises, TOTAL Ar, paiements+rendu, pied "Merci"
- [ ] Spike matériel en début de phase : valider l'impression USB sur l'imprimante réelle ; fallback : impression via driver Windows (page HTML 80 mm)
- [ ] Réimpression depuis l'historique des ventes ; ticket d'avoir pour les retours

### Sortie de phase
- Les scénarios S05–S28 passent en Vitest ; une vente réelle complète (scan → paiement mixte → ticket imprimé) en < 30 s ; kill de l'app en pleine finalisation → aucune vente partielle en base.

---

## PHASE 3 — Stock (2 sem.)

### 3.1 Réceptions
- [ ] Écran réception : fournisseur, référence de lot (`IMPORT-CN-xx`, `TANA-xx`), lignes en **conditionnement** (`x cartons de qty_per_pack`) → conversion unités
- [ ] Port de `receive()` : ledger positif + **PMP pondéré** `(stock×PMP + qté×coût)/(stock+qté)` arrondi (S01–S04) ; transaction atomique
- [ ] Fournisseurs : CRUD minimal (nom, téléphone, catégorie)

### 3.2 Étiquettes QR
- [ ] À la validation d'une réception : proposition d'impression de N étiquettes par ligne (S02)
- [ ] Deux gabarits : planche A4 (24 et 40/page, grille CSS print) + rouleau thermique
- [ ] Étiquette = QR(`item_number`) + nom court + prix détail (option on/off)
- [ ] Réimpression depuis la fiche produit (quantité libre)

### 3.3 Ajustements & alertes
- [ ] Écran inventaire par catégorie : liste, saisie comptage, écarts calculés, validation Admin → contre-écritures `ADJUSTMENT` (S29)
- [ ] Sorties manuelles motivées (casse, don, usage interne) — motif obligatoire
- [ ] Alertes seuil sur le tableau de bord + liste "à réapprovisionner" exportable CSV (S33)
- [ ] Historique de mouvements par produit (le ledger filtrable : type, période, utilisateur)

### Sortie de phase
- S01–S04, S29, S33 verts ; réception réelle d'un produit test → étiquettes imprimées → scan en caisse OK ; `verifyLedgerIntegrity()` vert après une journée de manipulations.

---

## PHASE 4 — Rapports & sessions de caisse (1,5 sem.)

### 4.1 Sessions de caisse (cashup OSPOS)
- [ ] Ouverture obligatoire avant toute vente : fonds d'ouverture compté
- [ ] Dépenses en cours de session (catégorie, montant, motif) — impactent l'attendu espèces
- [ ] Clôture : attendu = ouverture + ventes espèces − rendus − dépenses ; saisie du compté → **écart automatique** ; MVola et crédit affichés séparément ; note ; impression du Z
- [ ] Ventes bloquées hors session ouverte

### 4.2 Les 13 rapports (écran + impression + export CSV)
- [ ] Ventes détaillées / Synthèse CA-marge / Par produit / Par catégorie / Par paiement / Par caissier
- [ ] Stock bas / Valorisation (Σ qté×PMP) / Réceptions détaillées
- [ ] Clients à crédit (soldes, ancienneté) / Dépenses par catégorie
- [ ] **Vélocité** : ventes/jour par produit sur 30 et 90 j + jours de stock restants (S31) — tri par "à commander en premier"
- [ ] Sessions de caisse : historique des Z avec écarts
- [ ] Toutes les requêtes excluent `deleted=1` des listes mais JAMAIS de l'historique (S34) ; marges invisibles pour Caissier

### Sortie de phase
- S30–S34 verts ; journée type simulée (ouverture → 10 ventes variées → dépense → clôture) : Z juste au Ariary près ; les 13 rapports exportent un CSV valide.

---

## PHASE 5 — Synchronisation & sauvegardes (2 sem.)

### 5.1 Backend (`server/`)
- [ ] Fastify + PostgreSQL + Drizzle ; mêmes entités que SQLite ; auth par token boutique
- [ ] `POST /sync/push` (batch d'événements, **idempotent par UUID d'événement**, S35) ; `GET /sync/pull?since=` (catalogue/prix modifiés à distance)
- [ ] Règle de conflit : boutique = vérité ventes/stock ; serveur = vérité catalogue ; last-write-wins horodaté ailleurs

### 5.2 Client sync
- [ ] Worker : détection connexion → push file `sync_queue` (batchs de 100, retry backoff) → pull → marquage `synced_at`
- [ ] Écran état sync : nb en attente, dernière sync, erreurs
- [ ] Test réseau coupé 7 jours simulés → resync complète sans doublon

### 5.3 Sauvegardes & dashboard
- [ ] Backup quotidien auto : copie SQLite (`VACUUM INTO`) chiffrée → dossier local + upload si connecté ; rotation 30 j ; **procédure de restauration testée et documentée**
- [ ] Dashboard web lecture seule (server/) : CA du jour par boutique, stock bas, dernières ventes — consultable depuis Tana

### Sortie de phase
- Vente hors ligne → visible sur le dashboard après reconnexion ; restauration d'un backup vérifiée ; S35 vert de bout en bout (client+serveur).

---

## TESTS — stratégie globale

1. **`tests/domain/scenarios.test.ts`** : les **36 scénarios de `docs/test_scenarios.py` portés 1:1 en Vitest** — c'est le contrat. Ils doivent être verts en continu à partir de la Phase 2.
2. Tests unitaires par fonction domain (prix, PMP, ledger, cashup) — cas limites : qté 0, remise 100 %, montants énormes, quantités décimales.
3. Tests d'intégrité : `verifyLedgerIntegrity()` exécuté après chaque suite.
4. Test de robustesse coupure : kill du process pendant `finalize()` × 50 itérations → base jamais corrompue (WAL).
5. E2E Playwright (fin Phase 4) : parcours vente complet, parcours réception+étiquettes, journée de caisse.

## LIVRAISON FINALE

- [ ] Installeur Windows signé (`tauri build`) + test sur le PC réel de la boutique (4 Go RAM)
- [ ] Import des vrais journaux JIABY (script Phase 1.5) + inventaire physique d'ouverture
- [ ] Guide Caissier (1 page, français, illustré raccourcis) + Guide Admin + procédure sauvegarde/restauration
- [ ] Formation : 1 journée en conditions réelles, ventes doublées papier/POS pendant 3 jours, puis bascule

## ORDRE DES PROMPTS CLAUDE CODE (suggestion de découpage des sessions)

1. « Lis docs/cdc-pos-jiaby-v2.md et ce plan. Exécute la Phase 0. »
2. « Phase 1.1–1.2 : schéma complet + migrations + repositories + ledger. Écris les tests d'intégrité d'abord. »
3. « Phase 1.3–1.5 : auth PIN + permissions + catalogue + import CSV. »
4. « Phase 2.1 : porte le moteur de prix depuis docs/pos_proto.py, avec les tests S05, S09–S14 AVANT le code. »
5. « Phase 2.2–2.3 : écran de vente + finalize atomique. Porte les tests S15–S28. »
6. « Phase 2.4 : ticket ESC/POS + fallback driver. »
7. « Phase 3 : réceptions+PMP (S01–S04), étiquettes QR, ajustements (S29, S33). »
8. « Phase 4 : cashup + 13 rapports (S30–S34). »
9. « Phase 5 : backend sync + worker + backups (S35). »
10. « Livraison : build, import réel, guides. »

> À chaque session : commencer par `npm test` (tout doit être vert), finir par `npm test` + commit. Ne jamais avancer avec un test rouge.
