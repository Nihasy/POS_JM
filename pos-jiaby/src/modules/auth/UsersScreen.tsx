import { useState } from 'react';
import { Modal } from '@/components';
import { isLocked } from './authService';
import type { AppUser } from '@/app/services';

interface UsersScreenProps {
  users: AppUser[];
  currentUserId: string;
  onCreateUser: (params: {
    username: string;
    fullName: string;
    role: 'admin' | 'caissier';
    pin: string;
  }) => Promise<void>;
  onChangePin: (userId: string, pin: string) => Promise<void>;
  onSetActive: (userId: string, active: boolean) => Promise<void>;
  onUnlock: (userId: string) => Promise<void>;
}

/**
 * Gestion des utilisateurs (Admin uniquement — admin.users).
 * Création, changement de PIN, activation/désactivation (soft delete),
 * déverrouillage. La connexion étant « PIN seul », chaque PIN est unique.
 */
export function UsersScreen({
  users,
  currentUserId,
  onCreateUser,
  onChangePin,
  onSetActive,
  onUnlock,
}: UsersScreenProps) {
  const [showForm, setShowForm] = useState(false);
  const [pinTarget, setPinTarget] = useState<AppUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Formulaire création
  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<'admin' | 'caissier'>('caissier');
  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');

  // Changement de PIN
  const [newPin, setNewPin] = useState('');
  const [newPinConfirm, setNewPinConfirm] = useState('');

  const resetForm = () => {
    setUsername('');
    setFullName('');
    setRole('caissier');
    setPin('');
    setPinConfirm('');
    setError(null);
  };

  const handleCreate = async () => {
    setError(null);
    if (pin !== pinConfirm) {
      setError('Les deux PIN ne correspondent pas.');
      return;
    }
    setSubmitting(true);
    try {
      await onCreateUser({ username, fullName, role, pin });
      setShowForm(false);
      resetForm();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue');
    }
    setSubmitting(false);
  };

  const handleChangePin = async () => {
    if (!pinTarget) return;
    setError(null);
    if (newPin !== newPinConfirm) {
      setError('Les deux PIN ne correspondent pas.');
      return;
    }
    setSubmitting(true);
    try {
      await onChangePin(pinTarget.id, newPin);
      setPinTarget(null);
      setNewPin('');
      setNewPinConfirm('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue');
    }
    setSubmitting(false);
  };

  const handleSetActive = async (user: AppUser, active: boolean) => {
    setListError(null);
    try {
      await onSetActive(user.id, active);
    } catch (e) {
      setListError(e instanceof Error ? e.message : 'Erreur inconnue');
    }
  };

  const inputClass =
    'w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-neutre focus:outline-none';

  return (
    <div className="flex h-full flex-col p-4">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-bold text-encre">Utilisateurs</h2>
        <button
          onClick={() => {
            resetForm();
            setShowForm(true);
          }}
          className="rounded-lg bg-neutre px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 touch-target"
        >
          + Nouvel utilisateur
        </button>
      </div>

      {listError && (
        <div className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-600">{listError}</div>
      )}

      <div className="flex-1 overflow-auto rounded-lg bg-carte shadow-sm">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-carte">
            <tr className="border-b text-left text-xs text-encre-2">
              <th className="px-4 py-2">Utilisateur</th>
              <th className="px-4 py-2">Nom complet</th>
              <th className="px-4 py-2">Rôle</th>
              <th className="px-4 py-2">État</th>
              <th className="px-4 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const locked = isLocked(u.failed_attempts, u.locked_until);
              const isSelf = u.id === currentUserId;
              return (
                <tr key={u.id} className="border-b hover:bg-gray-50">
                  <td className="px-4 py-2 font-mono font-medium text-encre">
                    {u.username}
                    {isSelf && <span className="ml-1 text-xs text-encre-2">(vous)</span>}
                  </td>
                  <td className="px-4 py-2 text-encre">{u.full_name}</td>
                  <td className="px-4 py-2">
                    <span
                      className={`rounded px-1.5 py-0.5 text-[0.625rem] font-semibold uppercase ${
                        u.role === 'admin'
                          ? 'bg-encre text-white'
                          : 'bg-gray-100 text-encre-2'
                      }`}
                    >
                      {u.role}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    {u.deleted === 1 ? (
                      <span className="text-red-600">Désactivé</span>
                    ) : locked ? (
                      <span className="text-alerte">Verrouillé</span>
                    ) : (
                      <span className="text-especes">Actif</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right space-x-2">
                    {u.deleted === 0 && (
                      <button
                        onClick={() => {
                          setError(null);
                          setNewPin('');
                          setNewPinConfirm('');
                          setPinTarget(u);
                        }}
                        className="rounded border border-gray-300 px-3 py-1 text-xs text-encre-2 hover:bg-gray-50 touch-target"
                      >
                        Changer PIN
                      </button>
                    )}
                    {u.deleted === 0 && locked && (
                      <button
                        onClick={() => onUnlock(u.id)}
                        className="rounded bg-alerte px-3 py-1 text-xs font-medium text-white hover:bg-yellow-700 touch-target"
                      >
                        Déverrouiller
                      </button>
                    )}
                    {u.deleted === 0 && !isSelf && (
                      <button
                        onClick={() => handleSetActive(u, false)}
                        className="rounded border border-red-200 px-3 py-1 text-xs text-red-600 hover:bg-red-50 touch-target"
                      >
                        Désactiver
                      </button>
                    )}
                    {u.deleted === 1 && (
                      <button
                        onClick={() => handleSetActive(u, true)}
                        className="rounded bg-especes px-3 py-1 text-xs font-medium text-white hover:bg-green-700 touch-target"
                      >
                        Réactiver
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-2 text-xs text-encre-2">
        Connexion par PIN seul : chaque compte actif doit avoir un PIN unique (4 à 6 chiffres).
      </p>

      {/* Modale création */}
      <Modal open={showForm} onClose={() => setShowForm(false)} title="Nouvel utilisateur">
        <div className="space-y-3">
          <input
            className={inputClass}
            placeholder="Nom d'utilisateur *"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
          />
          <input
            className={inputClass}
            placeholder="Nom complet *"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
          <select
            className={inputClass}
            value={role}
            onChange={(e) => setRole(e.target.value as 'admin' | 'caissier')}
            aria-label="Rôle"
          >
            <option value="caissier">Caissier</option>
            <option value="admin">Admin</option>
          </select>
          <div className="grid grid-cols-2 gap-3">
            <input
              className={inputClass}
              placeholder="PIN (4-6 chiffres) *"
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value)}
            />
            <input
              className={inputClass}
              placeholder="Confirmer le PIN *"
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={pinConfirm}
              onChange={(e) => setPinConfirm(e.target.value)}
            />
          </div>
          {error && (
            <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>
          )}
          <button
            onClick={handleCreate}
            disabled={submitting || !username.trim() || !fullName.trim() || pin.length < 4}
            className="w-full rounded-lg bg-neutre py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 touch-target"
          >
            {submitting ? 'Création…' : "Créer l'utilisateur"}
          </button>
        </div>
      </Modal>

      {/* Modale changement de PIN */}
      <Modal
        open={pinTarget !== null}
        onClose={() => setPinTarget(null)}
        title={`Changer le PIN — ${pinTarget?.full_name ?? ''}`}
      >
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input
              className={inputClass}
              placeholder="Nouveau PIN *"
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={newPin}
              onChange={(e) => setNewPin(e.target.value)}
              autoFocus
            />
            <input
              className={inputClass}
              placeholder="Confirmer le PIN *"
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={newPinConfirm}
              onChange={(e) => setNewPinConfirm(e.target.value)}
            />
          </div>
          {error && (
            <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>
          )}
          <button
            onClick={handleChangePin}
            disabled={submitting || newPin.length < 4}
            className="w-full rounded-lg bg-neutre py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 touch-target"
          >
            {submitting ? 'Enregistrement…' : 'Changer le PIN'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
