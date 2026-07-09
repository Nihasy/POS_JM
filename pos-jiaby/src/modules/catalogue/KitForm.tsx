import { useState } from 'react';

interface KitComponent {
  itemId: string;
  itemName: string;
  quantity: number;
}

interface KitFormProps {
  availableItems: { id: string; name: string }[];
  onSave: (data: {
    name: string;
    kitItemId: string;
    components: { itemId: string; quantity: number }[];
  }) => void;
  onCancel: () => void;
}

/**
 * Formulaire de création d'un kit.
 * Un kit est un produit composite vendu comme une seule unité.
 *
 * Règle (S24) : contrôle stock composants, refus si un composant manque.
 */
export function KitForm({ availableItems, onSave, onCancel }: KitFormProps) {
  const [name, setName] = useState('');
  const [kitItemId, setKitItemId] = useState('');
  const [components, setComponents] = useState<KitComponent[]>([]);
  const [errors, setErrors] = useState<string[]>([]);

  const addComponent = () => {
    setComponents([
      ...components,
      { itemId: '', itemName: '', quantity: 1 },
    ]);
  };

  const updateComponent = (
    index: number,
    field: 'itemId' | 'quantity',
    value: string
  ) => {
    const updated = [...components];
    if (field === 'quantity') {
      updated[index] = {
        ...updated[index]!,
        quantity: Number(value) || 0,
      };
    } else {
      const selected = availableItems.find((i) => i.id === value);
      updated[index] = {
        itemId: value,
        itemName: selected?.name || '',
        quantity: updated[index]!.quantity,
      };
    }
    setComponents(updated);
  };

  const removeComponent = (index: number) => {
    setComponents(components.filter((_, i) => i !== index));
  };

  const handleSubmit = () => {
    const errs: string[] = [];

    if (!name.trim()) errs.push('Le nom du kit est obligatoire.');
    if (!kitItemId) errs.push('Veuillez sélectionner le produit kit.');
    if (components.length === 0) errs.push('Ajoutez au moins un composant.');
    if (components.some((c) => !c.itemId)) {
      errs.push('Tous les composants doivent être renseignés.');
    }
    if (components.some((c) => c.quantity <= 0)) {
      errs.push('Les quantités des composants doivent être positives.');
    }

    // Vérifier que le kit ne se contient pas lui-même
    if (components.some((c) => c.itemId === kitItemId)) {
      errs.push('Un kit ne peut pas se contenir lui-même.');
    }

    setErrors(errs);
    if (errs.length > 0) return;

    onSave({
      name: name.trim(),
      kitItemId,
      components: components.map((c) => ({
        itemId: c.itemId,
        quantity: c.quantity,
      })),
    });
  };

  return (
    <div className="space-y-4">
      {/* Nom du kit */}
      <div>
        <label className="block text-xs font-medium text-encre-2 mb-1">
          Nom du kit *
        </label>
        <input
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-neutre focus:outline-none"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ex: Kit torche + piles"
          autoFocus
        />
      </div>

      {/* Produit kit */}
      <div>
        <label className="block text-xs font-medium text-encre-2 mb-1">
          Produit kit (dans le catalogue) *
        </label>
        <select
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-neutre focus:outline-none"
          value={kitItemId}
          onChange={(e) => setKitItemId(e.target.value)}
        >
          <option value="">— Sélectionner —</option>
          {availableItems
            .filter((i) => !components.some((c) => c.itemId === i.id))
            .map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
        </select>
      </div>

      {/* Composants */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-medium text-encre-2">
            Composants *
          </label>
          <button
            onClick={addComponent}
            className="text-xs text-neutre hover:underline"
          >
            + Ajouter un composant
          </button>
        </div>

        {components.length === 0 ? (
          <p className="text-xs text-encre-2 italic">
            Aucun composant. Cliquez "Ajouter un composant".
          </p>
        ) : (
          <div className="space-y-2">
            {components.map((comp, i) => (
              <div key={i} className="flex items-center gap-2">
                <select
                  className="flex-1 rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-neutre focus:outline-none"
                  value={comp.itemId}
                  onChange={(e) => updateComponent(i, 'itemId', e.target.value)}
                >
                  <option value="">— Sélectionner —</option>
                  {availableItems.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
                <input
                  className="w-20 rounded border border-gray-300 px-2 py-1.5 text-sm text-center focus:border-neutre focus:outline-none"
                  type="number"
                  min="0.1"
                  step="0.1"
                  value={comp.quantity || ''}
                  onChange={(e) =>
                    updateComponent(i, 'quantity', e.target.value)
                  }
                  placeholder="Qté"
                />
                <button
                  onClick={() => removeComponent(i)}
                  className="text-red-400 hover:text-red-600 touch-target px-2"
                  aria-label="Supprimer le composant"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

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

      {/* Actions */}
      <div className="flex justify-end gap-3 border-t border-gray-200 pt-4">
        <button
          onClick={onCancel}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-encre-2 hover:bg-gray-50 touch-target"
        >
          Annuler
        </button>
        <button
          onClick={handleSubmit}
          className="rounded-lg bg-neutre px-6 py-2 text-sm font-semibold text-white hover:bg-blue-700 touch-target"
        >
          Créer le kit
        </button>
      </div>
    </div>
  );
}
