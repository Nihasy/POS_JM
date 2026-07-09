/**
 * Store Zustand — Authentification.
 *
 * Gère l'état de l'utilisateur connecté, le login/logout,
 * et la session de caisse courante.
 */

import { create } from 'zustand';
import type { UUID } from '@/core/domain/types';
import type { Role } from './authService';

export interface AuthUser {
  id: UUID;
  username: string;
  fullName: string;
  role: Role;
}

interface AuthState {
  /** Utilisateur connecté (null = non authentifié) */
  user: AuthUser | null;

  /** Session de caisse ouverte (null = pas de session) */
  activeSessionId: UUID | null;

  /** Token de session (pour sync future) */
  sessionToken: string | null;

  /** Actions */
  login: (user: AuthUser, token?: string) => void;
  logout: () => void;
  setActiveSession: (sessionId: UUID | null) => void;
  updateUser: (updates: Partial<AuthUser>) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  activeSessionId: null,
  sessionToken: null,

  login: (user, token) =>
    set({
      user,
      sessionToken: token ?? null,
    }),

  logout: () =>
    set({
      user: null,
      activeSessionId: null,
      sessionToken: null,
    }),

  setActiveSession: (sessionId) =>
    set({ activeSessionId: sessionId }),

  updateUser: (updates) =>
    set((state) => ({
      user: state.user ? { ...state.user, ...updates } : null,
    })),
}));

/**
 * Raccourci pour obtenir l'utilisateur courant hors React.
 */
export function getCurrentUser(): AuthUser | null {
  return useAuthStore.getState().user;
}

/**
 * Raccourci pour obtenir la session active hors React.
 */
export function getActiveSessionId(): UUID | null {
  return useAuthStore.getState().activeSessionId;
}
