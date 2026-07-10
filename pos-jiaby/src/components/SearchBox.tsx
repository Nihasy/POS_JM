import { useState, useEffect, useRef, type KeyboardEvent } from 'react';

interface SearchBoxProps {
  onSearch: (query: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  /**
   * Scan douchette (la saisie se termine par Entrée) : appelé avec la
   * valeur courante ; retourner true si le code a été traité (article
   * ajouté au panier) → le champ est vidé pour le scan suivant.
   */
  onScan?: (value: string) => boolean;
}

/**
 * Barre de recherche instantanée (nom / référence / scan douchette).
 * Débounce 80 ms, navigation clavier dans les résultats.
 *
 * @example
 * <SearchBox onSearch={(q) => rechercherProduits(q)} />
 */
export function SearchBox({
  onSearch,
  placeholder = 'Rechercher un produit (nom, référence ou scan)…',
  autoFocus = true,
  onScan,
}: SearchBoxProps) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocus]);

  const handleChange = (newValue: string) => {
    setValue(newValue);

    // Débounce 80 ms
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onSearch(newValue.trim());
    }, 80);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    // Scan douchette : se termine par Enter
    if (e.key === 'Enter') {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      // Référence exacte scannée → article ajouté, champ vidé pour
      // enchaîner les scans sans toucher au clavier
      if (onScan && onScan(value.trim())) {
        setValue('');
        onSearch('');
        return;
      }
      onSearch(value.trim());
    }
  };

  // Nettoyage
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="w-full rounded-lg border border-gray-300 bg-carte px-4 py-3 text-base text-encre placeholder:text-encre-2 focus:border-neutre focus:outline-none"
        aria-label="Rechercher un produit"
      />
      {value && (
        <button
          onClick={() => {
            setValue('');
            onSearch('');
            inputRef.current?.focus();
          }}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-encre-2 hover:text-encre touch-target rounded"
          aria-label="Effacer la recherche"
        >
          ✕
        </button>
      )}
    </div>
  );
}
