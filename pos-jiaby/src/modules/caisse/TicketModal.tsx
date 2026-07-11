import { useState } from 'react';
import type { TicketData } from '@/core/printing/ticket';
import { generateTicketText } from '@/core/printing/ticket';

interface TicketModalProps {
  ticket: TicketData | null;
  onPrint: (ticket: TicketData) => Promise<void>;
  onClose: () => void;
}

/**
 * Facture / ticket de caisse affiché après chaque encaissement,
 * au format 80 mm (comme le ticket imprimé). Boutons Imprimer / Fermer.
 */
export function TicketModal({ ticket, onPrint, onClose }: TicketModalProps) {
  const [printing, setPrinting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!ticket) return null;

  const handlePrint = async () => {
    setError(null);
    setPrinting(true);
    try {
      await onPrint(ticket);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur d’impression');
    }
    setPrinting(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-6">
      <div className="max-h-[92vh] w-full max-w-sm overflow-y-auto rounded-lg bg-carte shadow-xl liseré-terre">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h2 className="text-lg font-semibold text-encre">
            {ticket.documentType === 'devis' ? 'Devis' : 'Ticket'} {ticket.ticketNumber}
          </h2>
          <button
            onClick={onClose}
            className="touch-target rounded px-2 hover:bg-gray-100"
            aria-label="Fermer le ticket"
          >
            ✕
          </button>
        </div>

        {/* Aperçu 80 mm */}
        <div className="flex justify-center bg-atelier px-4 py-4">
          <pre className="max-w-full overflow-x-auto rounded bg-white px-3 py-4 font-mono text-[0.7rem] leading-snug shadow-sm">
            {generateTicketText(ticket)}
          </pre>
        </div>

        {error && (
          <div className="mx-5 mb-2 rounded bg-red-50 px-3 py-2 text-sm text-red-600">
            {error}
          </div>
        )}

        <div className="flex gap-2 border-t px-5 py-3">
          <button
            onClick={handlePrint}
            disabled={printing}
            className="flex-1 rounded-lg bg-neutre py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 touch-target"
          >
            {printing ? 'Impression…' : 'Imprimer'}
          </button>
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-gray-300 py-2 text-sm font-medium text-encre-2 hover:bg-gray-50 touch-target"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
