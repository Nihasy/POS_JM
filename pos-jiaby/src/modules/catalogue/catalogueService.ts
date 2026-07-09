/**
 * Service catalogue — Logique CRUD produits, kits, catégories.
 *
 * Règles :
 * - Génération auto item_number si vide
 * - Contrôle d'existence des composants pour les kits
 * - Soft delete uniquement
 * - Recherche < 200 ms (index + debounce 80 ms)
 */

import type { UUID } from '@/core/domain/types';
import { itemNumber, CATEGORY_CODES } from '@/core/domain/numbering';

export interface CreateItemParams {
  name: string;
  shortName?: string;
  categoryId?: UUID | null;
  unitName?: string;
  packName?: string | null;
  qtyPerPack?: number | null;
  sellingPrice: number;
  costPrice?: number;
  qtySemiGros?: number | null;
  priceSemiGros?: number | null;
  qtyGros?: number | null;
  priceGros?: number | null;
  reorderLevel?: number | null;
  receivingQuantity?: number | null;
  photoPath?: string | null;
  categoryCode?: string | null;
}

export interface CreateKitParams {
  name: string;
  kitItemId: UUID; // Le produit "kit" dans items
  components: { itemId: UUID; quantity: number }[];
}

/**
 * Valide les données de création d'un produit.
 */
export function validateItem(params: CreateItemParams): string[] {
  const errors: string[] = [];

  if (!params.name || params.name.trim().length === 0) {
    errors.push('Le nom du produit est obligatoire.');
  }

  if (params.sellingPrice < 0) {
    errors.push('Le prix de vente ne peut pas être négatif.');
  }

  if (params.costPrice !== undefined && params.costPrice < 0) {
    errors.push('Le coût ne peut pas être négatif.');
  }

  // Validation des paliers
  if (params.priceSemiGros !== null && params.priceSemiGros !== undefined) {
    if (params.qtySemiGros === null || params.qtySemiGros === undefined) {
      errors.push('Le seuil de quantité semi-gros est requis si le prix semi-gros est défini.');
    }
    if (params.priceSemiGros >= params.sellingPrice) {
      errors.push('Le prix semi-gros doit être inférieur au prix de détail.');
    }
  }

  if (params.priceGros !== null && params.priceGros !== undefined) {
    if (params.qtyGros === null || params.qtyGros === undefined) {
      errors.push('Le seuil de quantité gros est requis si le prix gros est défini.');
    }
    if (
      params.priceSemiGros !== null &&
      params.priceSemiGros !== undefined &&
      params.priceGros >= params.priceSemiGros
    ) {
      errors.push('Le prix gros doit être inférieur au prix semi-gros.');
    }
  }

  return errors;
}

/**
 * Valide la création d'un kit.
 * Vérifie que tous les composants existent et que les quantités sont valides.
 */
export function validateKit(
  params: CreateKitParams,
  existingItemIds: Set<UUID>
): string[] {
  const errors: string[] = [];

  if (!params.name || params.name.trim().length === 0) {
    errors.push('Le nom du kit est obligatoire.');
  }

  if (!existingItemIds.has(params.kitItemId)) {
    errors.push("Le produit kit n'existe pas dans le catalogue.");
  }

  if (params.components.length === 0) {
    errors.push('Un kit doit contenir au moins un composant.');
  }

  for (const comp of params.components) {
    if (!existingItemIds.has(comp.itemId)) {
      errors.push(`Le composant ${comp.itemId} n'existe pas dans le catalogue.`);
    }
    if (comp.quantity <= 0) {
      errors.push(`La quantité du composant ${comp.itemId} doit être positive.`);
    }
  }

  return errors;
}

/**
 * Génère un numéro d'article automatique.
 */
export function generateItemNumber(
  categoryCode: string | null,
  sequence: number
): string {
  return itemNumber(categoryCode, sequence);
}

/**
 * Obtient le code catégorie à partir du nom de la catégorie.
 */
export function getCategoryCode(categoryName: string): string | null {
  const normalized = categoryName.toLowerCase().trim();
  return CATEGORY_CODES[normalized] ?? null;
}
