import { useState, useMemo } from 'react';
import { MontantAr } from '@/components';
import type { Supplier, Item } from '@/core/domain/types';
import { formatQty } from '@/core/format';

interface ReceiveLineInput {
  itemId: string;
  itemName: string;
  unitName: string;
  packName: string | null;
  qtyPerPack: number | null;
  currentStock: number;
  currentPmp: number;
  numberOfPacks: number;
  looseUnits: number;
  unitCost: number;
}

interface ReceiveScreenProps {
  items: Item[];
  suppliers: Supplier[];
  stockLevels: Map<string, number>;
  onReceive: (lines: ReceiveLineInput[], supplierId: string | null, lotRef: string) => Promise<void>;
}

/**
 * Écran de réception de marchandises.
 * Saisie en conditionnement (x cartons de qty_per_pack) → conversion unités.
 * Calcul PMP en direct.
 */
export function ReceiveScreen({ items, suppliers, stockLevels, onReceive }: ReceiveScreenProps) {
  const [lines, setLines] = useState<ReceiveLineInput[]>([]);
  const [supplierId, setSupplierId] = useState<string>('');
  const [lotRef, setLotRef] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState('');

  const addLine = () => {
    const item = items.find((i) => i.id === selectedItemId);
    if (!item) return;

    const stockQty = stockLevels.get(item.id) ?? 0;

    setLines([
      ...lines,
      {
        itemId: item.id,
        itemName: item.name,
        unitName: item.unit_name,
        packName: item.pack_name,
        qtyPerPack: item.qty_per_pack,
        currentStock: stockQty,
        currentPmp: item.cost_price,
        numberOfPacks: 0,
        looseUnits: item.receiving_quantity ?? 1,
        unitCost: item.cost_price,
      },
    ]);
    setSelectedItemId('');
  };

  const updateLine = (index: number, field: keyof ReceiveLineInput, value: number | string) => {
    setLines(
      lines.map((l, i) => (i === index ? { ...l, [field]: value } : l))
    );
  };

  const removeLine = (index: number) => {
    setLines(lines.filter((_, i) => i !== index));
  };

  // Total calculé
  const totalCost = useMemo(
    () =>
      lines.reduce((sum, l) => {
        const totalUnits =
          (l.qtyPerPack ? l.numberOfPacks * l.qtyPerPack : l.numberOfPacks) +
          l.looseUnits;
        return sum + totalUnits * l.unitCost;
      }, 0),
    [lines]
  );

  const handleSubmit = async () => {
    if (lines.length === 0) return;
    setSubmitting(true);
    await onReceive(lines, supplierId || null, lotRef);
    setSubmitting(false);
    setLines([]);
    setLotRef('');
  };

  return (
    <div className="flex h-full flex-col p-4">
      <h2 className="text-xl font-bold text-encre mb-4">Réception de marchandises</h2>

      {/* En-tête : fournisseur + lot */}
      <div className="mb-4 grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-medium text-encre-2 mb-1">
            Fournisseur
          </label>
          <select
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
          >
            <option value="">— Aucun —</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-encre-2 mb-1">
            Réf. lot
          </label>
          <input
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            value={lotRef}
            onChange={(e) => setLotRef(e.target.value)}
            placeholder="IMPORT-CN-01…"
          />
        </div>
        <div className="flex items-end">
          <span className="text-xs text-encre-2">
            Total : <MontantAr value={totalCost} />
          </span>
        </div>
      </div>

      {/* Ajout ligne */}
      <div className="mb-4 flex gap-2">
        <select
          className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm"
          value={selectedItemId}
          onChange={(e) => setSelectedItemId(e.target.value)}
        >
          <option value="">— Ajouter un produit —</option>
          {items
            .filter((i) => i.deleted === 0 && !lines.some((l) => l.itemId === i.id))
            .map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
        </select>
        <button
          onClick={addLine}
          disabled={!selectedItemId}
          className="rounded-lg bg-neutre px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 touch-target"
        >
          + Ajouter
        </button>
      </div>

      {/* Lignes de réception */}
      <div className="flex-1 overflow-auto">
        {lines.length === 0 ? (
          <p className="py-8 text-center text-encre-2">
            Ajoutez des produits à réceptionner.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-encre-2">
                <th className="pb-2 pr-2">Produit</th>
                <th className="pb-2 pr-2 w-20">Cartons</th>
                <th className="pb-2 pr-2 w-20">Unités</th>
                <th className="pb-2 pr-2 w-20">Total unités</th>
                <th className="pb-2 pr-2 w-24">Coût unitaire</th>
                <th className="pb-2 pr-2 w-24">Nouveau PMP</th>
                <th className="pb-2 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, i) => {
                const totalUnits =
                  (line.qtyPerPack
                    ? line.numberOfPacks * line.qtyPerPack
                    : line.numberOfPacks) + line.looseUnits;

                // Calcul PMP
                const stockVal = line.currentStock * line.currentPmp;
                const newVal = totalUnits * line.unitCost;
                const newPmp =
                  line.currentStock + totalUnits > 0
                    ? Math.round((stockVal + newVal) / (line.currentStock + totalUnits))
                    : line.unitCost;

                return (
                  <tr key={i} className="border-b hover:bg-gray-50">
                    <td className="py-2 pr-2">
                      <span className="font-medium">{line.itemName}</span>
                      <span className="ml-1 text-xs text-encre-2">
                        (Stock: {formatQty(line.currentStock)} {line.unitName})
                      </span>
                    </td>
                    <td className="py-2 pr-2">
                      <input
                        className="w-full rounded border border-gray-200 px-2 py-1 text-sm text-center"
                        type="number"
                        min="0"
                        value={line.numberOfPacks || ''}
                        onChange={(e) =>
                          updateLine(i, 'numberOfPacks', Number(e.target.value) || 0)
                        }
                      />
                      {line.packName && (
                        <span className="text-[0.625rem] text-encre-2">
                          ×{line.qtyPerPack} {line.packName}
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-2">
                      <input
                        className="w-full rounded border border-gray-200 px-2 py-1 text-sm text-center"
                        type="number"
                        min="0"
                        step="0.1"
                        value={line.looseUnits || ''}
                        onChange={(e) =>
                          updateLine(i, 'looseUnits', Number(e.target.value) || 0)
                        }
                      />
                    </td>
                    <td className="py-2 pr-2 text-center font-mono">
                      {formatQty(totalUnits)}
                    </td>
                    <td className="py-2 pr-2">
                      <input
                        className="w-full rounded border border-gray-200 px-2 py-1 text-sm text-center"
                        type="number"
                        min="0"
                        value={line.unitCost || ''}
                        onChange={(e) =>
                          updateLine(i, 'unitCost', Number(e.target.value) || 0)
                        }
                      />
                    </td>
                    <td className="py-2 pr-2 text-center">
                      <MontantAr value={newPmp} className="text-xs" />
                    </td>
                    <td className="py-2">
                      <button
                        onClick={() => removeLine(i)}
                        className="text-red-400 hover:text-red-600"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Action */}
      <div className="mt-4 flex justify-end border-t pt-4">
        <button
          onClick={handleSubmit}
          disabled={lines.length === 0 || submitting}
          className="rounded-lg bg-especes px-8 py-3 text-base font-bold text-white hover:bg-green-700 disabled:opacity-50 touch-target"
        >
          {submitting ? 'Enregistrement…' : 'Valider la réception'}
        </button>
      </div>
    </div>
  );
}
