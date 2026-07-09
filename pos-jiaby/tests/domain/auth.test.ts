import { describe, it, expect } from 'vitest';
import {
  isLocked,
  lockRemainingSeconds,
  validatePin,
  hasPermission,
  ROLE_PERMISSIONS,
} from '../../src/modules/auth/authService';

describe('isLocked', () => {
  it('Non verrouillé si peu de tentatives', () => {
    expect(isLocked(0, null)).toBe(false);
    expect(isLocked(3, null)).toBe(false);
    expect(isLocked(4, null)).toBe(false);
  });

  it('Non verrouillé si locked_until est passé', () => {
    const past = new Date(Date.now() - 60000).toISOString();
    expect(isLocked(5, past)).toBe(false);
  });

  it('Verrouillé si 5 échecs et locked_until dans le futur', () => {
    const future = new Date(Date.now() + 30000).toISOString();
    expect(isLocked(5, future)).toBe(true);
  });

  it('Non verrouillé si locked_until null même avec 5 échecs', () => {
    // locked_until devrait être set, mais si null, on laisse passer
    expect(isLocked(5, null)).toBe(false);
  });
});

describe('validatePin', () => {
  it('Compte supprimé', () => {
    const result = validatePin('1234', 'hash', 0, null, 1);
    expect(result.success).toBe(false);
    expect(result.error).toBe('DELETED');
  });

  it('Compte verrouillé', () => {
    const future = new Date(Date.now() + 30000).toISOString();
    const result = validatePin('1234', 'hash', 5, future, 0);
    expect(result.success).toBe(false);
    expect(result.error).toBe('LOCKED');
  });

  // Note: PIN valide/invalide dépend du hash qui est vérifié côté DB
  // Ces tests valident la logique métier pure (verrouillage, soft delete)
});

describe('hasPermission', () => {
  it('Admin a toutes les permissions', () => {
    expect(hasPermission('admin', 'caisse.vendre')).toBe(true);
    expect(hasPermission('admin', 'stock.cout_visible')).toBe(true);
    expect(hasPermission('admin', 'admin.users')).toBe(true);
  });

  it('Caissier a les permissions de base', () => {
    expect(hasPermission('caissier', 'caisse.vendre')).toBe(true);
    expect(hasPermission('caissier', 'caisse.encaisser')).toBe(true);
    expect(hasPermission('caissier', 'stock.lecture')).toBe(true);
  });

  it('Caissier ne voit pas les coûts', () => {
    expect(hasPermission('caissier', 'stock.cout_visible')).toBe(false);
  });

  it('Caissier ne peut pas gérer les utilisateurs', () => {
    expect(hasPermission('caissier', 'admin.users')).toBe(false);
  });

  it('Caissier ne peut pas voir les marges', () => {
    expect(hasPermission('caissier', 'rapports.marges')).toBe(false);
  });
});

describe('ROLE_PERMISSIONS', () => {
  it('Admin a plus de permissions que Caissier', () => {
    expect(ROLE_PERMISSIONS.admin.length).toBeGreaterThan(
      ROLE_PERMISSIONS.caissier.length
    );
  });

  it('Les permissions caissier sont un sous-ensemble des permissions admin', () => {
    for (const perm of ROLE_PERMISSIONS.caissier) {
      expect(ROLE_PERMISSIONS.admin).toContain(perm);
    }
  });
});
