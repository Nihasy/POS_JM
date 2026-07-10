/**
 * Types du domaine métier JIABY POS.
 *
 * Tous les IDs sont des UUID v4 (générés côté client pour la sync offline).
 * Tous les montants sont en INTEGER (Ariary, pas de décimales).
 * Les quantités sont en REAL (vente au mètre possible).
 */

// ─── IDs ───────────────────────────────────────────────────────────
export type UUID = string;

// ─── Énumérations ──────────────────────────────────────────────────
export type PaymentMethod = 'ESPECES' | 'MVOLA' | 'CREDIT';
export type SaleStatus = 'COMPLETED' | 'SUSPENDED' | 'CANCELLED';
export type QuoteStatus = 'DRAFT' | 'CONVERTED' | 'EXPIRED';
export type InventoryRefType =
  | 'SALE'
  | 'RETURN'
  | 'RECEIVING'
  | 'ADJUSTMENT'
  | 'OPENING'
  | 'MANUAL_OUT';
export type SyncEventType = 'SALE' | 'RECEIVING' | 'ADJUSTMENT' | 'CASHUP' | 'CUSTOMER_PAYMENT';

// ─── Produits / Catalogue ──────────────────────────────────────────
export interface Item {
  id: UUID;
  item_number: string; // JIA-XXXX-NNNN (auto-généré si vide)
  name: string;
  short_name: string;
  category_id: UUID | null;
  unit_name: string; // 'pièce', 'm', 'kg', 'rouleau'…
  pack_name: string | null; // 'carton', 'lot'…
  qty_per_pack: number | null; // nombre d'unités par conditionnement
  cost_price: number; // PMP (coût moyen pondéré) — INTEGER Ariary
  selling_price: number; // prix de détail — INTEGER Ariary
  qty_semi_gros: number | null; // seuil quantité semi-gros
  price_semi_gros: number | null; // prix semi-gros
  qty_gros: number | null; // seuil quantité gros
  price_gros: number | null; // prix gros
  reorder_level: number | null; // seuil de réapprovisionnement
  receiving_quantity: number | null; // qté par défaut en réception
  photo_path: string | null;
  deleted: number; // 0 = actif, 1 = soft delete
  created_at: string;
  updated_at: string;
}

export interface ItemQuantity {
  item_id: UUID;
  quantity: number; // cache recalculable = Σ inventory
}

export interface Category {
  id: UUID;
  name: string;
  parent_id: UUID | null;
  sort_order: number;
}

export interface Kit {
  id: UUID;
  name: string;
  kit_item_id: UUID; // le produit "kit" dans items
  deleted: number;
}

export interface KitItem {
  id: UUID;
  kit_id: UUID;
  component_item_id: UUID;
  quantity: number; // qté du composant nécessaire pour le kit
}

// ─── Clients ───────────────────────────────────────────────────────
export interface Customer {
  id: UUID;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  balance_due: number; // solde crédit — INTEGER Ariary
  credit_limit: number; // plafond crédit — INTEGER Ariary
  deleted: number;
  created_at: string;
  updated_at: string;
}

// ─── Fournisseurs ──────────────────────────────────────────────────
export interface Supplier {
  id: UUID;
  name: string;
  phone: string | null;
  category: string | null;
  deleted: number;
}

// ─── Stock / Inventory ─────────────────────────────────────────────
export interface InventoryTransaction {
  id: UUID;
  item_id: UUID;
  quantity: number; // positif = entrée, négatif = sortie
  cost_price: number | null; // coût unitaire au moment de la transaction
  ref_type: InventoryRefType;
  ref_id: UUID; // ID de la vente, réception, ajustement…
  user_id: UUID;
  comment: string | null;
  created_at: string;
}

// ─── Ventes ────────────────────────────────────────────────────────
export interface Sale {
  id: UUID;
  sale_number: string; // V-2026-NNNNN (ou D-2026-NNNNN pour devis, R-2026-NNNNN pour retour)
  customer_id: UUID | null;
  user_id: UUID;
  status: SaleStatus;
  subtotal: number;
  discount_global_percent: number | null;
  discount_global_amount: number | null;
  total: number;
  is_quote: number; // 0 = vente, 1 = devis
  is_return: number; // 0 = normal, 1 = retour
  original_sale_id: UUID | null; // pour les retours
  created_at: string;
}

export interface SaleItem {
  id: UUID;
  sale_id: UUID;
  item_id: UUID;
  name_snapshot: string; // nom figé au moment de la vente
  quantity: number;
  catalog_price: number; // prix catalogue au moment de la vente
  applied_price: number; // prix réellement appliqué
  discount_percent: number | null;
  discount_amount: number | null;
  line_total: number;
  cost_price_snapshot: number; // coût FIGÉ au moment de la vente (S07)
  tier_applied: 'detail' | 'semi-gros' | 'gros' | null;
}

export interface SalePayment {
  id: UUID;
  sale_id: UUID;
  method: PaymentMethod;
  amount: number;
  reference: string | null; // obligatoire pour MVOLA
  change_given: number | null; // rendu (espèces uniquement)
}

// ─── Sessions de caisse ────────────────────────────────────────────
export interface CashupSession {
  id: UUID;
  user_id: UUID;
  opening_amount: number;
  closing_amount: number | null;
  expected_cash: number | null;
  counted_cash: number | null;
  cash_difference: number | null;
  note: string | null;
  opened_at: string;
  closed_at: string | null;
}

export interface CashupExpense {
  id: UUID;
  session_id: UUID;
  category: string;
  amount: number;
  reason: string;
  created_at: string;
}

// ─── Sync ──────────────────────────────────────────────────────────
export interface SyncQueueEvent {
  id: UUID;
  event_type: SyncEventType;
  entity_id: UUID;
  payload: string; // JSON
  created_at: string;
  synced_at: string | null;
  retry_count: number;
}

// ─── Auth ──────────────────────────────────────────────────────────
export interface User {
  id: UUID;
  username: string;
  pin_hash: string;
  full_name: string;
  role: 'admin' | 'caissier';
  failed_attempts: number;
  locked_until: string | null;
  deleted: number;
}

export interface Permission {
  id: UUID;
  module_id: string;
  description: string;
}

export interface UserGrant {
  id: UUID;
  user_id: UUID;
  permission_id: UUID;
}

// ─── Config ────────────────────────────────────────────────────────
export interface AppConfig {
  key: string;
  value: string;
}

// ─── Panier (état UI, pas persisté) ────────────────────────────────
export interface CartLine {
  tempId: string; // UUID temporaire pour la clé React
  itemId: UUID;
  name: string;
  quantity: number;
  unitPrice: number; // prix catalogue
  appliedPrice: number; // après palier
  discountPercent: number | null;
  discountAmount: number | null;
  lineTotal: number; // après prix, remise
  tierApplied: 'detail' | 'semi-gros' | 'gros' | null;
  isKit: boolean;
  // Paliers de l'article — nécessaires pour recalculer le palier
  // quand la quantité change dans le panier (vente au mètre, S09–S11)
  priceSemiGros?: number | null;
  priceGros?: number | null;
  qtySemiGros?: number | null;
  qtyGros?: number | null;
}

export interface CartPayment {
  method: PaymentMethod;
  amount: number;
  reference: string | null;
}
