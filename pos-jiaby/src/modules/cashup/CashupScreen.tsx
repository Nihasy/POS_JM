import { useState, useMemo } from 'react';
import { MontantAr } from '@/components';
import { formatDateTime } from '@/core/format';
import type { CashupSession, CashupExpense } from '@/core/domain/types';

interface CashupScreenProps {
  activeSession: CashupSession | null;
  expenses: CashupExpense[];
  todayCashSales: number;
  todayCashReturns: number;
  todayMvolaTotal: number;
  todayCreditTotal: number;
  onOpenSession: (openingAmount: number) => Promise<void>;
  onCloseSession: (countedCash: number, note: string) => Promise<void>;
  onAddExpense: (category: string, amount: number, reason: string) => Promise<void>;
}

const EXPENSE_CATEGORIES = [
  'transport', 'repas', 'fournitures', 'entretien', 'communication', 'divers',
];

/**
 * Écran de gestion des sessions de caisse.
 * Ouverture, dépenses, clôture avec écart.
 */
export function CashupScreen({
  activeSession,
  expenses,
  todayCashSales,
  todayCashReturns,
  todayMvolaTotal,
  todayCreditTotal,
  onOpenSession,
  onCloseSession,
  onAddExpense,
}: CashupScreenProps) {
  const [openingAmount, setOpeningAmount] = useState('');
  const [expenseCategory, setExpenseCategory] = useState('divers');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseReason, setExpenseReason] = useState('');
  const [countedCash, setCountedCash] = useState('');
  const [closeNote, setCloseNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Calcul attendu
  const expectedCash = useMemo(() => {
    if (!activeSession) return 0;
    const expTotal = expenses.reduce((s, e) => s + e.amount, 0);
    return activeSession.opening_amount + todayCashSales - todayCashReturns - expTotal;
  }, [activeSession, expenses, todayCashSales, todayCashReturns]);

  const diff =
    countedCash ? Number(countedCash) - expectedCash : null;

  const handleOpenSession = async () => {
    const amount = Number(openingAmount);
    if (!amount || amount < 0) return;
    setSubmitting(true);
    await onOpenSession(amount);
    setSubmitting(false);
    setOpeningAmount('');
  };

  const handleAddExpense = async () => {
    const amount = Number(expenseAmount);
    if (!amount || amount <= 0 || !expenseReason.trim()) return;
    setSubmitting(true);
    await onAddExpense(expenseCategory, amount, expenseReason.trim());
    setSubmitting(false);
    setExpenseAmount('');
    setExpenseReason('');
  };

  const handleCloseSession = async () => {
    const counted = Number(countedCash);
    if (!counted || counted < 0) return;
    setSubmitting(true);
    await onCloseSession(counted, closeNote);
    setSubmitting(false);
    setCountedCash('');
    setCloseNote('');
  };

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <h2 className="text-xl font-bold text-encre">Session de caisse</h2>

      {/* Statut session */}
      <div className="rounded-lg bg-carte p-4 shadow-sm">
        {activeSession ? (
          <div>
            <p className="text-especes text-sm font-semibold flex items-center gap-2">
              <span className="inline-block h-2 w-2 rounded-full bg-especes" />
              Session ouverte
            </p>
            <p className="text-xs text-encre-2 mt-1">
              Depuis {formatDateTime(new Date(activeSession.opened_at))}
            </p>
            <p className="text-sm mt-2">
              Fond d'ouverture : <MontantAr value={activeSession.opening_amount} />
            </p>
          </div>
        ) : (
          <p className="text-alerte text-sm font-semibold flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-alerte" />
            Aucune session ouverte
          </p>
        )}
      </div>

      {/* Ouverture (si pas de session) */}
      {!activeSession && (
        <div className="rounded-lg bg-carte p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-encre mb-3">Ouverture de session</h3>
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="block text-xs text-encre-2 mb-1">
                Fond d'ouverture (Ar)
              </label>
              <input
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm font-mono"
                type="number"
                min="0"
                value={openingAmount}
                onChange={(e) => setOpeningAmount(e.target.value)}
              />
            </div>
            <button
              onClick={handleOpenSession}
              disabled={!openingAmount || submitting}
              className="rounded-lg bg-especes px-6 py-2 text-sm font-bold text-white hover:bg-green-700 disabled:opacity-50 touch-target"
            >
              Ouvrir
            </button>
          </div>
        </div>
      )}

      {/* Dépenses (si session ouverte) */}
      {activeSession && (
        <div className="rounded-lg bg-carte p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-encre mb-3">Dépenses</h3>
          <div className="grid grid-cols-4 gap-2 mb-3">
            <select
              className="rounded border border-gray-300 px-2 py-2 text-sm"
              value={expenseCategory}
              onChange={(e) => setExpenseCategory(e.target.value)}
            >
              {EXPENSE_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
            <input
              className="rounded border border-gray-300 px-3 py-2 text-sm font-mono"
              type="number"
              min="0"
              placeholder="Montant"
              value={expenseAmount}
              onChange={(e) => setExpenseAmount(e.target.value)}
            />
            <input
              className="rounded border border-gray-300 px-3 py-2 text-sm col-span-1"
              placeholder="Motif"
              value={expenseReason}
              onChange={(e) => setExpenseReason(e.target.value)}
            />
            <button
              onClick={handleAddExpense}
              disabled={!expenseAmount || !expenseReason || submitting}
              className="rounded-lg bg-neutre px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 touch-target"
            >
              + Ajouter
            </button>
          </div>

          {/* Liste des dépenses */}
          {expenses.length > 0 && (
            <div className="space-y-1">
              {expenses.map((e) => (
                <div
                  key={e.id}
                  className="flex justify-between rounded bg-atelier px-3 py-1.5 text-sm"
                >
                  <span>
                    <span className="font-medium">{e.category}</span>
                    <span className="ml-2 text-encre-2">{e.reason}</span>
                  </span>
                  <MontantAr value={e.amount} className="text-sm" />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Clôture */}
      {activeSession && (
        <div className="rounded-lg bg-carte p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-encre mb-3">Clôture de session</h3>

          {/* Résumé */}
          <div className="mb-4 grid grid-cols-2 gap-2 text-sm">
            <div className="flex justify-between rounded bg-atelier px-3 py-2">
              <span>Ventes espèces</span>
              <MontantAr value={todayCashSales} />
            </div>
            <div className="flex justify-between rounded bg-atelier px-3 py-2">
              <span>Retours espèces</span>
              <MontantAr value={-todayCashReturns} />
            </div>
            <div className="flex justify-between rounded bg-atelier px-3 py-2">
              <span>Dépenses</span>
              <MontantAr value={-expenses.reduce((s, e) => s + e.amount, 0)} />
            </div>
            <div className="flex justify-between rounded bg-blue-50 px-3 py-2 font-semibold">
              <span>Attendu</span>
              <MontantAr value={expectedCash} />
            </div>
            <div className="flex justify-between rounded bg-atelier px-3 py-2">
              <span>MVola</span>
              <MontantAr value={todayMvolaTotal} />
            </div>
            <div className="flex justify-between rounded bg-atelier px-3 py-2">
              <span>Crédit</span>
              <MontantAr value={todayCreditTotal} />
            </div>
          </div>

          {/* Saisie compté */}
          <div className="flex items-end gap-3 mb-3">
            <div className="flex-1">
              <label className="block text-xs text-encre-2 mb-1">
                Espèces comptées (Ar)
              </label>
              <input
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm font-mono"
                type="number"
                min="0"
                value={countedCash}
                onChange={(e) => setCountedCash(e.target.value)}
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs text-encre-2 mb-1">Note</label>
              <input
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                value={closeNote}
                onChange={(e) => setCloseNote(e.target.value)}
                placeholder="Optionnel"
              />
            </div>
            <button
              onClick={handleCloseSession}
              disabled={!countedCash || submitting}
              className="rounded-lg bg-red-600 px-6 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50 touch-target"
            >
              Clôturer
            </button>
          </div>

          {/* Écart */}
          {diff !== null && (
            <div
              className={`rounded px-4 py-3 text-center text-lg font-bold ${
                diff === 0
                  ? 'bg-green-50 text-especes'
                  : diff > 0
                  ? 'bg-blue-50 text-neutre'
                  : 'bg-red-50 text-red-600'
              }`}
            >
              {diff === 0
                ? 'Caisse juste ✓'
                : diff > 0
                ? `Excédent : +${diff} Ar`
                : `Manquant : ${diff} Ar`}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
