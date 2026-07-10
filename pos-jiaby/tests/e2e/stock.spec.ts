import { test, expect } from '@playwright/test';
import { login } from './helpers';

/**
 * Stock : inventaire avec écarts (S29), sortie manuelle motivée,
 * réception multi-pack avec PMP (complément de reception.spec.ts).
 */

const TORCHE_ID = 'd0000001-0001-4000-8000-000000000002';

test('inventaire : écart compté → contre-écriture, stock corrigé (S29)', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: 'Stock', exact: true }).click();
  await page.getByRole('button', { name: 'Inventaire & ajustements' }).click();

  // Torche : théorique 48, compté 46 → écart −2
  const row = page.getByRole('row').filter({ hasText: 'Torche LED rechargeable' });
  await row.locator('input[type="number"]').fill('46');
  await expect(row).toContainText('-2');
  await expect(page.getByText('1 produit(s) compté(s) — 1 écart(s)')).toBeVisible();

  await page.getByRole('button', { name: "Valider l'inventaire (Admin)" }).click();
  await expect(page.getByText(/Inventaire validé — 1 écart/)).toBeVisible({ timeout: 15_000 });

  // Stock théorique corrigé à 46
  await expect(
    page.getByRole('row').filter({ hasText: 'Torche LED rechargeable' })
  ).toContainText('46');
});

test('inventaire sans écart → aucune écriture', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: 'Stock', exact: true }).click();
  await page.getByRole('button', { name: 'Inventaire & ajustements' }).click();

  const row = page.getByRole('row').filter({ hasText: 'Torche LED rechargeable' });
  await row.locator('input[type="number"]').fill('48');
  await expect(page.getByText('1 produit(s) compté(s) — 0 écart(s)')).toBeVisible();

  await page.getByRole('button', { name: "Valider l'inventaire (Admin)" }).click();
  await expect(page.getByText(/Inventaire validé — 0 écart/)).toBeVisible({
    timeout: 15_000,
  });
});

test('sortie manuelle motivée → stock décrémenté', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: 'Stock', exact: true }).click();
  await page.getByRole('button', { name: 'Inventaire & ajustements' }).click();

  await page.getByRole('button', { name: 'Sortie manuelle' }).click();
  // Selects de la page : [0] filtre catégorie, [1] produit (modale), [2] raison (modale)
  await page.locator('select').nth(1).selectOption(TORCHE_ID);
  await page.locator('select').nth(2).selectOption('casse');
  await page.getByPlaceholder('Quantité').fill('2');
  await page.getByPlaceholder('Motif détaillé (obligatoire)').fill('Cassées pendant transport');
  await page.getByRole('button', { name: 'Enregistrer la sortie' }).click();
  await expect(page.getByText('Sortie manuelle enregistrée.')).toBeVisible({ timeout: 15_000 });

  // Stock 48 − 2 = 46 dans le tableau
  await expect(
    page.getByRole('row').filter({ hasText: 'Torche LED rechargeable' })
  ).toContainText('46');
});

test('réception multi-pack : 2 cartons de 24 + 2 unités → stock +50, PMP recalculé (S02–S03)', async ({
  page,
}) => {
  await login(page);
  await page.getByRole('button', { name: 'Stock', exact: true }).click();

  await page.locator('select').first().selectOption({ label: 'Import CN Guangzhou' });
  await page.getByPlaceholder('IMPORT-CN-01…').fill('LOT-TEST-01');
  await page.locator('select').nth(1).selectOption({ label: 'Torche LED rechargeable' });
  await page.getByRole('button', { name: '+ Ajouter' }).click();

  const row = page.getByRole('row').filter({ hasText: 'Torche LED rechargeable' });
  const inputs = row.locator('input[type="number"]');
  await inputs.nth(0).fill('2'); // cartons
  await inputs.nth(1).fill('2'); // unités
  await inputs.nth(2).fill('9000'); // coût unitaire

  // Total unités = 2×24 + 2 = 50 ; PMP = (48×8000 + 50×9000)/98 = 8510
  await expect(row).toContainText('50');
  await expect(row).toContainText('8 510 Ar');

  await page.getByRole('button', { name: 'Valider la réception' }).click();
  await expect(page.getByText(/Réception enregistrée \(LOT-TEST-01\)/)).toBeVisible({
    timeout: 15_000,
  });
  // Étiquettes proposées (S02)
  await expect(page.getByText('Imprimer les étiquettes ?')).toBeVisible();
  await page.getByRole('button', { name: 'Plus tard' }).click();

  // Stock 48 + 50 = 98 visible au catalogue
  await page.getByRole('button', { name: 'Catalogue', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Modifier Torche LED rechargeable' })
  ).toContainText('Stock: 98');
});
