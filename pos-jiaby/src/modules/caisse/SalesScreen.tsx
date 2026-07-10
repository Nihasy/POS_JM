import { useState, useCallback, useEffect, useRef } from 'react';
import { SearchBox, ShortcutRail, MontantAr } from '@/components';
import { useCartStore } from './cartStore';
import { CartPanel } from './CartPanel';
import { PaymentModal } from './PaymentModal';
import type { Item, CartPayment } from '@/core/domain/types';
import { formatQty } from '@/core/format';

interface SalesScreenProps {
  /** Liste complète du catalogue pour la recherche */
  items: Item[];
  /** Niveaux de stock par item_id */
  stockLevels: Map<string, number>;
  /** Callback recherche */
  onSearch: (query: string) => void;
  /** Callback finalisation */
  onFinalize: (payments: CartPayment[]) => Promise<void>;
  /** Callback suspension */
  onSuspend: () => Promise<void>;
  /** Callback rappel panier suspendu */
  onRecall: () => void;
  /** Callback ajout client */
  onSelectCustomer: () => void;
  /** Callback remise */
  onDiscount: () => void;
  /** Création d'un devis à partir du panier (S23) */
  onQuote: () => Promise<void>;
  /** Ouverture de la modale de retour (S26–S27) */
  onOpenReturn: () => void;
  /** Peut faire des ventes */
  canSell: boolean;
  /** Session ouverte ? */
  hasOpenSession: boolean;
}

/**
 * Écran principal de vente — Layout 2 colonnes.
 *
 * Gauche : recherche + résultats
 * Droite : panier + total
 * Bas : rail de raccourcis F2–F12
 */
