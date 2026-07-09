import { useState } from 'react';
import { SearchBox, MontantAr } from '@/components';
import type { Customer } from '@/core/domain/types';

interface CustomerSelectProps {
  customers: Customer[];
  onSelect: (customer: Customer) => void;
  onClose: () => void;
}

/**
 * Sélecteur rapide de client pour crédit ou association.
 * Recherche par nom, prénom, téléphone.
 */
export function CustomerSelect({ customers, onSelect, onClose }: CustomerSelectProps) {
  const [search, setSearch] = useState('');

  const filtered = search.trim()
    ? customers.filter(
        (c) =>
          c.deleted === 0 &&
          (c.last_name.toLowerCase().includes(search.toLowerCase()) ||
            c.first_name.toLowerCase().includes(search.toLowerCase()) ||
            (c.phone && c.phone.includes(search)))
      ).slice(0, 20)
    : customers.filter(c => c.deleted === 0).slice(0, 20);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-10">
      <div className="w-full max-w-md rounded-lg bg-carte shadow-xl liseré-terre">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-lg font-semibold text-encre">Sélectionner un client</h2>
          <button onClick={onClose} className="touch-target rounded px-2 hover:bg-gray-100">
            ✕
          </button>
        </div>

        <div className="px-4 py-3">
          <SearchBox
            onSearch={setSearch}
            placeholder="Rechercher un client (nom, téléphone)…"
          />
        </div>

        <div className="max-h-96 overflow-auto px-4 pb-4">
          {filtered.length === 0 ? (
            <p className="py-4 text-center text-sm text-encre-2">
              Aucun client trouvé.
            </p>
          ) : (
            <div className="space-y-1">
              {filtered.map((customer) => (
                <button
                  key={customer.id}
                  onClick={() => onSelect(customer)}
                  className="flex w-full items-center justify-between rounded-lg px-4 py-3 text-left hover:bg-blue-50 touch-target"
                >
                  <div>
                    <span className="text-sm font-semibold text-encre">
                      {customer.last_name} {customer.first_name}
                    </span>
                    {customer.phone && (
                      <span className="ml-2 text-xs text-encre-2">
                        {customer.phone}
                      </span>
                    )}
                  </div>
                  <div className="text-right text-xs">
                    {customer.balance_due > 0 && (
                      <span className="text-alerte">
                        Doit: <MontantAr value={customer.balance_due} />
                      </span>
                    )}
                    {customer.credit_limit > 0 && (
                      <span className="ml-2 text-encre-2">
                        Plafond: <MontantAr value={customer.credit_limit} />
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
