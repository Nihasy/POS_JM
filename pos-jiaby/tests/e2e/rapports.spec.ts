import { test, expect } from '@playwright/test';
import { login, openSession, addToCart, payCash, closeTicket } from './helpers';

/**
 * Rapports (S30–S33) : ventes détaillées, synthèse CA, valorisation,
 * stock bas, vélocité. Session : totaux MVola visibles à la clôture.
 */

test('ventes détaillées et synthèse CA après une vente (S30)', async ({ page }) => {
  await login(page);
  await openSession(page, 50000);

  await addToCart(page, 'Ampoule', 'Ampoule 9W');
  await payCash(page, 3000);
  await expect(page.getByText(/V-\d{4}-00001 enregistrée/)).toBeVisible({ timeout: 15_000 });

  await page.getByRole('button', { name: 'Rapports', exact: true }).click();

  // Ventes détaillées (défaut)
  await expect(page.getByText(/CA total/)).toBeVisible();
  await expect(page.getByText('3 000 Ar').first()).toBeVisible();
  await expect(page.getByRole('cell', { name: /V-\d{4}-00001/ })).toBeVisible();

  // Synthèse CA
  await page.getByRole('button', { name: 'Synthèse CA' }).click();
  await expect(page.getByText(/Chiffre d'affaires/)).toBeVisible();
  await expect(page.getByText('3 000 Ar').first()).toBeVisible();
});

test('valorisation du stock = Σ qté × PMP (S32)', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: 'Rapports', exact: true }).click();
  await page.getByRole('button', { name: 'Valorisation' }).click();

  // 200×2500 + 48×8000 + 8×90000 + 150×1500 = 1 829 000 Ar
  await expect(page.getByText('Valeur du stock (Σ qté × PMP)')).toBeVisible();
  await expect(page.getByText('1 829 000 Ar')).toBeVisible();
});

test('stock bas : produit sous le seuil listé avec déficit (S33)', async ({ page }) => {
  await login(page);

  // Faire passer le panneau (stock 8, seuil 3) sous son seuil : sortie de 6
  await page.getByRole('button', { name: 'Stock', exact: true }).click();
  await page.getByRole('button', { name: 'Inventaire & ajustements' }).click();
  await page.getByRole('button', { name: 'Sortie manuelle' }).click();
  await page
    .locator('select')
    .nth(1)
    .selectOption('d0000001-0001-4000-8000-000000000003');
  await page.locator('select').nth(2).selectOption('casse');
  await page.getByPlaceholder('Quantité').fill('6');
  await page.getByPlaceholder('Motif détaillé (obligatoire)').fill('Casse test');
  await page.getByRole('button', { name: 'Enregistrer la sortie' }).click();
  await expect(page.getByText('Sortie manuelle enregistrée.')).toBeVisible({ timeout: 15_000 });

  await page.getByRole('button', { name: 'Rapports', exact: true }).click();
  await page.getByRole('button', { name: 'Stock bas' }).click();
  const row = page.getByRole('row').filter({ hasText: 'Panneau solaire 50 W' });
  await expect(row).toBeVisible();
  await expect(row).toContainText('2'); // stock restant
  await expect(row).toContainText('3'); // seuil
});

test('vélocité : ventes/jour et jours de stock (S34)', async ({ page }) => {
  await login(page);
  await openSession(page, 50000);

  await addToCart(page, 'Ampoule', 'Ampoule 9W');
  await payCash(page, 3000);
  await expect(page.getByText(/enregistrée/)).toBeVisible({ timeout: 15_000 });

  await page.getByRole('button', { name: 'Rapports', exact: true }).click();
  await page.getByRole('button', { name: 'Vélocité' }).click();
  const row = page.getByRole('row').filter({ hasText: 'Ampoule LED E27 9 W' });
  await expect(row).toBeVisible();
  await expect(row).toContainText('149'); // stock restant après la vente
});

test('filtre par dates précises : la vente du jour entre et sort de la période', async ({
  page,
}) => {
  await login(page);
  await openSession(page, 50000);
  await addToCart(page, 'Ampoule', 'Ampoule 9W');
  await payCash(page, 3000);
  await expect(page.getByText(/enregistrée/)).toBeVisible({ timeout: 15_000 });

  await page.getByRole('button', { name: 'Rapports', exact: true }).click();

  // Dates précises — par défaut aujourd'hui → la vente est comptée
  await page.getByLabel('Période').selectOption('custom');
  const today = new Date().toISOString().slice(0, 10);
  await expect(page.getByLabel('Date de début')).toHaveValue(today);
  await expect(page.getByText('1 vente', { exact: true })).toBeVisible();
  await expect(page.getByText('3 000 Ar').first()).toBeVisible();

  // Une plage passée sans vente → 0 vente
  await page.getByLabel('Date de début').fill('2020-01-01');
  await page.getByLabel('Date de fin').fill('2020-01-31');
  await expect(page.getByText('0 vente', { exact: true })).toBeVisible();

  // Retour à une présélection → la vente réapparaît
  await page.getByLabel('Période').selectOption('7');
  await expect(page.getByText('1 vente', { exact: true })).toBeVisible();
});

test('export CSV : fichier téléchargé avec confirmation', async ({ page }) => {
  await login(page);
  await openSession(page, 50000);
  await addToCart(page, 'Ampoule', 'Ampoule 9W');
  await payCash(page, 3000);
  await expect(page.getByText(/enregistrée/)).toBeVisible({ timeout: 15_000 });

  await page.getByRole('button', { name: 'Rapports', exact: true }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^rapport_ventes_detail_\d{4}-\d{2}-\d{2}\.csv$/);
  await expect(page.getByText(/Export téléchargé/)).toBeVisible();
});

test('session : les totaux MVola et crédit apparaissent à la clôture', async ({ page }) => {
  await login(page);
  await openSession(page, 50000);

  // Vente MVola 3 000 Ar
  await addToCart(page, 'Ampoule', 'Ampoule 9W');
  await page.getByRole('button', { name: 'F10 Encaisser' }).click();
  await page.getByRole('button', { name: 'MVola' }).click();
  await page.getByPlaceholder('Référence MVola (obligatoire)').fill('MV-777');
  for (const digit of '3000') {
    await page.getByRole('button', { name: digit, exact: true }).click();
  }
  await page.getByRole('button', { name: '↵' }).click();
  await page.getByRole('button', { name: 'Encaisser', exact: true }).click();
  await expect(page.getByText(/enregistrée/)).toBeVisible({ timeout: 15_000 });
  await closeTicket(page);

  // Écran session : MVola 3 000 Ar, attendu espèces = fond (50 000)
  await page.getByRole('button', { name: 'Session', exact: true }).click();
  await expect(
    page.locator('div.rounded.bg-atelier').filter({ hasText: 'MVola' })
  ).toContainText('3 000 Ar');
  await expect(
    page.locator('div.bg-blue-50').filter({ hasText: 'Attendu' })
  ).toContainText('50 000 Ar');

  // Clôture juste
  await page.locator('input[type="number"]').last().fill('50000');
  await page.getByRole('button', { name: 'Clôturer' }).click();
  await expect(page.getByText(/écart \+?0 Ar/)).toBeVisible({ timeout: 15_000 });
});
