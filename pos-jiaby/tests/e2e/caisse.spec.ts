import { test, expect } from '@playwright/test';
import { login, openSession, addToCart, payCash } from './helpers';

/**
 * Journée de caisse : ouverture → vente espèces avec rendu → dépense →
 * clôture avec écart zéro (S30, S32).
 */
test('journée de caisse : ouverture → vente → dépense → Z juste', async ({ page }) => {
  await login(page);
  await openSession(page, 50000);

  // Vente : 1 ampoule à 3 000 Ar, payée 5 000 Ar → espèces nettes +3 000
  await addToCart(page, 'Ampoule', 'Ampoule 9W');
  await payCash(page, 5000);
  await expect(page.getByText(/enregistrée/)).toBeVisible({ timeout: 15_000 });

  // Dépense : 1 000 Ar de transport
  await page.getByRole('button', { name: 'Session', exact: true }).click();
  await page.getByPlaceholder('Montant').fill('1000');
  await page.getByPlaceholder('Motif').fill('Taxi fournisseur');
  await page.getByRole('button', { name: '+ Ajouter', exact: true }).click();
  await expect(page.getByText('Taxi fournisseur')).toBeVisible();

  // Attendu = 50 000 + 3 000 − 1 000 = 52 000 Ar
  await expect(page.getByText('52 000 Ar').first()).toBeVisible();

  // Clôture avec le compte exact → caisse juste
  await page.locator('input[type="number"]').last().fill('52000');
  await page.getByRole('button', { name: 'Clôturer' }).click();
  await expect(page.getByText(/écart \+?0 Ar/)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Aucune session ouverte')).toBeVisible();
});
