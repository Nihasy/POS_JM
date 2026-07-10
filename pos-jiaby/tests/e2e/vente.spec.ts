import { test, expect } from '@playwright/test';
import { login, openSession, addToCart, payCash } from './helpers';

/**
 * Parcours vente complet : login → ouverture de session → recherche →
 * panier → paiement espèces avec rendu → vente numérotée V-.
 */
test('vente complète : scan → panier → paiement espèces → rendu', async ({ page }) => {
  await login(page);

  // Les ventes sont bloquées hors session ouverte
  await page.getByRole('button', { name: 'Caisse', exact: true }).click();
  await expect(page.getByText('Aucune session de caisse ouverte')).toBeVisible();

  await openSession(page, 50000);

  // Torche LED : 15 000 Ar au détail
  await addToCart(page, 'Torche', 'Torche LED');
  await expect(page.getByText('15 000 Ar').first()).toBeVisible();

  // Paiement 20 000 Ar en espèces → rendu 5 000 Ar affiché dans la modale
  await page.getByRole('button', { name: 'F10 Encaisser' }).click();
  for (const digit of '20000') {
    await page.getByRole('button', { name: digit, exact: true }).click();
  }
  await page.getByRole('button', { name: '↵' }).click();
  await expect(page.getByText(/Rendu/).first()).toBeVisible();
  await page.getByRole('button', { name: 'Encaisser', exact: true }).click();

  // Vente enregistrée avec numéro V-
  await expect(page.getByText(/Vente V-\d{4}-00001 enregistrée/)).toBeVisible({
    timeout: 15_000,
  });
});

test('palier semi-gros appliqué automatiquement (S09)', async ({ page }) => {
  await login(page);
  await openSession(page, 50000);

  // 6 torches → prix semi-gros 13 000 Ar : total 78 000 Ar
  for (let i = 0; i < 6; i++) {
    await addToCart(page, 'Torche', 'Torche LED');
  }
  await expect(page.getByText('78 000 Ar').first()).toBeVisible();

  await payCash(page, 78000);
  await expect(page.getByText(/enregistrée/)).toBeVisible({ timeout: 15_000 });
});
