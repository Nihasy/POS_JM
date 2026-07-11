import { useState, useEffect } from 'react';

interface NumPadProps {
  onValue: (value: string) => void;
  onEnter: () => void;
  allowDecimal?: boolean;
  label?: string;
  /** Mode contrôlé : l'affichage suit cette valeur (reset possible par le parent). */
  value?: string;
  /** Saisie discrète (PIN) : affiche des points à la place des chiffres. */
  masked?: boolean;
}

/**
 * Pavé numérique tactile/clavier.
 * Utilisé pour la saisie de quantités, montants, PIN.
 *
 * @example
 * <NumPad onValue={setQty} onEnter={valider} allowDecimal />
 */
export function NumPad({
  onValue,
  onEnter,
  allowDecimal = false,
  label = 'Saisie',
  value,
  masked = false,
}: NumPadProps) {
  const [internal, setInternal] = useState('');
  const display = value !== undefined ? value : internal;

  const handleKey = (key: string) => {
    let next = display;

    if (key === 'C') {
      next = '';
    } else if (key === '⌫') {
      next = display.slice(0, -1);
    } else if (key === ',' || key === '.') {
      if (!allowDecimal) return;
      if (display.includes(',') || display.includes('.')) return;
      next = display + ',';
    } else {
      // Chiffre
      next = display + key;
    }

    setInternal(next);
    onValue(next);
  };

  // Saisie au clavier physique : chiffres (rangée du haut et pavé
  // numérique), retour arrière, Suppr (effacer tout), virgule/point,
  // Entrée. Ignorée quand un champ de saisie a le focus (ex. référence
  // MVola) pour ne pas doubler la frappe.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.ctrlKey || e.altKey || e.metaKey) return;

      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        handleKey(e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        handleKey('⌫');
      } else if (e.key === 'Delete') {
        e.preventDefault();
        handleKey('C');
      } else if (e.key === ',' || e.key === '.') {
        if (allowDecimal) {
          e.preventDefault();
          handleKey(',');
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        onEnter();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // handleKey lit `display` : réabonner à chaque changement de saisie
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [display, allowDecimal, onValue, onEnter]);

  const keys = [
    ['7', '8', '9'],
    ['4', '5', '6'],
    ['1', '2', '3'],
    [allowDecimal ? ',' : '', '0', '⌫'],
    ['C', '↵'],
  ];

  return (
    <div className="select-none" aria-label={label}>
      {/* Affichage — masqué en saisie de PIN (discrétion) */}
      <div className="mb-2 rounded border border-gray-200 bg-white px-3 py-2 text-right font-mono text-2xl tabular-nums min-h-[2.5rem]">
        {masked ? '•'.repeat(display.length) || '·' : display || '0'}
      </div>

      {/* Grille de touches — grandes cibles (tactile + rapidité) */}
      <div className="grid grid-cols-3 gap-1.5">
        {keys.map((row, ri) =>
          row.map((key, ki) => {
            const isEnter = key === '↵';
            const isClear = key === 'C';
            const isBackspace = key === '⌫';
            if (key === '') {
              return <div key={`empty-${ri}-${ki}`} />;
            }

            // Touche Entrée pleine largeur sur la dernière ligne
            if (isEnter) {
              return (
                <button
                  key={`enter-${ri}`}
                  onClick={onEnter}
                  className="col-span-2 touch-target rounded-lg bg-neutre py-2.5 text-xl font-bold text-white hover:bg-blue-700 active:bg-blue-800"
                >
                  ↵
                </button>
              );
            }

            return (
              <button
                key={`${ri}-${ki}`}
                onClick={() => handleKey(key!)}
                className={`touch-target rounded-lg py-2.5 font-mono text-xl font-semibold active:scale-95
                  ${isClear ? 'bg-red-100 text-red-600 hover:bg-red-200' : ''}
                  ${isBackspace ? 'bg-gray-100 text-encre-2 hover:bg-gray-200' : ''}
                  ${!isClear && !isBackspace ? 'border border-gray-200 bg-white text-encre shadow-sm hover:bg-gray-50' : ''}
                `}
              >
                {key}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
