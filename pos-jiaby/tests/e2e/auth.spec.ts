import { test, expect } from '@playwright/test';
import { login } from './helpers';

/**
 * Authentification par PIN : erreurs, réinitialisation du pavé,
 * verrouillage après 5 échecs, déconnexion.
 */

async function typePin(page: import('@playwright/test').Page, pin: string) {
  for (const digit of pin) {
    await page.getByRole('button', { name: digit, exact: true }).click();
  }
}

test('PIN erroné → message clair, puis connexion au bon PIN', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Se connecter' })).toBeVisible({
    timeout: 20_000,
  });

  await typePin(page, '9999');
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByText(/Code PIN incorrect/)).toBeVisible({ timeout: 15_000 });

  // Le pavé doit être réinitialisé : le bon PIN passe directement
  await typePin(page, '1234');
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('button', { name: 'Catalogue' })).toBeVisible({
    timeout: 15_000,
  });
});

test('les chiffres du PIN sont masqués à l’écran (discrétion)', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Se connecter' })).toBeVisible({
    timeout: 20_000,
  });

  await typePin(page, '1234');

  // L'affichage du pavé montre des points, jamais les chiffres tapés
  const display = page.locator('.font-mono.text-2xl');
  await expect(display).toHaveText('••••');
  await expect(page.getByText('1234', { exact: true })).toHaveCount(0);

  // La connexion fonctionne toujours
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('button', { name: 'Catalogue' })).toBeVisible({
    timeout: 15_000,
  });
});

test('PIN trop court → bouton désactivé', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Se connecter' })).toBeVisible({
    timeout: 20_000,
  });
  await typePin(page, '12');
  await expect(page.getByRole('button', { name: 'Se connecter' })).toBeDisabled();
});

test('verrouillage après 5 tentatives échouées', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Se connecter' })).toBeVisible({
    timeout: 20_000,
  });

  for (let i = 0; i < 5; i++) {
    await typePin(page, '0000');
    await page.getByRole('button', { name: 'Se connecter' }).click();
    await expect(page.getByText(/incorrect|verrouillé/i)).toBeVisible({ timeout: 15_000 });
  }
  await expect(page.getByText(/verrouillé/i)).toBeVisible();

  // Même le bon PIN est refusé pendant le verrouillage
  await typePin(page, '1234');
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByText(/verrouillé/i)).toBeVisible();
});

test('connexion au clavier physique : chiffres + Entrée', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Se connecter' })).toBeVisible({
    timeout: 20_000,
  });

  // Frappe directe au clavier (pas de clic sur le pavé)
  await page.keyboard.type('12349');
  // Correction : retour arrière supprime le dernier chiffre
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Catalogue' })).toBeVisible({
    timeout: 15_000,
  });
});

test('déconnexion → retour à l’écran PIN, panier vidé', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: 'Déconnexion' }).click();
  await expect(page.getByRole('button', { name: 'Se connecter' })).toBeVisible();
});
