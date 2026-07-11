# Manuel d'utilisation — JIABY POS

**Version 0.1.0 — Juillet 2026**
Point de vente pour la boutique JIABY (Andapa) : caisse, stock, clients, rapports.
Fonctionne **entièrement hors ligne** ; la synchronisation vers le serveur se fait automatiquement dès qu'internet revient.

---

## Table des matières

1. [Présentation générale](#1-présentation-générale)
2. [Installation et premier démarrage](#2-installation-et-premier-démarrage)
3. [Connexion et sécurité](#3-connexion-et-sécurité)
4. [La Caisse — vendre pas à pas](#4-la-caisse--vendre-pas-à-pas)
5. [Le Catalogue — gérer les produits](#5-le-catalogue--gérer-les-produits)
6. [Le Stock — réceptions, inventaires, sorties](#6-le-stock--réceptions-inventaires-sorties)
7. [Les Clients et le crédit](#7-les-clients-et-le-crédit)
8. [La Session de caisse — ouverture, dépenses, clôture](#8-la-session-de-caisse--ouverture-dépenses-clôture)
9. [Les Rapports](#9-les-rapports)
10. [Les Utilisateurs (Admin)](#10-les-utilisateurs-admin)
11. [Synchronisation et mode hors ligne](#11-synchronisation-et-mode-hors-ligne)
12. [Sauvegardes](#12-sauvegardes)
13. [Raccourcis clavier](#13-raccourcis-clavier)
14. [Dépannage — questions fréquentes](#14-dépannage--questions-fréquentes)
15. [Annexe — règles de gestion](#15-annexe--règles-de-gestion)

---

## 1. Présentation générale

JIABY POS est une application de caisse installée sur le PC de la boutique. Elle gère :

- les **ventes** au comptoir : détail, semi-gros et gros, avec remises, vente au mètre, paiements espèces / MVola / crédit ;
- le **stock** : réceptions fournisseurs, inventaires, sorties (casse, don…) — le stock est calculé à partir d'un journal de mouvements infalsifiable ;
- les **clients à crédit** : plafond, solde dû, règlements ;
- la **caisse** : fond d'ouverture, dépenses, clôture avec écart calculé automatiquement (rapport Z) ;
- les **rapports** : chiffre d'affaires, marges, valorisation du stock, produits à recommander ;
- les **devis**, les **paniers en attente** et les **retours d'articles**.

Tous les montants sont en **Ariary**, sans décimales. Les quantités peuvent être décimales (vente au mètre pour les câbles).

L'application est en français et se pilote au clavier (touches F2–F12), à la souris ou à l'écran tactile. La **douchette 2D USB** fonctionne comme un clavier : scanner un code ajoute directement l'article au panier.

### Les deux profils d'utilisateurs

| | **Admin** | **Caissier** |
|---|---|---|
| Vendre, encaisser, remises, devis, suspendre | ✔ | ✔ |
| Retour d'articles | ✔ (son PIN valide le retour) | ✖ (il faut le PIN d'un Admin) |
| Voir le catalogue et les stocks | ✔ | ✔ |
| Créer / modifier / supprimer des produits | ✔ | ✖ |
| Voir les coûts (PMP) et les marges | ✔ | ✖ |
| Réceptionner des marchandises | ✔ | ✖ |
| Valider un inventaire / ajuster le stock | ✔ | ✖ |
| Clients : consulter, créer, encaisser un règlement | ✔ | ✔ |
| Ouvrir / clôturer la caisse, saisir des dépenses | ✔ | ✔ |
| Rapports de ventes et de stock | ✔ | ✔ (sans les marges ni la valorisation) |
| Gérer les utilisateurs | ✔ | ✖ |
| Sauvegarde manuelle de la base | ✔ | ✖ |

---

## 2. Installation et premier démarrage

### Installation

1. Lancer l'installateur **`JIABY POS_0.1.0_x64-setup.exe`** (ou le MSI en français `JIABY POS_0.1.0_x64_fr-FR.msi`).
2. L'application s'installe pour l'utilisateur courant ; un raccourci **JIABY POS** apparaît dans le menu Démarrer.
3. Au premier lancement, la base de données est créée automatiquement dans `%APPDATA%\mg.jiaby.pos\`.

> Si vous relancez l'application alors qu'elle est déjà ouverte, la fenêtre existante revient au premier plan (une seule instance à la fois).

### Premier démarrage — à faire absolument

Deux comptes sont créés d'office :

| Compte | Rôle | PIN par défaut |
|---|---|---|
| `admin` | Admin | **1234** |
| `caissier` | Caissier | 1234 *(inaccessible tant que l'admin garde ce PIN — voir ci-dessous)* |

⚠ **La connexion se fait par PIN seul** (pas de nom d'utilisateur). Deux comptes ne peuvent donc pas partager le même PIN. Au premier démarrage :

1. Connectez-vous avec **1234** (vous arrivez sur le compte Admin).
2. Allez dans **Utilisateurs** → ligne `caissier` → **Changer PIN** → donnez-lui son propre PIN (ex. 5678).
3. Toujours dans **Utilisateurs** → ligne `admin` → **Changer PIN** → remplacez 1234 par un PIN confidentiel.
4. Remettez le catalogue : soit par l'import historique (voir l'équipe technique), soit produit par produit dans **Catalogue**.

---

## 3. Connexion et sécurité

### Se connecter

Tapez votre **PIN (4 à 6 chiffres)** sur le pavé numérique à l'écran (ou au clavier) puis **Se connecter**. Le nom de l'utilisateur connecté et son rôle s'affichent en haut à droite.

### En cas d'erreur

- *« Code PIN incorrect. N tentative(s) restante(s). »* — le pavé se vide, retapez.
- Après **5 échecs**, les comptes sont **verrouillés 1 minute** : *« Compte verrouillé. Veuillez patienter 1 minute. »* Un Admin peut aussi déverrouiller immédiatement depuis l'écran **Utilisateurs**.

### Se déconnecter

Bouton **Déconnexion** en haut à droite. Le panier en cours est vidé et l'écran revient au PIN. **Déconnectez-vous dès que vous quittez la caisse.**

---

## 4. La Caisse — vendre pas à pas

> **Préalable : une session de caisse doit être ouverte** (voir §8). Sinon l'écran affiche *« Aucune session de caisse ouverte »* et la vente est impossible.

L'écran est en deux colonnes : **recherche de produits** à gauche, **panier** à droite. En bas, le rail des raccourcis F2–F12.

### 4.1 Ajouter des articles

- **À la douchette** : scannez le code — l'article est ajouté au panier.
- **Au clavier** : `F2` place le curseur dans la recherche ; tapez un bout du nom (« torche ») ou la référence (« JIA-TORC-0002 »), puis cliquez sur la carte du produit. Chaque carte affiche le prix de détail, le **stock restant** (avec ⚠ si le stock est bas) et les prix de palier existants.
- Cliquer plusieurs fois sur le même produit **cumule la quantité** sur la même ligne.

### 4.2 Modifier une ligne du panier

- **Quantité** : chaque ligne a un champ quantité modifiable. Les décimales ne sont acceptées **que pour les unités mètre (m) et kilogramme (kg)** — pour vendre 2,5 m de câble, tapez `2.5`. Les articles vendus **à la pièce** (pièce, rouleau, lot, paire) n'acceptent que des quantités entières : la virgule est refusée.
- **Supprimer** : bouton ✕ au bout de la ligne.
- Le **palier de prix se recalcule automatiquement** quand la quantité change (voir ci-dessous) ; un badge *Semi-gros* ou *Gros* apparaît sur la ligne.

### 4.3 Les paliers de prix (détail / semi-gros / gros)

Chaque produit peut avoir jusqu'à trois prix, appliqués **automatiquement selon la quantité de la ligne** :

| Palier | Condition | Exemple câble 2,5 mm² |
|---|---|---|
| Détail | quantité < seuil semi-gros | 4 000 Ar/m |
| Semi-gros | quantité ≥ seuil semi-gros (ex. 20) | 3 500 Ar/m |
| Gros | quantité ≥ seuil gros (ex. 100) | 3 000 Ar/m |

Exemple : 100 m de câble → 100 × 3 000 = **300 000 Ar** (le prix gros s'applique tout seul, rien à faire).

### 4.4 Remise globale (`F4`)

`F4` ouvre la remise sur **l'ensemble du ticket** :

- **Pourcentage** (0 à 100) ou **montant en Ariary** (limité au sous-total) ;
- le total est recalculé immédiatement ; la remise est visible sur le ticket ;
- pour l'annuler : `F4` → **Retirer la remise actuelle**.

**Ordre de calcul contractuel** : palier → prix négocié → remise ligne → **remise globale**. La remise globale s'applique donc en dernier, sur le total des lignes.

### 4.5 Associer un client (`F6`)

`F6` ouvre le sélecteur de clients (recherche par nom ou téléphone). Le nom s'affiche en haut du panier. **Obligatoire pour vendre à crédit.** Le sélecteur montre le solde dû et le plafond de chaque client.

### 4.6 Encaisser (`F10`)

`F10` (ou le bouton vert **F10 Encaisser**) ouvre la fenêtre de paiement. Trois modes, **combinables sur une même vente** :

**Espèces**
Tapez le montant reçu sur le pavé puis `↵`. Si le client donne plus que le dû, le **rendu s'affiche automatiquement** (ex. total 3 000, reçu 5 000 → *Rendu : 2 000 Ar*). Le rendu n'est possible **que sur les espèces**.

**MVola**
Sélectionnez **MVola**, saisissez la **référence de transaction (obligatoire)**, puis le montant et `↵`. Un paiement MVola **ne peut pas dépasser le reste à payer** (*« Trop-perçu refusé »* sinon) : le trop-perçu n'existe qu'en espèces.

**Crédit**
Sélectionnez **Crédit** — un **client doit être associé** (`F6`), sinon : *« Client obligatoire pour le paiement à crédit »*. Le montant est ajouté au **solde dû** du client. Si `solde actuel + crédit demandé > plafond`, la vente est **bloquée** : *« Plafond crédit dépassé »*.

**Paiement mixte** : ajoutez plusieurs paiements l'un après l'autre (ex. MVola 5 000 + espèces 10 000 pour un total de 15 000). La fenêtre affiche *Payé* et *Reste à payer* au fur et à mesure. Le bouton ✕ retire un paiement saisi par erreur.

La fenêtre de paiement affiche en haut le **récapitulatif de la commande** (chaque article, sa quantité, son total, la remise éventuelle) — vérifiez-le avant de confirmer.

Quand le total payé couvre le dû, cliquez **Encaisser** : la vente reçoit un numéro (**V-2026-00001**), le stock est décrémenté, le panier se vide, et la **facture (ticket de caisse)** s'affiche à l'écran au format 80 mm — comme au supermarché : articles, quantités, remises, total, paiements et rendu. Cliquez **Imprimer** pour la sortir sur l'imprimante à tickets, ou **Fermer** pour passer au client suivant. **Annuler** (avant d'encaisser) referme la fenêtre sans rien enregistrer.

> Si le stock est insuffisant, la vente entière est refusée : *« Stock insuffisant — <produit> : demandé X, disponible Y »*. Rien n'est enregistré (tout ou rien).

### 4.7 Suspendre / rappeler un panier (`F8` / `F9`)

Un client s'absente ? **`F8` suspend le panier** (numéro P-2026-NNNNN) et libère la caisse pour le client suivant. **`F9`** liste les paniers suspendus et les devis en attente ; cliquez pour recharger le panier tel quel (articles, prix, client). Un panier rappelé est retiré de la liste.

### 4.8 Devis (proforma)

Panier rempli → bouton **Devis** : un devis **D-2026-NNNNN** est créé, **sans aucun mouvement de stock ni paiement**, et le **proforma s'affiche aussitôt** au format 80 mm — en-tête « DEVIS PROFORMA », articles, quantités, total, mentions « Devis valable 7 jours » et « Ceci n'est pas une facture ». Cliquez **Imprimer** pour le remettre au client, ou **Fermer**. Pour transformer le devis en vente : `F9`, choisissez le devis (badge DEVIS), le panier se recharge, puis encaissez normalement — la vente prend un numéro V- et le devis est archivé.

### 4.9 Retours d'articles

Panier vide → bouton **Retour d'articles…** :

1. Saisissez le **numéro de la vente d'origine** (V-2026-00001) → **Chercher**.
2. Indiquez la **quantité retournée** ligne par ligne (retour partiel possible, jamais plus que la quantité vendue). Le remboursement est calculé **au prix payé à l'origine, remises comprises**.
3. Choisissez le mode de remboursement : **Espèces** ou **MVola** (référence obligatoire).
4. **Saisissez le PIN d'un Admin** — sans lui, le retour est refusé (*« PIN admin invalide — retour refusé »*).
5. **Valider le retour** : un avoir **R-2026-NNNNN** est créé et le stock est ré-crédité.

Restrictions : seule une **vente finalisée** peut faire l'objet d'un retour (pas un devis, pas un avoir). Si la vente était à crédit, le retour diminue le solde dû du client.

---

## 5. Le Catalogue — gérer les produits

Recherche instantanée par **nom, nom court ou référence**. Chaque ligne montre : référence, **stock actuel** (⚠ si sous le seuil), prix détail, badges des paliers, et — pour l'Admin — le **PMP** (coût moyen pondéré).

### Créer un produit (Admin) — bouton « + Nouveau »

| Champ | À quoi ça sert |
|---|---|
| **Nom** * | Nom complet affiché partout |
| Nom court | Version courte imprimée sur le ticket (30 caractères max) |
| Catégorie | Classement (Câbles, Torches, Solaire, Audio, Électricité, Accessoires) — sert aussi à générer la référence |
| Référence | **Suggérée automatiquement** en direct depuis la catégorie + le nom court (ex. `ELEC-PRIS-005`) ; modifiable avant l'enregistrement, figée ensuite (les étiquettes QR imprimées doivent rester valables) |
| Fournisseur (optionnel) | Fournisseur habituel du produit — permet de **filtrer l'inventaire** et de retrouver ses produits en tête de liste à la réception |
| Unité | pièce, **mètre**, kg, rouleau, lot, paire — l'unité « m » permet les quantités décimales |
| Conditionnement + Qté/pack | Ex. « carton » de 24 : à la réception vous saisissez des cartons, l'app convertit en unités |
| **Prix de vente (détail)** * | Prix palier 1 |
| Coût (PMP initial) | Coût de départ ; ensuite recalculé automatiquement à chaque réception |
| Seuil + prix semi-gros | Palier 2 (le prix doit être **inférieur** au détail) |
| Seuil + prix gros | Palier 3 (prix < semi-gros, seuil > seuil semi-gros) — l'app refuse les paliers incohérents |
| Seuil réappro. | En dessous de ce stock : alerte ⚠ + apparition dans le rapport « Stock bas » |
| Qté par défaut en réception | Pré-remplit la colonne « Unités » à la réception |

La **référence** est générée automatiquement à partir de la catégorie et du nom court (ex. `ELEC-PRIS-005`), et une catégorie peut être **créée à la volée** via « + Nouvelle catégorie… » dans le formulaire.

### Modifier / supprimer

- **Modifier** : cliquez sur la ligne du produit, changez, **Enregistrer**.
- **Supprimer** (Admin) : bouton 🗑 + confirmation. Le produit disparaît du catalogue et de la vente, mais **l'historique des ventes passées reste intact** (suppression logique, jamais physique).

### Import CSV du catalogue (Admin)

Pour entrer beaucoup de produits d'un coup au lieu de la saisie manuelle : **Catalogue → Import CSV**.

1. **Télécharger le modèle** : un fichier `modele_catalogue.csv` avec les bons en-têtes et une ligne d'exemple (enregistré dans Téléchargements). Remplissez-le dans Excel — colonnes obligatoires : `nom` et `prix_detail` ; les autres (nom_court, categorie, fournisseur, unite, conditionnement, qte_par_pack, cout, paliers, seuil_reappro, **stock_initial**) sont optionnelles.
2. Choisissez votre fichier : un **aperçu** s'affiche avec le nombre de produits valides et les **erreurs ligne par ligne** (prix non entier, paliers incohérents, doublons…) — les lignes en erreur sont ignorées, les autres importées.
3. **Importer** : tout passe en une seule opération (tout ou rien). Les **catégories et fournisseurs inconnus sont créés automatiquement**, le `stock_initial` génère une écriture d'ouverture dans le journal de stock, et chaque produit reçoit sa référence auto. Un produit dont le nom existe déjà est ignoré (listé).

### Étiquettes QR

Après chaque réception, l'application **propose d'imprimer les étiquettes** des unités reçues : planche A4 de **24** ou **40** étiquettes (QR + nom + prix), à coller sur les produits pour le scan en caisse. « Plus tard » passe l'étape.

---

## 6. Le Stock — réceptions, inventaires, sorties

> **Règle d'or : le stock n'est jamais modifié « à la main ».** Chaque mouvement (réception, vente, retour, ajustement, sortie) est une écriture datée et signée dans un journal. Le stock affiché est la somme de ce journal — toute correction passe par une contre-écriture, jamais par un effacement.

### 6.1 Réception de marchandises (onglet « Réception », Admin)

Pour enregistrer une arrivée fournisseur (lot d'import, achat grossiste) :

1. Choisissez le **fournisseur** (facultatif) et saisissez la **réf. du lot** (ex. `IMPORT-CN-07`).
2. Ajoutez les produits via la **recherche** : tapez un mot-clé (nom) ou une **référence**, cliquez sur le résultat — chaque résultat montre la référence, le stock actuel, et un badge « Ce fournisseur » pour les produits du fournisseur choisi (affichés en premier). **À la douchette** : scannez l'étiquette (référence exacte + Entrée), la ligne s'ajoute directement — idéal pour pointer un arrivage article par article.
3. Pour chaque ligne, saisissez :
   - **Cartons** : nombre de conditionnements entiers (convertis via la qté/pack du produit). Si le produit n'a pas de conditionnement défini, cette colonne affiche « — » ;
   - **Unités** : unités en vrac en plus des cartons (décimales acceptées uniquement pour m et kg) ;
   - **Coût unitaire** : prix d'achat par unité de vente, en Ariary.
4. La colonne **Total unités** et le **Nouveau PMP** se calculent en direct — vérifiez avant de valider.
5. **Valider la réception** : le stock augmente, le PMP du produit est mis à jour, et l'impression d'étiquettes est proposée.

Exemple : Torche (carton de 24), stock 48 au PMP 8 000. Réception de 2 cartons + 2 unités à 9 000 Ar :
50 unités reçues → nouveau PMP = (48×8 000 + 50×9 000) / 98 = **8 510 Ar**, stock 98.

L'enregistrement est **tout ou rien** : en cas de coupure de courant pendant la validation, soit toute la réception est enregistrée, soit rien — jamais une moitié.

### 6.2 Inventaire (onglet « Inventaire & ajustements »)

Pour compter le stock réel et corriger les écarts :

1. Filtrez par **catégorie** et/ou **fournisseur** (comptage rayon par rayon ou contrôle d'un arrivage) — la liste est triée par référence.
2. Saisissez la quantité **comptée** en face de chaque produit — l'**écart** (compté − théorique) s'affiche en vert (+) ou orange (−). Les produits non comptés ne sont pas touchés.
3. **Valider l'inventaire (Admin)** : une écriture d'ajustement est créée **pour chaque écart** (les lignes sans écart ne génèrent rien) et le stock théorique est corrigé.

### 6.3 Sortie manuelle

Pour sortir du stock hors vente : bouton **Sortie manuelle** → produit, quantité, **raison** (Casse, Don, Usage interne, Péremption, Vol) et **motif détaillé obligatoire**. La sortie est tracée dans le journal avec votre nom.

---

## 7. Les Clients et le crédit

L'écran **Clients** liste les clients avec **Solde dû**, **Plafond** et **Disponible** (plafond − solde). L'**encours crédit total** de la boutique est affiché en haut.

### Créer un client

**+ Nouveau client** → Nom (obligatoire), prénom, téléphone, **plafond crédit** en Ariary. Le plafond est le crédit maximum que ce client peut cumuler ; 0 = pas de crédit autorisé.

### Vendre à crédit

Voir §4.6 : associez le client (`F6`), encaissez en **Crédit**. Le solde dû augmente. L'application bloque toute vente qui ferait dépasser le plafond.

### Encaisser un règlement

Quand le client vient rembourser : ligne du client → **Règlement** → saisissez le montant (ou bouton **Solde complet**) → **Encaisser le règlement**. Le solde diminue. Un règlement **supérieur au solde dû est refusé**.

---

## 8. La Session de caisse — ouverture, dépenses, clôture

La session encadre la journée de vente. **Sans session ouverte, la caisse est bloquée.**

### Ouvrir la session (début de journée)

Écran **Session** → saisissez le **fond d'ouverture** (les espèces mises dans le tiroir, ex. 50 000 Ar) → **Ouvrir**. La pastille du haut passe à « Session ouverte ». Une seule session à la fois.

### Enregistrer une dépense (en cours de journée)

Toute sortie d'espèces du tiroir (taxi, repas, fournitures…) doit être saisie : **catégorie** (transport, repas, fournitures, entretien, communication, divers), **montant**, **motif** → **+ Ajouter**. Sinon la clôture affichera un manquant injustifié.

### Clôturer (fin de journée) — le rapport Z

Le résumé affiche : ventes espèces (nettes des rendus), retours espèces, dépenses, **Attendu**, ainsi que les totaux **MVola** et **Crédit** (pour information — ils ne sont pas dans le tiroir).

> **Attendu = fond d'ouverture + ventes espèces − retours espèces − dépenses**

1. **Comptez physiquement le tiroir** et saisissez le montant dans « Espèces comptées ».
2. L'**écart** s'affiche instantanément : *Caisse juste ✓*, *Excédent : +N Ar* ou *Manquant : −N Ar*.
3. Ajoutez une note si nécessaire (explication d'un écart), puis **Clôturer**.

La session est archivée avec l'attendu, le compté et l'écart. Il faudra rouvrir une session pour vendre à nouveau.

---

## 9. Les Rapports

Écran **Rapports**. Filtre de période en haut à droite : **Aujourd'hui / 7 jours / 30 jours / 90 jours**, ou **Dates précises…** qui affiche deux champs **Du / au** pour choisir une plage exacte (bornes incluses — mettre la même date dans les deux champs donne le rapport d'une seule journée). Le bouton **Export CSV** exporte le rapport affiché sur la période choisie : sous l'application de bureau, le fichier est enregistré dans votre dossier **Téléchargements** (chemin affiché en confirmation) ; il s'ouvre dans Excel avec les accents corrects.

| Rapport | Contenu |
|---|---|
| **Ventes détaillées** | Liste des ventes de la période (date, numéro, total) + CA total |
| **Synthèse CA** | Chiffre d'affaires de la période, nombre de ventes, panier moyen |
| **Par produit** | Stock actuel et quantités vendues sur 30 et 90 jours, produit par produit |
| **Stock bas** | Produits **sous leur seuil de réappro** avec le déficit — c'est la liste d'achat pour le prochain import |
| **Valorisation** *(Admin)* | Valeur totale du stock = Σ quantité × PMP |
| **Vélocité** | Ventes/jour par produit et **jours de stock restants** (en orange sous 7 jours) — pour calibrer les commandes |

---

## 10. Les Utilisateurs (Admin)

Écran **Utilisateurs** (visible uniquement en Admin, `Ctrl+7`).

- **+ Nouvel utilisateur** : identifiant, nom complet, rôle (Caissier ou Admin), PIN + confirmation. **Chaque PIN doit être unique** (la connexion se fait par PIN seul) — un PIN déjà pris est refusé.
- **Changer PIN** : nouveau PIN + confirmation. Déverrouille le compte au passage. À utiliser aussi si quelqu'un a oublié son PIN.
- **Désactiver** : le compte ne peut plus se connecter (l'historique de ses ventes reste). Impossible de désactiver **son propre compte** ou **le dernier Admin**.
- **Réactiver** : rétablit un compte désactivé en lui définissant un **nouveau PIN** (obligatoire — son ancien PIN a pu être attribué à quelqu'un d'autre entre-temps).
- **Déverrouiller** : lève immédiatement le blocage « 5 échecs ».

**Bonnes pratiques** : un compte par personne (les ventes, retours et ajustements sont tracés par utilisateur) ; PIN confidentiels ; désactivez le compte d'un employé qui part.

---

## 11. Synchronisation et mode hors ligne

L'application fonctionne **d'abord en local** : coupure internet ou serveur injoignable ne bloquent **jamais** la vente.

- La pastille en haut indique l'état : **Synchronisé** / **Hors ligne**, avec le nombre d'opérations **en attente** d'envoi.
- Chaque vente, réception, ajustement, clôture et règlement est mis en file et envoyé au serveur **toutes les 30 secondes** dès que la connexion existe. Même après **plusieurs jours hors ligne**, tout est rattrapé sans doublon.
- Règle de conflit : **la boutique est la référence** pour les ventes et le stock ; le serveur est la référence pour le catalogue central.

Aucune action n'est requise de votre part — la synchronisation est automatique (si elle est activée dans la configuration).

---

## 12. Sauvegardes

- **Sauvegarde manuelle** (Admin) : bouton **Sauvegarde** en haut à droite. Une copie complète et cohérente de la base est créée dans `%APPDATA%\mg.jiaby.pos\backups\` (fichiers `pos-jiaby_AAAA-MM-JJ-HH-MM-SS.db`).
- Les sauvegardes de **plus de 30 jours sont purgées automatiquement**.
- **Recommandé** : sauvegardez au moins une fois par jour (après la clôture) et copiez régulièrement le dossier `backups` sur une clé USB gardée hors de la boutique.

---

## 13. Raccourcis clavier

### Navigation (partout)

| Touches | Écran |
|---|---|
| `Ctrl+1` | Caisse |
| `Ctrl+2` | Catalogue |
| `Ctrl+3` | Stock |
| `Ctrl+4` | Clients |
| `Ctrl+5` | Session |
| `Ctrl+6` | Rapports |
| `Ctrl+7` | Utilisateurs (Admin) |

### Dans la Caisse

| Touche | Action |
|---|---|
| `F2` | Curseur dans la recherche produit |
| `F4` | Remise globale |
| `F6` | Associer un client |
| `F8` | Suspendre le panier |
| `F9` | Rappeler un panier suspendu / un devis |
| `F10` | Encaisser |

---

## 14. Dépannage — questions fréquentes

**« Aucune session de caisse ouverte » — je ne peux pas vendre.**
Ouvrez une session : écran **Session** → fond d'ouverture → **Ouvrir** (§8).

**J'ai oublié mon PIN.**
Un Admin va dans **Utilisateurs** → votre ligne → **Changer PIN**. Si c'est le **seul Admin** qui a oublié son PIN, contactez le support technique (intervention sur la base nécessaire).

**« Compte verrouillé (1 min) ».**
Cinq PIN erronés d'affilée. Attendez 1 minute, ou demandez à un Admin de **Déverrouiller** dans l'écran Utilisateurs.

**« Ce PIN est déjà utilisé par un autre compte. »**
Normal : la connexion se fait par PIN seul, chaque compte doit avoir le sien. Choisissez-en un autre.

**« Stock insuffisant » à l'encaissement.**
Le stock théorique est inférieur à la quantité demandée. Vérifiez le stock réel : s'il y a bien la marchandise en rayon, faites un **inventaire** (§6.2) pour corriger, puis réencaissez.

**« Plafond crédit dépassé ».**
Le client a atteint sa limite. Encaissez en espèces/MVola, faites-lui régler une partie de son solde (§7), ou faites augmenter son plafond par un Admin (écran Clients — modification du client).

**Le ticket ne s'imprime pas.**
La vente **est bien enregistrée** (le message « Ticket non imprimé » le confirme). Vérifiez l'imprimante (allumée, papier, câble USB, définie par défaut dans Windows), puis retrouvez la vente dans les Rapports.

**L'écart de clôture n'est pas zéro.**
Recomptez le tiroir ; vérifiez que toutes les **dépenses** ont été saisies et que les **rendus** ont été corrects. Notez l'explication dans le champ Note avant de clôturer — l'écart reste archivé.

**La pastille reste « Hors ligne ».**
Vérifiez la connexion internet du PC. Les ventes continuent normalement ; tout sera synchronisé au retour du réseau. Si le problème persiste avec internet fonctionnel, contactez le support (adresse du serveur dans la configuration).

**Coupure de courant pendant une vente / réception.**
Aucune donnée à moitié écrite : chaque opération est enregistrée **en entier ou pas du tout**. Au redémarrage, vérifiez dans les Rapports si la dernière vente a bien été enregistrée ; sinon refaites-la.

**Où est la base de données ?**
`%APPDATA%\mg.jiaby.pos\pos-jiaby.db`. Ne la déplacez pas et ne la modifiez jamais directement — utilisez les sauvegardes (§12).

---

## 15. Annexe — règles de gestion

**Numérotation des pièces** (remise à zéro chaque année) :

| Préfixe | Pièce |
|---|---|
| `V-2026-00001` | Vente |
| `D-2026-00001` | Devis |
| `R-2026-00001` | Retour (avoir) |
| `P-2026-00001` | Panier suspendu |

**PMP (coût moyen pondéré)** — recalculé à chaque réception :
`nouveau PMP = (stock actuel × PMP actuel + quantité reçue × coût unitaire) ÷ (stock actuel + quantité reçue)`, arrondi à l'Ariary. Le coût d'un article est **figé au moment de chaque vente** : les marges des rapports sont exactes même si le PMP change ensuite.

**Ordre de calcul d'un prix de ligne** : ① palier selon quantité → ② prix négocié éventuel → ③ remise de ligne → ④ remise globale sur le total.

**Rendu de monnaie** : uniquement sur les espèces. Un trop-perçu MVola ou crédit est refusé.

**Suppression** : rien n'est jamais effacé physiquement (produits, clients, ventes) — tout est désactivé et l'historique reste cohérent.

**Traçabilité** : chaque mouvement de stock et chaque vente porte l'utilisateur, la date et la pièce d'origine.

---

*Manuel rédigé pour JIABY POS v0.1.0 — en cas de question non couverte, contactez le support technique.*
