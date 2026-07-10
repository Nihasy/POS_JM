import { test, expect, type Page } from '@playwright/test';
import { login } from './helpers';

/**
 * Gestion des utilisateurs (Admin) : création, unicité du PIN,
 * changement de PIN, désactivation/réactivation, permissions caissier.
 */

async function loginWithPin(page: Page, pin: string) {
  for (const digit of pin) {
    await page.getByRole('button', { name: digit, exact: true }).click();
  }
  await page.getByRole('button', { name: 'Se connecter' }).click();
}

async function logout(page: Page) {
  await page.getByRole('button', { name: 'Déconnexion' }).click();
  await expect(page.getByRole('button', { name: 'Se connecter' })).toBeVisible();
}

async function createUser(
  page: Page,
  params: { username: string; fullName: string; role: 'Caissier' | 'Admin'; pin: string }
) {
  await page.getByRole('button', { name: 'Utilisateurs', exact: true }).click();
  await page.getByRole('button', { name: '+ Nouvel utilisateur' }).click();
  await page.getByPlaceholder("Nom d'utilisateur *").fill(params.username);
  await page.getByPlaceholder('Nom complet *').fill(params.fullName);
  await page.getByLabel('Rôle').selectOption({ label: params.role });
  await page.getByPlaceholder('PIN (4-6 chiffres) *').fill(params.pin);
  await page.getByPlaceholder('Confirmer le PIN *').fill(params.pin);
  await page.getByRole('button', { name: "Créer l'utilisateur" }).click();
}

test('création d’un caissier → connexion avec son PIN, droits restreints', async ({ page }) => {
  await login(page);

  await createUser(page, {
    username: 'vendeur1',
    fullName: 'Vendeur Un',
    role: 'Caissier',
    pin: '5678',
  });
  const row = page.getByRole('row').filter({ hasText: 'vendeur1' });
  await expect(row).toBeVisible({ timeout: 15_000 });
  await expect(row).toContainText('Actif');

  // Connexion avec le nouveau compte
  await logout(page);
  await loginWithPin(page, '5678');
  await expect(page.getByText('Vendeur Un')).toBeVisible({ timeout: 15_000 });

  // Droits caissier : pas d'écran Utilisateurs, pas de sauvegarde,
  // pas de création produit, pas de PMP visible
  await expect(page.getByRole('button', { name: 'Utilisateurs', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Sauvegarde' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Catalogue', exact: true }).click();
  await expect(page.getByRole('button', { name: '+ Nouveau' })).toHaveCount(0);
  await expect(page.getByText(/PMP:/)).toHaveCount(0);

  // L'inventaire ne peut pas être validé par un caissier
  await page.getByRole('button', { name: 'Stock', exact: true }).click();
  await page.getByRole('button', { name: 'Inventaire & ajustements' }).click();
  await expect(
    page.getByRole('button', { name: "Valider l'inventaire (Admin)" })
  ).toBeDisabled();
});

test('PIN déjà utilisé refusé (connexion par PIN seul)', async ({ page }) => {
  await login(page);

  await createUser(page, {
    username: 'vendeur2',
    fullName: 'Vendeur Deux',
    role: 'Caissier',
    pin: '1234', // PIN de l'admin
  });
  await expect(page.getByText('Ce PIN est déjà utilisé par un autre compte.')).toBeVisible({
    timeout: 15_000,
  });
});

test('nom d’utilisateur en double refusé', async ({ page }) => {
  await login(page);

  await createUser(page, {
    username: 'admin',
    fullName: 'Doublon',
    role: 'Caissier',
    pin: '8765',
  });
  await expect(page.getByText(/existe déjà/)).toBeVisible({ timeout: 15_000 });
});

test('changement de PIN : l’ancien ne passe plus, le nouveau oui', async ({ page }) => {
  await login(page);
  await createUser(page, {
    username: 'vendeur3',
    fullName: 'Vendeur Trois',
    role: 'Caissier',
    pin: '5678',
  });
  await expect(page.getByRole('row').filter({ hasText: 'vendeur3' })).toBeVisible({
    timeout: 15_000,
  });

  const row = page.getByRole('row').filter({ hasText: 'vendeur3' });
  await row.getByRole('button', { name: 'Changer PIN' }).click();
  await page.getByPlaceholder('Nouveau PIN *').fill('2468');
  await page.getByPlaceholder('Confirmer le PIN *').fill('2468');
  await page.getByRole('button', { name: 'Changer le PIN' }).click();
  await expect(page.getByText('PIN modifié.')).toBeVisible({ timeout: 15_000 });

  await logout(page);

  // Ancien PIN refusé
  await loginWithPin(page, '5678');
  await expect(page.getByText(/Code PIN incorrect/)).toBeVisible({ timeout: 15_000 });

  // Nouveau PIN accepté
  await loginWithPin(page, '2468');
  await expect(page.getByText('Vendeur Trois')).toBeVisible({ timeout: 15_000 });
});

test('désactivation : connexion bloquée, puis réactivation', async ({ page }) => {
  await login(page);
  await createUser(page, {
    username: 'vendeur4',
    fullName: 'Vendeur Quatre',
    role: 'Caissier',
    pin: '5678',
  });
  await expect(page.getByRole('row').filter({ hasText: 'vendeur4' })).toBeVisible({
    timeout: 15_000,
  });

  await page
    .getByRole('row')
    .filter({ hasText: 'vendeur4' })
    .getByRole('button', { name: 'Désactiver' })
    .click();
  await expect(page.getByRole('row').filter({ hasText: 'vendeur4' })).toContainText(
    'Désactivé',
    { timeout: 15_000 }
  );

  // Connexion refusée
  await logout(page);
  await loginWithPin(page, '5678');
  await expect(page.getByText(/Code PIN incorrect/)).toBeVisible({ timeout: 15_000 });

  // Réactivation → connexion possible
  await loginWithPin(page, '1234');
  await expect(page.getByRole('button', { name: 'Utilisateurs', exact: true })).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole('button', { name: 'Utilisateurs', exact: true }).click();
  await page
    .getByRole('row')
    .filter({ hasText: 'vendeur4' })
    .getByRole('button', { name: 'Réactiver' })
    .click();
  await expect(page.getByRole('row').filter({ hasText: 'vendeur4' })).toContainText('Actif', {
    timeout: 15_000,
  });

  await logout(page);
  await loginWithPin(page, '5678');
  await expect(page.getByText('Vendeur Quatre')).toBeVisible({ timeout: 15_000 });
});

test('impossible de désactiver son propre compte (bouton absent)', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: 'Utilisateurs', exact: true }).click();

  const selfRow = page.getByRole('row').filter({ hasText: '(vous)' });
  await expect(selfRow).toContainText('admin');
  await expect(selfRow.getByRole('button', { name: 'Désactiver' })).toHaveCount(0);
});

test('PIN de confirmation différent refusé', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: 'Utilisateurs', exact: true }).click();
  await page.getByRole('button', { name: '+ Nouvel utilisateur' }).click();
  await page.getByPlaceholder("Nom d'utilisateur *").fill('vendeur5');
  await page.getByPlaceholder('Nom complet *').fill('Vendeur Cinq');
  await page.getByPlaceholder('PIN (4-6 chiffres) *').fill('5678');
  await page.getByPlaceholder('Confirmer le PIN *').fill('8765');
  await page.getByRole('button', { name: "Créer l'utilisateur" }).click();
  await expect(page.getByText('Les deux PIN ne correspondent pas.')).toBeVisible();
});
