import { useState } from 'react';
import { Modal, MontantAr } from '@/components';
import type { Sale, SaleItem } from '@/core/domain/types';
import { formatQty } from '@/core/format';

interface ReturnModalProps {
  open: boolean;
  onClose: () => void;
  /** Recherche d'une vente par numéro (V-2026-NNNNN) */
  onSearchSale: (saleNumber: string) => Promise<{ sale: Sale; items: SaleItem[] } | null>;
  /**
   * Exécute le retour. `adminPin` est vérifié côté service :
   * les retours exigent un PIN admin (S26).
   * CREDIT = avoir sur le compte client (diminue son solde dû).
   */
  onReturn: (params: {
    sale: Sale;
    lines: { item: SaleItem; quantity: number }[];
    refundMethod: 'ESPECES' | 'MVOLA' | 'CREDIT';
    refundReference: string | null;
    adminPin: string;
  }) => Promise<void>;
}

/**
 * Retours (S26–S27) : partiels autorisés, remboursement au prix
 * appliqué d'origine remises comprises, PIN admin obligatoire.
 */
export function ReturnModal({ open, onClose, onSearchSale, onReturn }: ReturnModalProps) {
  const [saleNumber, setSaleNumber] = useState('');
  const [found, setFound] = useState<{ sale: Sale; items: SaleItem[] } | null>(null);
  const [quantities, setQuantities] = useState<Map<string, string>>(new Map());
  const [refundMethod, setRefundMethod] = useState<'ESPECES' | 'MVOLA' | 'CREDIT'>('ESPECES');
  const [refundRef, setRefundRef] = useState('');
  const [adminPin, setAdminPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setSaleNumber('');
    setFound(null);
    setQuantities(new Map());
    setRefundMethod('ESPECES');
    setRefundRef('');
    setAdminPin('');
    setError(null);
  };

  const handleSearch = async () => {
    setError(null);
    const result = await onSearchSale(saleNumber);
    if (!result) {
      setError('Vente introuvable.');
      setFound(null);
      return;
    }
    if (result.sale.status !== 'COMPLETED' || result.sale.is_quote === 1) {
      setError('Seule une vente finalisée peut faire l’objet d’un retour.');
      setFound(null);
      return;
    }
    if (result.sale.is_return === 1) {
      setError('Impossible de faire un retour sur un avoir.');
      setFound(null);
      return;
    }
    setRefundMethod('ESPECES');
    setFound(result);
  };

  const selectedLines = found
    ? found.items
        .map((item) => {
          const qty = Number(quantities.get(item.id) ?? 0);
          return qty > 0 ? { item, quantity: qty } : null;
        })
        .filter((l): l is NonNullable<typeof l> => l !== null)
    : [];

  // Même prorata que le service : la remise globale de la vente
  // d'origine s'applique au remboursement (line_total est pré-remise).
  const discountRatio =
    found && found.sale.subtotal > 0 ? found.sale.total / found.sale.subtotal : 1;
  const refundTotal = selectedLines.reduce(
    (s, { item, quantity }) =>
      s + Math.round((item.line_total / item.quantity) * quantity * discountRatio),
    0
  );

  const handleSubmit = async () => {
    if (!found) return;
    setError(null);
    setSubmitting(true);
    try {
      await onReturn({
        sale: found.sale,
        lines: selectedLines,
        refundMethod,
        refundReference: refundMethod === 'MVOLA' ? refundRef.trim() || null : null,
        adminPin,
      });
      reset();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue');
    }
    setSubmitting(false);
  };

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="Retour d'articles"
    >
      <div className="space-y-3">
        {/* Recherche de la vente */}
        <div className="flex gap-2">
          <input
            className="flex-1 rounded border border-gray-300 px-3 py-2 font-mono text-sm uppercase focus:border-neutre focus:outline-none"
            placeholder="N° de vente (V-2026-00001)"
            value={saleNumber}
            onChange={(e) => setSaleNumber(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            autoFocus
          />
          <button
            onClick={handleSearch}
            disabled={!saleNumber.trim()}
            className="rounded bg-neutre px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 touch-target"
          >
            Chercher
          </button>
        </div>

        {found && (
          <>
            <div className="max-h-48 space-y-1 overflow-auto">
              {found.items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded bg-atelier px-3 py-2 text-sm"
                >
                  <div className="flex-1">
                    <span className="text-encre">{item.name_snapshot}</span>
                    <span className="ml-2 text-xs text-encre-2">
                      {formatQty(item.quantity)} × <MontantAr value={item.applied_price} className="text-xs" />
                    </span>
                  </div>
                  <input
                    className="w-20 rounded border border-gray-300 px-2 py-1 text-right font-mono text-sm focus:border-neutre focus:outline-none"
                    type="number"
                    min="0"
                    max={item.quantity}
                    step="0.1"
                    placeholder="0"
                    value={quantities.get(item.id) ?? ''}
                    onChange={(e) => {
                      const next = new Map(quantities);
                      if (e.target.value === '') next.delete(item.id);
                      else next.set(item.id, e.target.value);
                      setQuantities(next);
                    }}
                  />
                </div>
              ))}
            </div>

            {refundTotal > 0 && (
              <div className="rounded bg-green-50 px-3 py-2 text-center text-sm font-semibold text-especes">
                Remboursement : <MontantAr value={refundTotal} />
              </div>
            )}

            {/* Méthode de remboursement — l'avoir sur compte n'existe
                que si la vente d'origine a un client associé */}
            <div className="flex gap-1">
              {(
                [
                  { m: 'ESPECES' as const, label: 'Espèces', show: true },
                  { m: 'MVOLA' as const, label: 'MVola', show: true },
                  {
                    m: 'CREDIT' as const,
                    label: 'Avoir client',
                    show: found.sale.customer_id !== null,
                  },
                ] as const
              )
                .filter((o) => o.show)
                .map((o) => (
                  <button
                    key={o.m}
                    onClick={() => setRefundMethod(o.m)}
                    className={`flex-1 rounded px-3 py-2 text-sm font-medium touch-target ${
                      refundMethod === o.m ? 'bg-especes text-white' : 'bg-gray-100 text-encre-2'
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
            </div>
            {refundMethod === 'CREDIT' && (
              <p className="text-xs text-encre-2">
                L'avoir diminue le solde dû du client (aucune sortie d'espèces).
              </p>
            )}
            {refundMethod === 'MVOLA' && (
              <input
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-neutre focus:outline-none"
                placeholder="Référence MVola (obligatoire)"
                value={refundRef}
                onChange={(e) => setRefundRef(e.target.value)}
              />
            )}

            {/* PIN admin */}
            <input
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-neutre focus:outline-none"
              placeholder="PIN Admin (obligatoire pour un retour)"
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={adminPin}
              onChange={(e) => setAdminPin(e.target.value)}
            />
          </>
        )}

        {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

        {found && (
          <button
            onClick={handleSubmit}
            disabled={
              submitting ||
              selectedLines.length === 0 ||
              adminPin.length < 4 ||
              (refundMethod === 'MVOLA' && !refundRef.trim())
            }
            className="w-full rounded-lg bg-alerte py-2 text-sm font-semibold text-white hover:bg-yellow-700 disabled:opacity-50 touch-target"
          >
            {submitting ? 'Traitement…' : 'Valider le retour'}
          </button>
        )}
      </div>
    </Modal>
  );
}
