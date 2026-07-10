/**
 * Hashage des PIN — bcrypt (ou fallback pbkdf2 pour environnement sans Node native).
 *
 * Règle métier : PIN de 4 à 6 chiffres, hashé avec bcrypt (argon2 en fallback).
 * Verrouillage après 5 échecs, 1 minute.
 *
 * Les mots de passe sont hachés côté Tauri (Rust) ou côté前端 (Web Crypto).
 * Ce module fournit l'interface unifiée.
 */

// Constantes
const PIN_MIN_LENGTH = 4;
const PIN_MAX_LENGTH = 6;

/**
 * Interface de hachage unifiée.
 * En production (Tauri), utilise bcrypt via le backend Rust.
 * En développement (navigateur), utilise PBKDF2 via Web Crypto.
 */
export interface PinHasher {
  hash(pin: string): Promise<string>;
  verify(pin: string, hash: string): Promise<boolean>;
}

/**
 * Hasheur basé sur Web Crypto (PBKDF2).
 * Fallback pour environnement sans Node.js native.
 */
class WebCryptoHasher implements PinHasher {
  private encoder = new TextEncoder();

  async hash(pin: string): Promise<string> {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await crypto.subtle.importKey(
      'raw',
      this.encoder.encode(pin),
      'PBKDF2',
      false,
      ['deriveBits']
    );
    const bits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: salt.buffer as ArrayBuffer,
        iterations: 100_000,
        hash: 'SHA-256',
      },
      key,
      256
    );
    const hashBytes = new Uint8Array(bits);
    const saltHex = bytesToHex(salt);
    const hashHex = bytesToHex(hashBytes);
    return `pbkdf2:${saltHex}:${hashHex}`;
  }

  async verify(pin: string, storedHash: string): Promise<boolean> {
    if (!storedHash.startsWith('pbkdf2:')) {
      // Format inconnu — rejeter
      return false;
    }

    const parts = storedHash.split(':');
    if (parts.length !== 3) return false;

    const salt = hexToBytes(parts[1]!);
    const expectedHash = parts[2]!;

    const key = await crypto.subtle.importKey(
      'raw',
      this.encoder.encode(pin),
      'PBKDF2',
      false,
      ['deriveBits']
    );
    const bits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: salt.buffer as ArrayBuffer,
        iterations: 100_000,
        hash: 'SHA-256',
      },
      key,
      256
    );

    const actualHash = bytesToHex(new Uint8Array(bits));
    return timingSafeEqual(actualHash, expectedHash);
  }
}

/**
 * Hasheur bcrypt via le backend Rust (commandes Tauri hash_pin / verify_pin).
 * Les hash PBKDF2 hérités (préfixe `pbkdf2:`) restent vérifiables
 * via le fallback Web Crypto — migration transparente.
 */
class TauriBcryptHasher implements PinHasher {
  private fallback = new WebCryptoHasher();

  async hash(pin: string): Promise<string> {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke<string>('hash_pin', { pin });
  }

  async verify(pin: string, storedHash: string): Promise<boolean> {
    if (storedHash.startsWith('pbkdf2:')) {
      return this.fallback.verify(pin, storedHash);
    }
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke<boolean>('verify_pin', { pin, hash: storedHash });
  }
}

/** Détecte le runtime Tauri (backend Rust disponible). */
function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

// Singleton
let _hasher: PinHasher | null = null;

/**
 * Retourne le hasheur approprié pour l'environnement courant :
 * bcrypt (Rust) sous Tauri, PBKDF2 (Web Crypto) sinon.
 */
export function getPinHasher(): PinHasher {
  if (!_hasher) {
    _hasher = isTauri() ? new TauriBcryptHasher() : new WebCryptoHasher();
  }
  return _hasher;
}

/**
 * Définit un hasheur personnalisé (ex: bcrypt via Tauri).
 */
export function setPinHasher(hasher: PinHasher): void {
  _hasher = hasher;
}

/**
 * Valide un PIN selon les règles métier.
 */
export function validatePinFormat(pin: string): string | null {
  if (pin.length < PIN_MIN_LENGTH) {
    return `Le PIN doit contenir au moins ${PIN_MIN_LENGTH} chiffres.`;
  }
  if (pin.length > PIN_MAX_LENGTH) {
    return `Le PIN ne peut pas dépasser ${PIN_MAX_LENGTH} chiffres.`;
  }
  if (!/^\d+$/.test(pin)) {
    return 'Le PIN ne doit contenir que des chiffres.';
  }
  return null;
}

/**
 * Hache un PIN avec le hasheur courant.
 */
export async function hashPin(pin: string): Promise<string> {
  const error = validatePinFormat(pin);
  if (error) throw new Error(error);
  return getPinHasher().hash(pin);
}

/**
 * Vérifie un PIN contre un hash stocké.
 */
export async function verifyPin(pin: string, storedHash: string): Promise<boolean> {
  return getPinHasher().verify(pin, storedHash);
}

// ─── Utilitaires ───────────────────────────────────────────────────

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

/**
 * Comparaison en temps constant pour éviter les attaques temporelles.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;

  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
