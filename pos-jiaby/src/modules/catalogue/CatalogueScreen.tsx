import { useState, useCallback, useMemo } from 'react';
import { SearchBox, MontantAr, Modal, Badge } from '@/components';
import { ItemForm } from './ItemForm';
import type { Item, Category } from '@/core/domain/types';
import { formatQty } from '@/core/format';

interface CatalogueScreenProps {
  items: Item[];
  categories: Category[];
  stockLevels: Map<string, number>;
  onCreateItem: (data: ReturnType<typeof getFormData>) => Promise<void>;
  onUpdateItem: (id: string, data: ReturnType<typeof getFormData>) => Promise<void>;
  onDeleteItem: (id: string) => Promise<void>;
  canEdit: boolean;
  canDelete: boolean;
  showCost: boolean;
}

// Helper pour extraire les données du formulaire
function getFormData(form: Parameters<Parameters<typeof ItemForm>[0]['onSave']>[0]) {
  return {
    name: form.name.trim(),
    shortName: form.shortName.trim() || form.name.trim().slice(0, 30),
    categoryId: form.categoryId || null,
    unitName: form.unitName || 'pièce',
    packName: form.packName || null,
    qtyPerPack: form.qtyPerPack,
    sellingPrice: Number(form.sellingPrice) || 0,
    costPrice: Number(form.costPrice) || 0,
    qtySemiGros: form.qtySemiGros ? Number(form.qtySemiGros) : null,
    priceSemiGros: form.priceSemiGros ? Number(form.priceSemiGros) : null,
    qtyGros: form.qtyGros ? Number(form.qtyGros) : null,
    priceGros: form.priceGros ? Number(form.priceGros) : null,
    reorderLevel: form.reorderLevel ? Number(form.reorderLevel) : null,
    receivingQuantity: form.receivingQuantity ? Number(form.receivingQuantity) : null,
  };
}

/**
 * Écran du catalogue produits.
 * Recherche instantanée, liste, création/édition dans une modale.
 */
