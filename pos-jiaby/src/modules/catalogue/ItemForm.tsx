import { useState } from 'react';
import { MontantAr } from '@/components';
import { buildItemReference } from '@/core/domain/numbering';

interface ItemFormData {
  name: string;
  shortName: string;
  categoryId: string;
  /** Catégorie à créer (renseignée via « + Nouvelle catégorie… »). */
  newCategoryName: string;
  supplierId: string;
  /** Référence : vide = suggestion automatique (catégorie + nom court). */
  itemNumber: string;
  unitName: string;
  packName: string;
  qtyPerPack: number | null;
  sellingPrice: string; // en saisie texte
  costPrice: string;
  qtySemiGros: string;
  priceSemiGros: string;
  qtyGros: string;
  priceGros: string;
  reorderLevel: string;
  receivingQuantity: string;
}

const EMPTY_FORM: ItemFormData = {
  name: '',
  shortName: '',
  categoryId: '',
  newCategoryName: '',
  supplierId: '',
  itemNumber: '',
  unitName: 'pièce',
  packName: '',
  qtyPerPack: null,
  sellingPrice: '',
  costPrice: '',
  qtySemiGros: '',
  priceSemiGros: '',
  qtyGros: '',
  priceGros: '',
  reorderLevel: '',
  receivingQuantity: '',
};

interface ItemFormProps {
  initialData?: Partial<ItemFormData>;
  categories: { id: string; name: string }[];
  suppliers: { id: string; name: string }[];
  /** Séquence estimée pour la suggestion de référence (création). */
  nextSeq?: number;
  /** Édition : la référence existante n'est pas modifiable. */
  isEdit?: boolean;
  /** Erreur renvoyée par l'enregistrement (référence en doublon…). */
  serverError?: string | null;
  onSave: (data: ItemFormData) => void;
  onCancel: () => void;
  saving?: boolean;
}

/**
 * Formulaire de création/édition d'un produit.
 * Tous les champs du CDC : paliers, seuils, conditionnement, photo.
 */
