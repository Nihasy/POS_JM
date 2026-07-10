import { useState, useMemo } from 'react';
import { SearchBox, MontantAr, Modal } from '@/components';
import type { Customer } from '@/core/domain/types';

interface ClientsScreenProps {
  customers: Customer[];
  onCreateCustomer: (data: {
    firstName: string;
    lastName: string;
    phone: string | null;
    creditLimit: number;
  }) => Promise<void>;
  onPayment: (customerId: string, amount: number) => Promise<void>;
  canEdit: boolean;
}

/**
 * Écran clients — soldes crédit et règlements.
 * Liste des clients avec solde dû / plafond, encaissement des règlements.
 */
export function ClientsScreen({
  customers,
  onCreateCustomer,
  onPayment,
  canEdit,
}: ClientsScreenProps) {
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [paymentTarget, setPaymentTarget] = useState<Customer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Formulaire création
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [creditLimit, setCreditLimit] = useState('');

  // Règlement
  const [paymentAmount, setPaymentAmount] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return customers;
    const q = search.toLowerCase();
    return customers.filter(
      (c) =>
        c.last_name.toLowerCase().includes(q) ||
        c.first_name.toLowerCase().includes(q) ||
        (c.phone && c.phone.includes(search))
    );
  }, [customers, search]);

  const totalDue = useMemo(
    () => customers.reduce((s, c) => s + c.balance_due, 0),
    [customers]
  );

  const handleCreate = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await onCreateCustomer({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim() || null,
        creditLimit: Number(creditLimit) || 0,
      });
      setShowForm(false);
      setFirstName('');
      setLastName('');
      setPhone('');
      setCreditLimit('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue');
    }
    setSubmitting(false);
  };

  const handlePayment = async () => {
    if (!paymentTarget) return;
    setError(null);
    setSubmitting(true);
    try {
      await onPayment(paymentTarget.id, Number(paymentAmount) || 0);
      setPaymentTarget(null);
      setPaymentAmount('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue');
    }
    setSubmitting(false);
  };

  return (
    <div className="flex h-full flex-col p-4">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-bold text-encre">Clients & crédit</h2>
        <div className="flex items-center gap-3">
          <span className="text-sm text-encre-2">
            Encours crédit total : <MontantAr value={totalDue} className="font-semibold" />
          </span>
          {canEdit && (
            <button
              onClick={() => setShowForm(true)}
              className="rounded-lg bg-neutre px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 touch-target"
            >
              + Nouveau client
            </button>
          )}
        </div>
      </div>

      <div className="mb-3">
        <SearchBox onSearch={setSearch} placeholder="Rechercher un client (nom, téléphone)…" />
      </div>

      <div className="flex-1 overflow-auto rounded-lg bg-carte shadow-sm">
        {filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-encre-2">Aucun client.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-carte">
              <tr className="border-b text-left text-xs text-encre-2">
                <th className="px-4 py-2">Client</th>
                <th className="px-4 py-2">Téléphone</th>
                <th className="px-4 py-2 text-right">Solde dû</th>
                <th className="px-4 py-2 text-right">Plafond</th>
                <th className="px-4 py-2 text-right">Disponible</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const available = Math.max(0, c.credit_limit - c.balance_due);
                return (
                  <tr key={c.id} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-2 font-medium text-encre">
                      {c.last_name} {c.first_name}
                    </td>
                    <td className="px-4 py-2 text-encre-2">{c.phone ?? '—'}</td>
                    <td className="px-4 py-2 text-right">
                      <MontantAr
                        value={c.balance_due}
                        className={c.balance_due > 0 ? 'text-alerte font-semibold' : ''}
                      />
                    </td>
                    <td className="px-4 py-2 text-right">
                      <MontantAr value={c.credit_limit} />
                    </td>
                    <td className="px-4 py-2 text-right">
                      <MontantAr value={available} className="text-especes" />
                    </td>
                    <td className="px-4 py-2 text-right">
                      {c.balance_due > 0 && (
                        <button
                          onClick={() => {
                            setError(null);
                            setPaymentTarget(c);
                          }}
                          className="rounded bg-especes px-3 py-1 text-xs font-medium text-white hover:bg-green-700 touch-target"
                        >
                          Règlement
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Modale création client */}
      <Modal open={showForm} onClose={() => setShowForm(false)} title="Nouveau client">
        <div className="space-y-3">
          <input
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-neutre focus:outline-none"
            placeholder="Nom *"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
          />
          <input
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-neutre focus:outline-none"
            placeholder="Prénom"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
          />
          <input
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-neutre focus:outline-none"
            placeholder="Téléphone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <input
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-neutre focus:outline-none"
            placeholder="Plafond crédit (Ar)"
            type="number"
            value={creditLimit}
            onChange={(e) => setCreditLimit(e.target.value)}
          />
          {error && (
            <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>
          )}
          <button
            onClick={handleCreate}
            disabled={submitting || !lastName.trim()}
            className="w-full rounded-lg bg-neutre py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 touch-target"
          >
            {submitting ? 'Création…' : 'Créer le client'}
          </button>
        </div>
      </Modal>

      {/* Modale règlement */}
      <Modal
        open={paymentTarget !== null}
        onClose={() => setPaymentTarget(null)}
        title={`Règlement — ${paymentTarget?.last_name ?? ''} ${paymentTarget?.first_name ?? ''}`}
      >
        {paymentTarget && (
          <div className="space-y-3">
            <div className="text-center">
              <p className="text-sm text-encre-2">Solde dû</p>
              <MontantAr value={paymentTarget.balance_due} total />
            </div>
            <input
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-neutre focus:outline-none"
              placeholder="Montant du règlement (Ar)"
              type="number"
              value={paymentAmount}
              onChange={(e) => setPaymentAmount(e.target.value)}
              autoFocus
            />
            <button
              onClick={() => setPaymentAmount(String(paymentTarget.balance_due))}
              className="w-full rounded border border-gray-300 py-1.5 text-xs text-encre-2 hover:bg-gray-50 touch-target"
            >
              Solde complet ({paymentTarget.balance_due} Ar)
            </button>
            {error && (
              <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>
            )}
            <button
              onClick={handlePayment}
              disabled={submitting || !Number(paymentAmount)}
              className="w-full rounded-lg bg-especes py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50 touch-target"
            >
              {submitting ? 'Enregistrement…' : 'Encaisser le règlement'}
            </button>
          </div>
        )}
      </Modal>
    </div>
  );
}
