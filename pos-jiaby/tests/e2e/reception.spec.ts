import { test, expect } from '@playwright/test';
import { login, addReceiveLine } from './helpers';

/**
 * Parcours réception : saisie d'une ligne → validation → PMP recalculé,
 * stock à jour, proposition d'étiquettes (S01–S04, S02).
 */
test('réception : ligne → validation → stock à jour → étiquettes proposées', async ({ page }) => {
  await login(page);

  await page.getByRole('button', { name: 'Stock', exact: true }).click();
  await expect(page.getByText('Réception de marchandises')).toBeVisible();

  // Ajouter le panneau solaire par recherche (stock démo : 8)
  await addReceiveLine(page, 'panneau', /Panneau solaire 50 W/);

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

test('réception : recherche par mot-clé, référence et scan douchette', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: 'Stock', exact: true }).click();

  const search = page.getByLabel('Rechercher un produit à réceptionner');

  // Mot-clé partiel → résultats avec référence et stock
  await search.fill('amp');
  const resultat = page.getByRole('button', { name: /Ampoule LED E27 9 W/ });
  await expect(resultat).toBeVisible();
  await expect(resultat).toContainText('JIA-ELEC-0004');
  await expect(resultat).toContainText('Stock: 150');

  // Recherche par référence partielle
  await search.fill('JIA-CABL');
  await expect(page.getByRole('button', { name: /Câble 2,5 mm²/ })).toBeVisible();

  // Scan douchette : référence exacte + Entrée → ligne ajoutée, champ vidé
  await search.fill('JIA-TORC-0002');
  await search.press('Enter');
  await expect(
    page.getByRole('row').filter({ hasText: 'Torche LED rechargeable' })
  ).toBeVisible();
  await expect(search).toHaveValue('');

  // Un produit déjà dans la réception ne réapparaît pas dans la recherche
  await search.fill('torche');
  await expect(page.getByText('Aucun produit trouvé (ou déjà dans la réception).')).toBeVisible();

  // Résultat inconnu → message clair
  await search.fill('xyz-inexistant');
  await expect(page.getByText('Aucun produit trouvé (ou déjà dans la réception).')).toBeVisible();
});
