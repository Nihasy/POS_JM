import { test, expect } from '@playwright/test';
import { login } from './helpers';

/**
 * Parcours réception : saisie d'une ligne → validation → PMP recalculé,
 * stock à jour, proposition d'étiquettes (S01–S04, S02).
 */
test('réception : ligne → validation → stock à jour → étiquettes proposées', async ({ page }) => {
  await login(page);

  await page.getByRole('button', { name: 'Stock', exact: true }).click();
  await expect(page.getByText('Réception de marchandises')).toBeVisible();

  // Ajouter le panneau solaire (stock démo : 8)
  await page.locator('select').last().selectOption({ label: 'Panneau solaire 50 W' });
  await page.getByRole('button', { name: '+ Ajouter', exact: true }).click();

  // Pas de conditionnement défini → la colonne Cartons affiche « — »
  const row = page.locator('tbody tr').first();
  await expect(row.getByText('—')).toBeVisible();

  // 2 unités au coût pré-rempli (90 000 Ar)
  await page.getByLabel('Unités Panneau solaire 50 W').fill('2');

  await page.getByRole('button', { name: 'Valider la réception' }).click();

  // Proposition d'impression d'étiquettes (S02)
  await expect(page.getByText('Imprimer les étiquettes ?')).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Plus tard' }).click();

  // Stock passé de 8 à 10 (Σ ledger), visible dans l'inventaire
  await page.getByRole('button', { name: 'Inventaire & ajustements' }).click();
  const inventoryRow = page.locator('tr', { hasText: 'Panneau solaire 50 W' });
  await expect(inventoryRow.locator('td').nth(1)).toHaveText('10');
});