export function SalesScreen({
  items,
  stockLevels,
  onSearch,
  onFinalize,
  onSuspend,
  onRecall,
  onSelectCustomer,
  onDiscount,
  onQuote,
  onOpenReturn,
  canSell,
  hasOpenSession,
}: SalesScreenProps) {
  const { addItem, clearCart, lines } = useCartStore();
  const [searchResults, setSearchResults] = useState<Item[]>([]);
  const [showPayment, setShowPayment] = useState(false);
  const [_finalizing, setFinalizing] = useState(false);
  const mainRef = useRef<HTMLDivElement>(null);

  // Recherche
  const handleSearch = useCallback(
    (query: string) => {
      onSearch(query);
      if (!query.trim()) {
        setSearchResults([]);
        return;
      }
      const q = query.toLowerCase();
      const results = items
        .filter(
          (item) =>
            item.deleted === 0 &&
            (item.name.toLowerCase().includes(q) ||
              item.item_number.toLowerCase().includes(q) ||
              item.short_name.toLowerCase().includes(q))
        )
        .slice(0, 20);
      setSearchResults(results);
    },
    [items, onSearch]
  );

  // Ajout au panier
  const handleAddToCart = useCallback(
    (item: Item) => {
      addItem({
        itemId: item.id,
        name: item.short_name || item.name,
        sellingPrice: item.selling_price,
        costPrice: item.cost_price,
        priceSemiGros: item.price_semi_gros,
        priceGros: item.price_gros,
        qtySemiGros: item.qty_semi_gros,
        qtyGros: item.qty_gros,
        unitName: item.unit_name,
      });
    },
    [addItem]
  );

  // Scan douchette : géré par SearchBox via onEnter
  // La recherche par item_number exact déclenche l'ajout au panier

  // Finalisation
  const handleFinalize = useCallback(
    async (payments: CartPayment[]) => {
      setFinalizing(true);
      await onFinalize(payments);
      setFinalizing(false);
      setShowPayment(false);
      clearCart();
    },
    [onFinalize, clearCart]
  );

  // Raccourcis clavier
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!canSell) return;

      switch (e.key) {
        case 'F2':
          e.preventDefault();
          // Focus sur la recherche
          const searchInput = mainRef.current?.querySelector('input');
          searchInput?.focus();
          break;
        case 'F4':
          e.preventDefault();
          onDiscount();
          break;
        case 'F6':
          e.preventDefault();
          onSelectCustomer();
          break;
        case 'F8':
          e.preventDefault();
          onSuspend();
          break;
        case 'F9':
          e.preventDefault();
          onRecall();
          break;
        case 'F10':
          e.preventDefault();
          if (lines.length > 0) setShowPayment(true);
          break;
        case 'F12':
          e.preventDefault();
          // Clôture de session
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canSell, lines.length, onDiscount, onSuspend, onRecall, onSelectCustomer]);

  const SHORTCUTS = [
    { key: 'F2', label: 'Rechercher' },
    { key: 'F4', label: 'Remise' },
    { key: 'F6', label: 'Client' },
    { key: 'F8', label: 'Suspendre' },
    { key: 'F9', label: 'Rappeler' },
    { key: 'F10', label: 'Encaisser' },
    { key: 'F12', label: 'Clôture' },
  ];

  // Pas de session ouverte
  if (!hasOpenSession) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-encre-2">
        <p className="text-xl font-semibold text-encre mb-2">
          Aucune session de caisse ouverte
        </p>
        <p>Ouvrez une session pour commencer les ventes.</p>
      </div>
    );
  }

  return (
    <div ref={mainRef} className="flex h-full flex-col">
      {/* Layout 2 colonnes */}
      <div className="flex flex-1 gap-4 overflow-hidden p-4">
        {/* Colonne gauche : Recherche + Résultats */}
        <div className="flex w-1/2 flex-col">
          <SearchBox
            onSearch={handleSearch}
            placeholder="Rechercher (nom, référence) ou scanner un produit…"
          />

          {/* Résultats */}
          <div className="mt-3 flex-1 overflow-auto">
            {searchResults.length > 0 ? (
              <div className="grid grid-cols-2 gap-2">
                {searchResults.map((item) => {
                  const stock = stockLevels.get(item.id) ?? 0;
                  const lowStock =
                    item.reorder_level !== null && stock <= item.reorder_level;

                  return (
                    <button
                      key={item.id}
                      onClick={() => handleAddToCart(item)}
                      className="flex flex-col rounded-lg bg-carte p-3 text-left shadow-sm hover:bg-blue-50 hover:shadow-md transition-colors touch-target"
                    >
                      <span className="text-sm font-semibold text-encre truncate">
                        {item.short_name || item.name}
                      </span>
                      <div className="mt-1 flex items-center justify-between">
                        <MontantAr
                          value={item.selling_price}
                          className="text-sm"
                        />
                        <span
                          className={`text-xs font-mono ${
                            lowStock ? 'text-alerte font-semibold' : 'text-encre-2'
                          }`}
                        >
                          {lowStock && '⚠ '}
                          Stock: {formatQty(stock)}
                        </span>
                      </div>
                      {/* Paliers visibles */}
                      {(item.price_semi_gros || item.price_gros) && (
                        <div className="mt-1 flex gap-1 text-[0.625rem]">
                          {item.price_semi_gros && (
                            <span className="text-neutre">
                              Semi-gros: {item.price_semi_gros} Ar
                            </span>
                          )}
                          {item.price_gros && (
                            <span className="text-especes">
                              Gros: {item.price_gros} Ar
                            </span>
                          )}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="flex h-full items-center justify-center">
                <p className="text-sm text-encre-2">
                  Recherchez un produit ou scannez un code-barres.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Colonne droite : Panier */}
        <div className="flex w-1/2 flex-col">
          <CartPanel />

          {/* Boutons d'action rapide */}
          {lines.length > 0 ? (
            <div className="mt-3 flex gap-2">
              <button
                onClick={onSuspend}
                className="flex-1 rounded-lg border border-gray-300 bg-carte py-2 text-sm font-medium text-encre-2 hover:bg-gray-50 touch-target"
              >
                F8 Suspendre
              </button>
              <button
                onClick={onQuote}
                className="flex-1 rounded-lg border border-neutre bg-carte py-2 text-sm font-medium text-neutre hover:bg-blue-50 touch-target"
              >
                Devis
              </button>
              <button
                onClick={() => setShowPayment(true)}
                className="flex-1 rounded-lg bg-especes py-2 text-sm font-bold text-white hover:bg-green-700 touch-target"
              >
                F10 Encaisser
              </button>
            </div>
          ) : (
            <div className="mt-3 flex justify-end">
              <button
                onClick={onOpenReturn}
                className="rounded-lg border border-gray-300 bg-carte px-4 py-2 text-sm font-medium text-encre-2 hover:bg-gray-50 touch-target"
              >
                Retour d'articles…
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Rail de raccourcis */}
      <ShortcutRail shortcuts={SHORTCUTS} />

      {/* Modale de paiement */}
      <PaymentModal
        open={showPayment}
        onClose={() => setShowPayment(false)}
        onFinalize={handleFinalize}
        allowCredit={true}
      />
    </div>
  );
}
