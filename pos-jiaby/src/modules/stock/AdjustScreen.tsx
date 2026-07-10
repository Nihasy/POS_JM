import { useState, useMemo } from 'react';
import { Modal } from '@/components';
import type { Item, Category } from '@/core/domain/types';
import type { AdjustmentReason } from '@/core/domain/adjustment';
import { formatQty, isDecimalUnit } from '@/core/format';

interface AdjustScreenProps {
  items: Item[];
  categories: Category[];
  stockLevels: Map<string, number>;
  /** Validation d'un inventaire (Admin) : lignes avec écart */
  onAdjust: (
    lines: { itemId: string; expectedQty: number; countedQty: number }[],
    reason: AdjustmentReason
  ) => Promise<void>;
  /** Sortie manuelle motivée */
  onManualOut: (
    itemId: string,
    quantity: number,
    reason: AdjustmentReason,
    comment: string
  ) => Promise<void>;
  /** Seul un Admin peut valider un ajustement */
  canAdjust: boolean;
}

const OUT_REASONS: { id: AdjustmentReason; label: string }[] = [
  { id: 'casse', label: 'Casse' },
  { id: 'don', label: 'Don' },
  { id: 'usage_interne', label: 'Usage interne' },
  { id: 'peremption', label: 'Péremption' },
  { id: 'vol', label: 'Vol' },
];

/**
 * Écran d'inventaire et d'ajustements (Phase 3.3).
 * Comptage par catégorie, écarts calculés, validation Admin
 * → contre-écritures ADJUSTMENT (S29). Sorties manuelles motivées.
 */
