import { useState, useMemo, useEffect } from 'react';
import { MontantAr, NumPad } from '@/components';
import { useCartStore } from './cartStore';
import type { PaymentMethod, CartPayment } from '@/core/domain/types';

interface PaymentModalProps {
  open: boolean;
  onClose: () => void;
  onFinalize: (payments: CartPayment[]) => void;
  allowCredit: boolean;
}

const PAYMENT_METHODS: { method: PaymentMethod; label: string; color: string }[] = [
  { method: 'ESPECES', label: 'Espèces', color: 'bg-especes' },
  { method: 'MVOLA', label: 'MVola', color: 'bg-neutre' },
  { method: 'CREDIT', label: 'Crédit', color: 'bg-alerte' },
];

/**
 * Écran de paiement — multi-méthodes, rendu automatique.
 */
export function PaymentModal({ open, onClose, onFinalize, allowCredit }: PaymentModalProps) {
  const { total, customerId } = useCartStore();
  const [payments, setPayments] = useState<CartPayment[]>([]);
  const [activeMethod, setActiveMethod] = useState<PaymentMethod>('ESPECES');
  const [amountStr, setAmountStr] = useState('');
  const [mvolaRef, setMvolaRef] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Repartir d'un état vierge à chaque ouverture — sinon les paiements
  // d'une vente précédente (ou annulée) resteraient comptés.
  useEffect(() => {
    if (open) {
      setPayments([]);
      setActiveMethod('ESPECES');
      setAmountStr('');
      setMvolaRef('');
      setError(null);
    }
  }, [open]);

  // Total payé
  const paidTotal = useMemo(
    () => payments.reduce((sum, p) => sum + p.amount, 0),
    [payments]
  );

  // Reste à payer
  const remaining = total - paidTotal;

  // Rendu (espèces uniquement)
  const cashPayment = payments.find((p) => p.method === 'ESPECES');
  const change = cashPayment && paidTotal >= total
    ? cashPayment.amount - (total - payments.filter(p => p.method !== 'ESPECES').reduce((s, p) => s + p.amount, 0))
    : null;

  const handleAddPayment = () => {
    const amount = Number(amountStr);
    if (!amount || amount <= 0) return;

    // Crédit : client obligatoire
    if (activeMethod === 'CREDIT' && !customerId) {
      setError('Client obligatoire pour le paiement à crédit.');
      return;
    }

    // MVola : référence obligatoire
    if (activeMethod === 'MVOLA' && !mvolaRef.trim()) {
      setError('Référence MVola obligatoire.');
      return;
    }

    // Trop-perçu non-espèces refusé
    if (activeMethod !== 'ESPECES' && amount > remaining) {
      setError(`Trop-perçu refusé pour ${activeMethod}. Maximum : ${remaining} Ar.`);
      return;
    }

    setError(null);

    if (activeMethod === 'ESPECES') {
      // Espèces : remplacer le paiement existant (un seul paiement espèces)
      setPayments([
        ...payments.filter((p) => p.method !== 'ESPECES'),
        { method: 'ESPECES', amount, reference: null },
      ]);
    } else {
      setPayments([
        ...payments,
        {
          method: activeMethod,
          amount,
          reference: activeMethod === 'MVOLA' ? mvolaRef : null,
        },
      ]);
    }

    setAmountStr('');
    setMvolaRef('');
  };

  const handleFinalize = () => {
    if (paidTotal < total) {
      setError(`Paiement insuffisant : ${paidTotal} Ar sur ${total} Ar.`);
      return;
    }
    onFinalize(payments);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-10">
      <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-lg bg-carte shadow-xl liseré-terre">
        {/* En-tête */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-lg font-semibold text-encre">Paiement</h2>
          <button onClick={onClose} className="touch-target rounded px-2 hover:bg-gray-100">
            ✕
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">
          {/* Total à payer */}
          <div className="text-center">
            <p className="text-sm text-encre-2">Total à payer</p>
            <MontantAr value={total} total />
          </div>

          {/* Déjà payé / Reste */}
          {payments.length > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-encre-2">Payé</span>
              <MontantAr value={paidTotal} />
            </div>
          )}
          {remaining > 0 && paidTotal > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-alerte">Reste à payer</span>
              <MontantAr value={remaining} />
            </div>
          )}

          {/* Rendu */}
          {change && change > 0 && (
            <div className="rounded bg-green-50 px-3 py-2 text-center">
              <span className="text-sm font-semibold text-especes">
                Rendu : <MontantAr value={change} />
              </span>
            </div>
          )}

          {/* Méthodes de paiement */}
          {remaining > 0 && (
            <>
              <div className="flex gap-1">
                {PAYMENT_METHODS.map((m) => (
                  <button
                    key={m.method}
                    onClick={() => {
                      setActiveMethod(m.method);
                      setError(null);
                    }}
                    className={`flex-1 rounded px-2 py-2 text-sm font-medium touch-target
                      ${activeMethod === m.method ? `${m.color} text-white` : 'bg-gray-100 text-encre-2 hover:bg-gray-200'}
                      ${m.method === 'CREDIT' && !allowCredit ? 'opacity-50 cursor-not-allowed' : ''}
                    `}
                    disabled={m.method === 'CREDIT' && !allowCredit}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              {/* Saisie du montant */}
              <NumPad
                value={amountStr}
                onValue={setAmountStr}
                onEnter={handleAddPayment}
                allowDecimal={false}
                label={`Montant ${activeMethod}`}
              />

              {/* Réf MVola */}
              {activeMethod === 'MVOLA' && (
                <input
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-neutre focus:outline-none"
                  placeholder="Référence MVola (obligatoire)"
                  value={mvolaRef}
                  onChange={(e) => setMvolaRef(e.target.value)}
                />
              )}
            </>
          )}

          {/* Erreur */}
          {error && (
            <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-600">
              {error}
            </div>
          )}

          {/* Paiements enregistrés */}
          {payments.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-encre-2">Paiements</p>
              {payments.map((p, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded bg-atelier px-3 py-1.5 text-sm"
                >
                  <span className="text-encre">{p.method}</span>
                  <div className="flex items-center gap-2">
                    <MontantAr value={p.amount} className="text-sm" />
                    {p.reference && (
                      <span className="text-xs text-encre-2">{p.reference}</span>
                    )}
                    <button
                      onClick={() =>
                        setPayments(payments.filter((_, j) => j !== i))
                      }
                      className="text-red-400 hover:text-red-600"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-between border-t px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-encre-2 hover:bg-gray-50 touch-target"
          >
            Annuler
          </button>
          <button
            onClick={handleFinalize}
            disabled={paidTotal < total}
            className="rounded-lg bg-especes px-6 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50 touch-target"
          >
            Encaisser
          </button>
        </div>
      </div>
    </div>
  );
}
