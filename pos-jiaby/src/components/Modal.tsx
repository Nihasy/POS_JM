import { type ReactNode, useEffect, useRef } from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

/**
 * Fenêtre modale avec liseré terre (signature JIABY).
 * Piège le focus, fermeture par Échap.
 */
export function Modal({ open, onClose, title, children }: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open) {
      previousFocus.current = document.activeElement as HTMLElement;
      dialog.showModal();
    } else {
      dialog.close();
      previousFocus.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <dialog
      ref={dialogRef}
      className="liseré-terre rounded-lg bg-carte p-0 shadow-xl backdrop:bg-black/40"
      onClick={(e) => {
        if (e.target === dialogRef.current) onClose();
      }}
    >
      <div className="min-w-[320px] max-w-lg">
        {/* En-tête avec liseré */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-encre">{title}</h2>
          <button
            onClick={onClose}
            className="touch-target rounded text-encre-2 hover:bg-gray-100"
            aria-label="Fermer"
          >
            ✕
          </button>
        </div>
        {/* Contenu */}
        <div className="px-6 py-4">{children}</div>
      </div>
    </dialog>
  );
}