export function AdjustScreen({
  items,
  categories,
  stockLevels,
  onAdjust,
  onManualOut,
  canAdjust,
}: AdjustScreenProps) {
  const [categoryId, setCategoryId] = useState<string>('');
  const [counts, setCounts] = useState<Map<string, string>>(new Map());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Sortie manuelle
  const [showOut, setShowOut] = useState(false);
  const [outItemId, setOutItemId] = useState('');
  const [outQty, setOutQty] = useState('');
  const [outReason, setOutReason] = useState<AdjustmentReason>('casse');
  const [outComment, setOutComment] = useState('');

  const visibleItems = useMemo(
    () =>
      categoryId
        ? items.filter((i) => i.category_id === categoryId)
        : items,
    [items, categoryId]
  );

  const linesWithCount = useMemo(
    () =>
      visibleItems
        .map((item) => {
          const raw = counts.get(item.id);
          if (raw === undefined || raw === '') return null;
          const counted = Number(raw);
          if (Number.isNaN(counted) || counted < 0) return null;
          const expected = stockLevels.get(item.id) ?? 0;
          return { item, expected, counted, diff: counted - expected };
        })
        .filter((l): l is NonNullable<typeof l> => l !== null),
    [visibleItems, counts, stockLevels]
  );

  const diffCount = linesWithCount.filter((l) => Math.abs(l.diff) > 0.001).length;

  const handleValidate = async () => {
    setError(null);
    setMessage(null);
    setSubmitting(true);
    try {
      await onAdjust(
        linesWithCount.map((l) => ({
          itemId: l.item.id,
          expectedQty: l.expected,
          countedQty: l.counted,
        })),
        'inventaire'
      );
      setMessage(`Inventaire validé — ${diffCount} écart(s) corrigé(s).`);
      setCounts(new Map());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue');
    }
    setSubmitting(false);
  };

  const handleManualOut = async () => {
    setError(null);
    setSubmitting(true);
    try {
      if (!outComment.trim()) {
        throw new Error('Le motif détaillé est obligatoire pour une sortie manuelle.');
      }
      await onManualOut(outItemId, Number(outQty) || 0, outReason, outComment.trim());
      setShowOut(false);
      setOutItemId('');
      setOutQty('');
      setOutComment('');
      setMessage('Sortie manuelle enregistrée.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue');
    }
    setSubmitting(false);
  };

  return (
    <div className="flex h-full flex-col p-4">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-bold text-encre">Inventaire & ajustements</h2>
        <div className="flex items-center gap-2">
          <select
            className="rounded border border-gray-300 px-3 py-2 text-sm"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            <option value="">Toutes les catégories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button
            onClick={() => {
              setError(null);
              setShowOut(true);
            }}
            className="rounded-lg border border-gray-300 bg-carte px-4 py-2 text-sm font-medium text-encre-2 hover:bg-gray-50 touch-target"
          >
            Sortie manuelle
          </button>
        </div>
      </div>

      {message && (
        <div className="mb-3 rounded bg-green-50 px-3 py-2 text-sm text-especes">{message}</div>
      )}
      {error && (
        <div className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>
      )}

      <div className="flex-1 overflow-auto rounded-lg bg-carte shadow-sm">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-carte">
            <tr className="border-b text-left text-xs text-encre-2">
              <th className="px-4 py-2">Produit</th>
              <th className="px-4 py-2 text-right">Stock théorique</th>
              <th className="px-4 py-2 text-right">Compté</th>
              <th className="px-4 py-2 text-right">Écart</th>
            </tr>
          </thead>
          <tbody>
            {visibleItems.map((item) => {
              const expected = stockLevels.get(item.id) ?? 0;
              const raw = counts.get(item.id) ?? '';
              const counted = raw === '' ? null : Number(raw);
              const diff = counted !== null && !Number.isNaN(counted) ? counted - expected : null;

              return (
                <tr key={item.id} className="border-b hover:bg-gray-50">
                  <td className="px-4 py-1.5">
                    <span className="font-medium text-encre">{item.name}</span>
                    <span className="ml-2 font-mono text-xs text-encre-2">{item.item_number}</span>
                  </td>
                  <td className="px-4 py-1.5 text-right font-mono">{formatQty(expected)}</td>
                  <td className="px-4 py-1.5 text-right">
                    <input
                      className="w-24 rounded border border-gray-300 px-2 py-1 text-right font-mono text-sm focus:border-neutre focus:outline-none"
                      type="number"
                      min="0"
                      step={isDecimalUnit(item.unit_name) ? '0.1' : '1'}
                      aria-label={`Compté ${item.name}`}
                      value={raw}
                      onChange={(e) => {
                        const v = e.target.value;
                        // Unité entière : refuser les décimales
                        if (
                          v !== '' &&
                          !isDecimalUnit(item.unit_name) &&
                          !Number.isInteger(Number(v))
                        ) {
                          return;
                        }
                        const next = new Map(counts);
                        if (v === '') next.delete(item.id);
                        else next.set(item.id, v);
                        setCounts(next);
                      }}
                    />
                  </td>
                  <td
                    className={`px-4 py-1.5 text-right font-mono ${
                      diff === null || Math.abs(diff) < 0.001
                        ? 'text-encre-2'
                        : diff > 0
                          ? 'text-especes font-semibold'
                          : 'text-alerte font-semibold'
                    }`}
                  >
                    {diff === null ? '—' : diff > 0 ? `+${formatQty(diff)}` : formatQty(diff)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <span className="text-sm text-encre-2">
          {linesWithCount.length} produit(s) compté(s) — {diffCount} écart(s)
        </span>
        <button
          onClick={handleValidate}
          disabled={!canAdjust || submitting || linesWithCount.length === 0}
          title={canAdjust ? '' : "Validation réservée à l'Admin"}
          className="rounded-lg bg-neutre px-6 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 touch-target"
        >
          {submitting ? 'Validation…' : "Valider l'inventaire (Admin)"}
        </button>
      </div>

      {/* Modale sortie manuelle */}
      <Modal open={showOut} onClose={() => setShowOut(false)} title="Sortie manuelle">
        <div className="space-y-3">
          <select
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            value={outItemId}
            onChange={(e) => setOutItemId(e.target.value)}
          >
            <option value="">— Choisir un produit —</option>
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name} (stock : {formatQty(stockLevels.get(i.id) ?? 0)})
              </option>
            ))}
          </select>
          <input
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-neutre focus:outline-none"
            placeholder="Quantité"
            type="number"
            min="0"
            step={
              isDecimalUnit(items.find((i) => i.id === outItemId)?.unit_name) ? '0.1' : '1'
            }
            value={outQty}
            onChange={(e) => {
              const v = e.target.value;
              const unit = items.find((i) => i.id === outItemId)?.unit_name;
              // Unité entière : refuser les décimales
              if (v !== '' && !isDecimalUnit(unit) && !Number.isInteger(Number(v))) return;
              setOutQty(v);
            }}
          />
          <select
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            value={outReason}
            onChange={(e) => setOutReason(e.target.value as AdjustmentReason)}
          >
            {OUT_REASONS.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
          <textarea
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-neutre focus:outline-none"
            placeholder="Motif détaillé (obligatoire)"
            rows={2}
            value={outComment}
            onChange={(e) => setOutComment(e.target.value)}
          />
          {error && (
            <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>
          )}
          <button
            onClick={handleManualOut}
            disabled={submitting || !outItemId || !Number(outQty) || !outComment.trim()}
            className="w-full rounded-lg bg-alerte py-2 text-sm font-semibold text-white hover:bg-yellow-700 disabled:opacity-50 touch-target"
          >
            {submitting ? 'Enregistrement…' : 'Enregistrer la sortie'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