export function CatalogueScreen({
  items,
  categories,
  stockLevels,
  onCreateItem,
  onUpdateItem,
  onDeleteItem,
  canEdit,
  canDelete,
  showCost,
}: CatalogueScreenProps) {
  const [search, setSearch] = useState('');
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  // Filtrer les résultats
  const filtered = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter(
      (item) =>
        item.deleted === 0 &&
        (item.name.toLowerCase().includes(q) ||
          item.short_name.toLowerCase().includes(q) ||
          item.item_number.toLowerCase().includes(q))
    );
  }, [items, search]);

  const handleCreate = useCallback(() => {
    setSelectedItem(null);
    setShowForm(true);
  }, []);

  const handleEdit = useCallback((item: Item) => {
    setSelectedItem(item);
    setShowForm(true);
  }, []);

  const handleSave = useCallback(
    async (formData: Parameters<typeof getFormData>[0]) => {
      setSaving(true);
      const data = getFormData(formData);
      if (selectedItem) {
        await onUpdateItem(selectedItem.id, data);
      } else {
        await onCreateItem(data);
      }
      setSaving(false);
      setShowForm(false);
    },
    [selectedItem, onCreateItem, onUpdateItem]
  );

  const handleDelete = useCallback(
    async (item: Item) => {
      if (confirm(`Supprimer "${item.name}" ?`)) {
        await onDeleteItem(item.id);
      }
    },
    [onDeleteItem]
  );

  return (
    <div className="flex h-full flex-col">
      {/* Barre de recherche + bouton créer */}
      <div className="mb-4 flex items-center gap-3">
        <div className="flex-1">
          <SearchBox
            onSearch={setSearch}
            placeholder="Rechercher un produit (nom, référence)…"
          />
        </div>
        {canEdit && (
          <button
            onClick={handleCreate}
            className="rounded-lg bg-neutre px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 touch-target"
          >
            + Nouveau
          </button>
        )}
      </div>

      {/* Liste des produits */}
      <div className="flex-1 overflow-auto">
        {filtered.length === 0 ? (
          <p className="py-8 text-center text-encre-2">
            {search ? 'Aucun produit trouvé.' : 'Aucun produit dans le catalogue.'}
          </p>
        ) : (
          <div className="space-y-1">
            {filtered.map((item) => {
              const stock = stockLevels.get(item.id) ?? 0;
              const lowStock = item.reorder_level !== null && stock <= item.reorder_level;
              return (
              <div
                key={item.id}
                className="flex items-center gap-3 rounded-lg bg-carte px-4 py-3 shadow-sm hover:bg-gray-50 cursor-pointer"
                onClick={() => handleEdit(item)}
                tabIndex={0}
                role="button"
                aria-label={`Modifier ${item.name}`}
              >
                {/* Infos produit */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-encre truncate">
                      {item.name}
                    </span>
                    <span className="text-xs text-encre-2 font-mono">
                      {item.item_number}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-xs text-encre-2">
                    {/* Stock */}
                    <span>
                      Stock:{' '}
                      <span className="font-mono font-semibold text-encre">
                        {formatQty(stock)}
                      </span>{' '}
                      {item.unit_name}
                    </span>
                    {/* Prix détail */}
                    <span>
                      Détail: <MontantAr value={item.selling_price} />
                    </span>
                    {/* Paliers */}
                    {item.price_semi_gros && (
                      <span className="text-neutre">
                        <Badge variant="semi-gros">Semi-gros</Badge>
                      </span>
                    )}
                    {item.price_gros && (
                      <span className="text-especes">
                        <Badge variant="gros">Gros</Badge>
                      </span>
                    )}
                    {/* Coût (admin only) */}
                    {showCost && (
                      <span className="text-alerte">
                        PMP: <MontantAr value={item.cost_price} />
                      </span>
                    )}
                  </div>
                </div>

                {/* Stock faible alerte */}
                {lowStock && (
                  <span className="text-xs text-alerte" title="Stock bas">
                    ⚠
                  </span>
                )}

                {/* Prix colonne */}
                <div className="text-right">
                  <MontantAr
                    value={item.selling_price}
                    className="text-sm font-semibold"
                  />
                </div>

                {/* Supprimer */}
                {canDelete && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(item);
                    }}
                    className="touch-target rounded px-2 py-1 text-sm text-red-500 hover:bg-red-50 ml-2"
                    aria-label={`Supprimer ${item.name}`}
                  >
                    🗑
                  </button>
                )}
              </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Compteur */}
      <div className="mt-2 text-xs text-encre-2">
        {filtered.length} produit{filtered.length > 1 ? 's' : ''}
        {search && ` pour "${search}"`}
      </div>

      {/* Modale formulaire */}
      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title={selectedItem ? `Modifier: ${selectedItem.name}` : 'Nouveau produit'}
      >
        <ItemForm
          initialData={
            selectedItem
              ? {
                  name: selectedItem.name,
                  shortName: selectedItem.short_name,
                  categoryId: selectedItem.category_id ?? '',
                  unitName: selectedItem.unit_name,
                  packName: selectedItem.pack_name ?? '',
                  qtyPerPack: selectedItem.qty_per_pack,
                  sellingPrice: String(selectedItem.selling_price),
                  costPrice: String(selectedItem.cost_price),
                  qtySemiGros: selectedItem.qty_semi_gros?.toString() ?? '',
                  priceSemiGros: selectedItem.price_semi_gros?.toString() ?? '',
                  qtyGros: selectedItem.qty_gros?.toString() ?? '',
                  priceGros: selectedItem.price_gros?.toString() ?? '',
                  reorderLevel: selectedItem.reorder_level?.toString() ?? '',
                  receivingQuantity: selectedItem.receiving_quantity?.toString() ?? '',
                }
              : undefined
          }
          categories={categories.map((c) => ({ id: c.id, name: c.name }))}
          onSave={handleSave}
          onCancel={() => setShowForm(false)}
          saving={saving}
        />
      </Modal>
    </div>
  );
}
