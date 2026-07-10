import { Modal, MontantAr } from '@/components';
import { formatDateTime } from '@/core/format';
import type { SuspendedSale } from '@/app/services';

interface RecallModalProps {
  open: boolean;
  onClose: () => void;
  suspendedSales: SuspendedSale[];
  onRecall: (saleId: string) => Promise<void>;
}

/**
 * Rappel d'un panier suspendu ou d'un devis (F9, S22–S23).
 */
export function RecallModal({ open, onClose, suspendedSales, onRecall }: RecallModalProps) {
  return (
    <Modal open={open} onClose={onClose} title="Paniers suspendus & devis">
      {suspendedSales.length === 0 ? (
        <p className="py-4 text-center text-sm text-encre-2">
          Aucun panier suspendu ni devis en attente.
        </p>
      ) : (
        <div className="max-h-96 space-y-1 overflow-auto">
          {suspendedSales.map(({ sale, items }) => (
            <button
              key={sale.id}
              onClick={() => onRecall(sale.id)}
              className="flex w-full items-center justify-between rounded-lg px-4 py-3 text-left hover:bg-blue-50 touch-target"
            >
              <div>
                <span className="font-mono text-sm font-semibold text-encre">
                  {sale.sale_number}
                </span>
                {sale.is_quote === 1 && (
                  <span className="ml-2 rounded bg-neutre px-1.5 py-0.5 text-[0.625rem] font-semibold text-white">
                    DEVIS
                  </span>
                )}
                <p className="text-xs text-encre-2">
                  {formatDateTime(new Date(sale.created_at))} — {items.length} article(s)
                </p>
              </div>
              <MontantAr value={sale.total} />
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}
