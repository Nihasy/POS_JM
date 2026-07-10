import { useState } from 'react';
import { Modal, MontantAr } from '@/components';
import { useCartStore } from './cartStore';

interface DiscountModalProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Remise globale sur la vente (F4) — % ou montant Ar.
 * Ordre de calcul contractuel : palier → prix négocié → remise ligne → remise globale.
 */
export function DiscountModal({ open, onClose }: DiscountModalProps) {
  const { subtotal, total, setGlobalDiscount, discountGlobalPercent, discountGlobalAmount } =
    useCartStore();
  const [mode, setMode] = useState<'percent' | 'amount'>('percent');
  const [value, setValue] = useState('');

  const handleApply = () => {
    const num = Number(value);
    if (Number.isNaN(num) || num < 0) return;
    if (mode === 'percent') {
      if (num > 100) return;
      setGlobalDiscount(num || null, null);
    } else {
      if (num > subtotal) return;
      setGlobalDiscount(null, num || null);
    }
    setValue('');
    onClose();
  };

  const handleClear = () => {
    setGlobalDiscount(null, null);
    setValue('');
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Remise globale">
      <div className="space-y-3">
        <div className="text-center text-sm text-encre-2">
          Sous-total : <MontantAr value={subtotal} /> — Total actuel : <MontantAr value={total} />
        </div>

        <div className="flex gap-1">
          <button
            onClick={() => setMode('percent')}
            className={`flex-1 rounded px-3 py-2 text-sm font-medium touch-target ${
              mode === 'percent' ? 'bg-neutre text-white' : 'bg-gray-100 text-encre-2'
            }`}
          >
            Pourcentage (%)
          </button>
          <button
            onClick={() => setMode('amount')}
            className={`flex-1 rounded px-3 py-2 text-sm font-medium touch-target ${
              mode === 'amount' ? 'bg-neutre text-white' : 'bg-gray-100 text-encre-2'
            }`}
          >
            Montant (Ar)
          </button>
        </div>

        <input
          className="w-full rounded border border-gray-300 px-3 py-2 text-right font-mono text-lg focus:border-neutre focus:outline-none"
          type="number"
          min="0"
          max={mode === 'percent' ? 100 : subtotal}
          placeholder={mode === 'percent' ? 'ex : 5' : 'ex : 2000'}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleApply()}
          autoFocus
        />

        {(discountGlobalPercent || discountGlobalAmount) && (
          <button
            onClick={handleClear}
            className="w-full rounded border border-gray-300 py-1.5 text-xs text-encre-2 hover:bg-gray-50 touch-target"
          >
            Retirer la remise actuelle (
            {discountGlobalPercent ? `${discountGlobalPercent} %` : `${discountGlobalAmount} Ar`})
          </button>
        )}

        <button
          onClick={handleApply}
          disabled={!value}
          className="w-full rounded-lg bg-neutre py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 touch-target"
        >
          Appliquer la remise
        </button>
      </div>
    </Modal>
  );
}
