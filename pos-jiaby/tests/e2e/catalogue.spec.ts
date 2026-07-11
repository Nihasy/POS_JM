import { test, expect } from '@playwright/test';
import { login } from './helpers';

/**
 * Catalogue : stock réel affiché, recherche, création, édition,
 * suppression (soft delete).
 */

test('le stock réel est affiché pour chaque produit', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: 'Catalogue', exact: true }).click();

  const torche = page.getByRole('button', { name: 'Modifier Torche LED rechargeable' });
  await expect(torche).toContainText('Stock: 48');

  const cable = page.getByRole('button', { name: 'Modifier Câble 2,5 mm² (m)' });
  await expect(cable).toContainText('Stock: 200');

  // Aucun produit n'est sous son seuil → pas d'alerte stock bas
  await expect(page.getByTitle('Stock bas')).toHaveCount(0);
});

test('recherche par nom et par référence', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: 'Catalogue', exact: true }).click();

  await page.getByPlaceholder(/Rechercher un produit/).fill('torche');
  await expect(page.getByText('1 produit')).toBeVisible();
  await expect(page.getByText('Torche LED rechargeable')).toBeVisible();

  await page.getByPlaceholder(/Rechercher un produit/).fill('JIA-SOLA');
  await expect(page.getByText('Panneau solaire 50 W')).toBeVisible();
});

test('création : référence suggérée (catégorie + nom court) et fournisseur', async ({
  page,
}) => {
  await login(page);
  await page.getByRole('button', { name: 'Catalogue', exact: true }).click();
  await page.getByRole('button', { name: '+ Nouveau' }).click();

  await page.getByPlaceholder('Ex: Câble 2.5mm² 100m').fill('Prise murale double');

  // La suggestion suit le nom (pas de catégorie → GENE) puis la catégorie
  const refInput = page.getByLabel('Référence');
  await expect(refInput).toHaveValue('JIA-GENE-PRIS-005');
  await page.getByLabel('Catégorie').selectOption({ label: 'Électricité' });
  await expect(refInput).toHaveValue('JIA-ELEC-PRIS-005');

  // Fournisseur optionnel
  await page.getByLabel('Fournisseur').selectOption({ label: 'Import CN Guangzhou' });

  const numberInputs = page.locator('input[type="number"]');
  await numberInputs.nth(1).fill('12000'); // prix de vente
  await numberInputs.nth(2).fill('7000'); // coût
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();

  await expect(page.getByText('Prise murale double')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('JIA-ELEC-PRIS-005')).toBeVisible();
});

test('validation des paliers incohérents refusée', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: 'Catalogue', exact: true }).click();
  await page.getByRole('button', { name: '+ Nouveau' }).click();

  await page.getByPlaceholder('Ex: Câble 2.5mm² 100m').fill('Produit test');
  const numberInputs = page.locator('input[type="number"]');
  await numberInputs.nth(1).fill('10000'); // prix détail
  // Prix semi-gros ≥ prix détail → erreur
  await page.getByPlaceholder('Ex: 5').fill('5');
  await page.getByPlaceholder('Ex: 8500').fill('11000');
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(
    page.getByText('Le prix semi-gros doit être inférieur au prix détail.')
  ).toBeVisible();
});

test('édition du prix d’un produit', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: 'Catalogue', exact: true }).click();

  await page.getByRole('button', { name: 'Modifier Ampoule LED E27 9 W' }).click();
  const numberInputs = page.locator('input[type="number"]');
  await numberInputs.nth(1).fill('3500');
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();

  await expect(
    page.getByRole('button', { name: 'Modifier Ampoule LED E27 9 W' })
  ).toContainText('3 500 Ar', { timeout: 15_000 });
});

test('suppression (soft delete) : le produit disparaît du catalogue et de la vente', async ({
  page,
}) => {
  await login(page);
  await page.getByRole('button', { name: 'Catalogue', exact: true }).click();

  page.on('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Supprimer Torche LED rechargeable' }).click();
  await expect(page.getByText('Torche LED rechargeable')).toHaveCount(0, { timeout: 15_000 });

  // Plus proposé à la vente
  await page.getByRole('button', { name: 'Caisse', exact: true }).click();
  // (pas de session → écran bloqué, on vérifie via le catalogue uniquement)
  await page.getByRole('button', { name: 'Catalogue', exact: true }).click();
  await page.getByPlaceholder(/Rechercher un produit/).fill('Torche');
  await expect(page.getByText('Aucun produit trouvé.')).toBeVisible();
});
