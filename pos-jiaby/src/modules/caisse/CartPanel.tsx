import { MontantAr, TierBadge } from '@/components';
import { useCartStore } from './cartStore';

/**
 * Panneau du panier (colonne de droite de l'écran de vente).
 * Affiche les lignes, totaux, remise globale, et les actions.
 */
export function CartPanel() {
  const {
    lines,
    subtotal,
    total,
    itemCount,
    discountGlobalPercent,
    discountGlobalAmount,
    customerName,
    removeItem,
    updateQuantity,
  } = useCartStore();

  return (
    <div className="flex h-full flex-col bg-carte rounded-lg shadow-sm">
      {/* En-tête */}
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
        <h2 className="text-lg font-semibold text-encre">
          Panier
          {itemCount > 0 && (
            <span className="ml-2 text-sm font-normal text-encre-2">
              ({itemCount} article{itemCount > 1 ? 's' : ''})
            </span>
          )}
        </h2>
        {customerName && (
          <span className="text-xs text-neutre font-medium">
            Client : {customerName}
          </span>
        )}
      </div>

      {/* Lignes */}
      <div className="flex-1 overflow-auto">
        {lines.length === 0 ? (
          <div className="flex h-full items-center justify-center text-encre-2">
            <p className="text-center text-sm">
              Panier vide.
              <br />
              Scannez ou recherchez un produit.
            </p>
          </div>
        ) : (
          <div>
            {lines.map((line) => (
              <div
                key={line.tempId}
                className="flex items-start gap-2 border-b border-gray-100 px-4 py-2 hover:bg-gray-50"
              >
                {/* Infos ligne */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-encre truncate">
                      {line.name}
                    </span>
                    {line.tierApplied && line.tierApplied !== 'detail' && (
                      <TierBadge tier={line.tierApplied} />
                    )}
                    {line.isKit && (
                      <span className="text-xs text-neutre">KIT</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-encre-2 mt-0.5">
                    <input
                      className="w-16 rounded border border-gray-200 px-1 py-0.5 text-right font-mono text-xs focus:border-neutre focus:outline-none"
                      type="number"
                      min="0"
                      step="0.1"
                      aria-label={`Quantité ${line.name}`}
                      value={String(line.quantity)}
                      onChange={(e) => {
                        const q = Number(e.target.value.replace(',', '.'));
                        if (!Number.isNaN(q) && q > 0) updateQuantity(line.tempId, q);
                      }}
                    />
                    <span className="font-mono">×</span>
                    <MontantAr
                      value={line.appliedPrice}
                      className="text-xs"
                    />
                    {line.discountPercent && (
                      <span className="text-alerte">
                        −{line.discountPercent}%
                      </span>
                    )}
                    {line.discountAmount && line.discountAmount > 0 && (
                      <span className="text-alerte">
                        −<MontantAr value={line.discountAmount} className="text-xs" />
                      </span>
                    )}
                  </div>
                </div>

                {/* Total ligne + suppression */}
                <div className="flex items-center gap-2">
                  <MontantAr
                    value={line.lineTotal}
                    className="text-sm font-semibold"
                  />
                  <button
                    onClick={() => removeItem(line.tempId)}
                    className="touch-target rounded px-1 text-red-400 hover:bg-red-50 hover:text-red-600"
                    aria-label={`Retirer ${line.name}`}
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pied : totaux */}
      <div className="border-t border-gray-200 px-4 py-3 space-y-2">
        {/* Remise globale */}
        {discountGlobalPercent && discountGlobalPercent > 0 ? (
          <div className="flex justify-between text-xs text-alerte">
            <span>Remise globale {discountGlobalPercent}%</span>
          </div>
        ) : null}
        {discountGlobalAmount && discountGlobalAmount > 0 ? (
          <div className="flex justify-between text-xs text-alerte">
            <span>Remise globale</span>
            <MontantAr value={-discountGlobalAmount} className="text-xs" />
          </div>
        ) : null}

        {/* Sous-total */}
        {subtotal !== total && (
          <div className="flex justify-between text-sm text-encre-2">
            <span>Sous-total</span>
            <MontantAr value={subtotal} className="text-sm" />
          </div>
        )}

        {/* Total */}
        <div className="flex justify-between items-baseline">
          <span className="text-lg font-bold text-encre">TOTAL</span>
          <MontantAr value={total} total />
        </div>
      </div>
    </div>
  );
}