export function ItemForm({
  initialData,
  categories,
  suppliers,
  nextSeq = 1,
  isEdit = false,
  serverError = null,
  onSave,
  onCancel,
  saving = false,
}: ItemFormProps) {
  const [form, setForm] = useState<ItemFormData>({
    ...EMPTY_FORM,
    ...initialData,
  });
  const [errors, setErrors] = useState<string[]>([]);
  // La référence suit la suggestion tant que l'utilisateur n'y a pas touché
  const [refDirty, setRefDirty] = useState(false);

  const update = (field: keyof ItemFormData, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  // Nouvelle catégorie en cours de saisie ?
  const [creatingCategory, setCreatingCategory] = useState(
    Boolean(initialData?.newCategoryName)
  );

  // Suggestion live : catégorie (existante ou en création) + nom court + séquence
  const suggestedRef = buildItemReference(
    creatingCategory
      ? form.newCategoryName || null
      : (categories.find((c) => c.id === form.categoryId)?.name ?? null),
    form.shortName || form.name,
    nextSeq
  );
  const displayedRef = isEdit
    ? form.itemNumber
    : refDirty
      ? form.itemNumber
      : suggestedRef;

  const handleSubmit = () => {
    const errs: string[] = [];

    if (!form.name.trim()) errs.push('Le nom est obligatoire.');
    if (creatingCategory && !form.newCategoryName.trim()) {
      errs.push('Le nom de la nouvelle catégorie est obligatoire.');
    }
    if (!form.sellingPrice || Number(form.sellingPrice) < 0) {
      errs.push('Le prix de vente doit être positif.');
    }

    // Validation des paliers
    const priceSemiGros = Number(form.priceSemiGros);
    const qtySemiGros = Number(form.qtySemiGros);
    const priceGros = Number(form.priceGros);
    const qtyGros = Number(form.qtyGros);

    if (form.priceSemiGros && !form.qtySemiGros) {
      errs.push('Le seuil de quantité semi-gros est requis.');
    }
    if (form.priceGros && !form.qtyGros) {
      errs.push('Le seuil de quantité gros est requis.');
    }
    if (form.priceSemiGros && priceSemiGros >= Number(form.sellingPrice)) {
      errs.push('Le prix semi-gros doit être inférieur au prix détail.');
    }
    if (form.priceSemiGros && form.priceGros && priceGros >= priceSemiGros) {
      errs.push('Le prix gros doit être inférieur au prix semi-gros.');
    }
    if (qtySemiGros && qtyGros && qtyGros <= qtySemiGros) {
      errs.push('Le seuil gros doit être supérieur au seuil semi-gros.');
    }

    setErrors(errs);
    if (errs.length > 0) return;

    onSave({
      ...form,
      // Création : référence vide = génération automatique (unicité garantie) ;
      // saisie manuelle transmise telle quelle. Édition : référence figée.
      itemNumber: isEdit ? form.itemNumber : refDirty ? form.itemNumber.trim() : '',
    });
  };

  const inputClass =
    'w-full rounded border border-gray-300 px-3 py-2 text-sm text-encre focus:border-neutre focus:outline-none';
  const labelClass = 'block text-xs font-medium text-encre-2 mb-1';

  return (
    <div className="max-h-[70vh] overflow-y-auto">
      <div className="space-y-4 p-1">
        {/* Nom */}
        <div>
          <label className={labelClass}>Nom du produit *</label>
          <input
            className={inputClass}
            value={form.name}
            onChange={(e) => update('name', e.target.value)}
            placeholder="Ex: Câble 2.5mm² 100m"
            autoFocus
          />
        </div>

        {/* Nom court + Catégorie */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Nom court (ticket)</label>
            <input
              className={inputClass}
              value={form.shortName}
              onChange={(e) => update('shortName', e.target.value)}
              placeholder="Câble 2.5mm²"
            />
          </div>
          <div>
            <label className={labelClass}>Catégorie</label>
            <select
              className={inputClass}
              aria-label="Catégorie"
              value={creatingCategory ? '__new__' : form.categoryId}
              onChange={(e) => {
                if (e.target.value === '__new__') {
                  setCreatingCategory(true);
                  update('categoryId', '');
                } else {
                  setCreatingCategory(false);
                  setForm((p) => ({ ...p, categoryId: e.target.value, newCategoryName: '' }));
                }
              }}
            >
              <option value="">— Aucune —</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
              <option value="__new__">+ Nouvelle catégorie…</option>
            </select>
            {creatingCategory && (
              <input
                className={`${inputClass} mt-1.5`}
                aria-label="Nom de la nouvelle catégorie"
                placeholder="Nom de la nouvelle catégorie *"
                value={form.newCategoryName}
                onChange={(e) => update('newCategoryName', e.target.value)}
                autoFocus
              />
            )}
          </div>
        </div>

        {/* Référence (suggérée : catégorie + nom court) + Fournisseur */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>
              Référence {isEdit ? '(non modifiable)' : '(suggérée auto)'}
            </label>
            <input
              className={`${inputClass} font-mono uppercase`}
              aria-label="Référence"
              value={displayedRef}
              disabled={isEdit}
              onChange={(e) => {
                setRefDirty(true);
                update('itemNumber', e.target.value.toUpperCase());
              }}
              placeholder="CAT-NOM-001"
            />
            {!isEdit && !refDirty && (
              <p className="mt-0.5 text-[0.65rem] text-encre-2">
                Générée depuis la catégorie et le nom court — modifiable.
              </p>
            )}
          </div>
          <div>
            <label className={labelClass}>Fournisseur (optionnel)</label>
            <select
              className={inputClass}
              aria-label="Fournisseur"
              value={form.supplierId}
              onChange={(e) => update('supplierId', e.target.value)}
            >
              <option value="">— Aucun —</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Unité + Conditionnement */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className={labelClass}>Unité</label>
            <select
              className={inputClass}
              value={form.unitName}
              onChange={(e) => update('unitName', e.target.value)}
            >
              <option value="pièce">Pièce</option>
              <option value="m">Mètre (m)</option>
              <option value="kg">Kilogramme (kg)</option>
              <option value="rouleau">Rouleau</option>
              <option value="lot">Lot</option>
              <option value="paire">Paire</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Conditionnement</label>
            <input
              className={inputClass}
              value={form.packName}
              onChange={(e) => update('packName', e.target.value)}
              placeholder="Carton, Lot…"
            />
          </div>
          <div>
            <label className={labelClass}>Qté/pack</label>
            <input
              className={inputClass}
              type="number"
              min="0"
              step="1"
              value={form.qtyPerPack ?? ''}
              onChange={(e) =>
                setForm((p) => ({
                  ...p,
                  qtyPerPack: e.target.value ? Number(e.target.value) : null,
                }))
              }
            />
          </div>
        </div>

        {/* Prix */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Prix de vente (détail, Ar) *</label>
            <input
              className={inputClass}
              type="number"
              min="0"
              value={form.sellingPrice}
              onChange={(e) => update('sellingPrice', e.target.value)}
            />
          </div>
          <div>
            <label className={labelClass}>Coût (PMP initial, Ar)</label>
            <input
              className={inputClass}
              type="number"
              min="0"
              value={form.costPrice}
              onChange={(e) => update('costPrice', e.target.value)}
            />
          </div>
        </div>

        {/* Paliers de prix */}
        <fieldset className="rounded border border-gray-200 p-3">
          <legend className="text-xs font-semibold text-encre-2 px-1">
            Paliers de prix (optionnels)
          </legend>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Seuil semi-gros</label>
              <input
                className={inputClass}
                type="number"
                min="0"
                step="0.1"
                value={form.qtySemiGros}
                onChange={(e) => update('qtySemiGros', e.target.value)}
                placeholder="Ex: 5"
              />
            </div>
            <div>
              <label className={labelClass}>Prix semi-gros (Ar)</label>
              <input
                className={inputClass}
                type="number"
                min="0"
                value={form.priceSemiGros}
                onChange={(e) => update('priceSemiGros', e.target.value)}
                placeholder="Ex: 8500"
              />
            </div>
            <div>
              <label className={labelClass}>Seuil gros</label>
              <input
                className={inputClass}
                type="number"
                min="0"
                step="0.1"
                value={form.qtyGros}
                onChange={(e) => update('qtyGros', e.target.value)}
                placeholder="Ex: 20"
              />
            </div>
            <div>
              <label className={labelClass}>Prix gros (Ar)</label>
              <input
                className={inputClass}
                type="number"
                min="0"
                value={form.priceGros}
                onChange={(e) => update('priceGros', e.target.value)}
                placeholder="Ex: 7000"
              />
            </div>
          </div>
        </fieldset>

        {/* Stock */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Seuil réappro. (alerte stock bas)</label>
            <input
              className={inputClass}
              type="number"
              min="0"
              step="0.1"
              value={form.reorderLevel}
              onChange={(e) => update('reorderLevel', e.target.value)}
            />
          </div>
          <div>
            <label className={labelClass}>Qté par défaut en réception</label>
            <input
              className={inputClass}
              type="number"
              min="0"
              step="0.1"
              value={form.receivingQuantity}
              onChange={(e) => update('receivingQuantity', e.target.value)}
            />
          </div>
        </div>

        {/* Aperçu du prix */}
        {form.sellingPrice && (
          <div className="rounded bg-atelier px-3 py-2 text-center">
            <span className="text-xs text-encre-2">Prix affiché : </span>
            <MontantAr value={Number(form.sellingPrice) || 0} />
          </div>
        )}

        {/* Erreur serveur (référence en doublon…) */}
        {serverError && (
          <div className="rounded bg-red-50 p-3">
            <p className="text-sm text-red-600">{serverError}</p>
          </div>
        )}

        {/* Erreurs */}
        {errors.length > 0 && (
          <div className="rounded bg-red-50 p-3">
            {errors.map((err, i) => (
              <p key={i} className="text-sm text-red-600">
                {err}
              </p>
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="mt-6 flex justify-end gap-3 border-t border-gray-200 pt-4">
        <button
          onClick={onCancel}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-encre-2 hover:bg-gray-50 touch-target"
        >
          Annuler
        </button>
        <button
          onClick={handleSubmit}
          disabled={saving}
          className="rounded-lg bg-neutre px-6 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 touch-target"
        >
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
    </div>
  );
}
