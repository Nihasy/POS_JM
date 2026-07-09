import { useState, useCallback } from 'react';
import { NumPad } from '@/components';

interface LoginScreenProps {
  onLogin: (pin: string) => Promise<{ success: boolean; error?: string }>;
}

/**
 * Écran de connexion par PIN.
 * Pavé numérique, retour visuel en cas d'erreur, verrouillage.
 */
export function LoginScreen({ onLogin }: LoginScreenProps) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [attempts, setAttempts] = useState(0);

  const handleLogin = useCallback(async () => {
    if (pin.length < 4) {
      setError('Code PIN invalide (4 chiffres minimum)');
      return;
    }

    setLoading(true);
    setError(null);

    const result = await onLogin(pin);

    if (!result.success) {
      const newAttempts = attempts + 1;
      setAttempts(newAttempts);

      if (result.error?.includes('verrouillé') || result.error?.includes('locked')) {
        setError('Compte verrouillé. Veuillez patienter 1 minute.');
      } else if (newAttempts >= 5) {
        setError('Compte verrouillé après 5 tentatives (1 min).');
      } else {
        setError(
          `Code PIN incorrect. ${5 - newAttempts} tentative(s) restante(s).`
        );
      }
      setPin('');
    }

    setLoading(false);
  }, [pin, attempts, onLogin]);

  const handlePinChange = (value: string) => {
    // Limiter à 6 chiffres max
    if (value.length <= 6) {
      setPin(value);
      setError(null);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-atelier">
      <div className="w-full max-w-sm rounded-lg bg-carte p-8 shadow-lg liseré-terre">
        {/* Logo / Titre */}
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-encre">JIABY POS</h1>
          <p className="mt-1 text-sm text-encre-2">Connectez-vous pour continuer</p>
        </div>

        {/* Affichage PIN (masqué) */}
        <div className="mb-4 text-center">
          <div className="inline-flex gap-2">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <span
                key={i}
                className={`block h-4 w-4 rounded-full border-2 ${
                  i < pin.length
                    ? 'border-neutre bg-neutre'
                    : 'border-gray-300'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Message d'erreur */}
        {error && (
          <div className="mb-4 rounded bg-red-50 px-3 py-2 text-center text-sm text-red-600">
            {error}
          </div>
        )}

        {/* Pavé numérique */}
        <NumPad
          onValue={handlePinChange}
          onEnter={handleLogin}
          label="Code PIN"
          allowDecimal={false}
        />

        {/* Bouton connexion */}
        <button
          onClick={handleLogin}
          disabled={loading || pin.length < 4}
          className="mt-3 w-full rounded-lg bg-neutre py-3 text-base font-semibold text-white hover:bg-blue-700 disabled:opacity-50 touch-target"
        >
          {loading ? 'Connexion…' : 'Se connecter'}
        </button>
      </div>
    </div>
  );
}
