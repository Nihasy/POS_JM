import { useState } from 'react';

interface NumPadProps {
  onValue: (value: string) => void;
  onEnter: () => void;
  allowDecimal?: boolean;
  label?: string;
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
}: NumPadProps) {
  const [display, setDisplay] = useState('');

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

    setDisplay(next);
    onValue(next);
  };

  const keys = [
    ['7', '8', '9'],
    ['4', '5', '6'],
    ['1', '2', '3'],
    [allowDecimal ? ',' : '0', '0', '⌫'],
    ['C', '↵'],
  ];

  return (
    <div className="select-none" aria-label={label}>
      {/* Affichage */}
      <div className="mb-2 rounded border border-gray-200 bg-white px-3 py-2 text-right font-mono text-2xl tabular-nums min-h-[2.5rem]">
        {display || '0'}
      </div>

      {/* Grille de touches */}
      <div className="grid grid-cols-3 gap-1">
        {keys.map((row, ri) =>
          row.map((key, ki) => {
            const isEnter = key === '↵';
            const isClear = key === 'C';
            const isBackspace = key === '⌫';
            const isEmpty = key === '' && ri === 3 && ki === 0;

            if (isEmpty) {
              return <div key={`empty-${ri}-${ki}`} />;
            }

            // Touche Entrée pleine largeur sur la dernière ligne
            if (isEnter) {
              return (
                <button
                  key={`enter-${ri}`}
                  onClick={onEnter}
                  className="col-span-2 touch-target rounded bg-neutre text-lg font-bold text-white hover:bg-blue-700 active:bg-blue-800"
                >
                  ↵
                </button>
              );
            }

            return (
              <button
                key={`${ri}-${ki}`}
                onClick={() => handleKey(key!)}
                className={`touch-target rounded text-lg font-semibold
                  ${isClear ? 'bg-red-100 text-red-600 hover:bg-red-200' : ''}
                  ${isBackspace ? 'bg-gray-100 text-encre-2 hover:bg-gray-200' : ''}
                  ${!isClear && !isBackspace ? 'bg-white text-encre hover:bg-gray-50 border border-gray-200' : ''}
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
