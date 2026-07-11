import { test, expect } from '@playwright/test';
import { login } from './helpers';

/**
 * Import CSV du catalogue : modèle téléchargeable, aperçu avec erreurs,
 * import transactionnel (catégories/fournisseurs créés, stock initial),
 * puis tri/filtre fournisseur dans le Stock.
 */

const CSV = [
  'nom;nom_court;categorie;fournisseur;unite;prix_detail;cout;qte_semi_gros;prix_semi_gros;stock_initial',
  'Perceuse 500W;Perceuse;Outillage;Grossiste Tana;pièce;85000;60000;;;10',
  'Fil 1,5mm²;Fil 1,5;Câbles et cordons;Grossiste Tana;m;2500;1500;20;2200;300',
  'Ligne cassée;;;;pièce;pas_un_prix;;;;',
].join('\n');

test('import CSV : aperçu, erreurs ignorées, produits créés avec stock initial', async ({
  page,
}) => {
  await login(page);
  await page.getByRole('button', { name: 'Catalogue', exact: true }).click();
  await page.getByRole('button', { name: 'Import CSV' }).click();

  await page.getByLabel('Fichier CSV').setInputFiles({
    name: 'catalogue.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('﻿' + CSV, 'utf-8'),
  });

  // Aperçu : 2 valides, 1 ligne en erreur
  await expect(
    page.locator('div.rounded.bg-atelier').filter({ hasText: 'prêt(s) à importer' })
  ).toContainText('2');
  await expect(page.getByText(/1 ligne\(s\) en erreur/)).toBeVisible();
  await expect(page.getByText(/Ligne 4/)).toBeVisible();
  await expect(page.getByText('Perceuse 500W')).toBeVisible();

  await page.getByRole('button', { name: 'Importer 2 produit(s)' }).click();
  await expect(page.getByText(/2.*produit\(s\) importé\(s\)/)).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Fermer', exact: true }).click();

  // Produits visibles au catalogue avec référence et stock initial
  const perceuse = page.getByRole('button', { name: /Modifier Perceuse 500W/ });
  await expect(perceuse).toBeVisible({ timeout: 15_000 });
  await expect(perceuse).toContainText(/JIA-OUTI-PERC-\d{3}/);
  await expect(perceuse).toContainText('Stock: 10');

  const fil = page.getByRole('button', { name: /Modifier Fil 1,5mm²/ });
  await expect(fil).toContainText('Stock: 300');

  // Doublon : réimporter le même fichier → 0 créé, ignorés listés
  await page.getByRole('button', { name: 'Import CSV' }).click();
  await page.getByLabel('Fichier CSV').setInputFiles({
    name: 'catalogue.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(CSV, 'utf-8'),
  });
  await expect(page.getByText(/déjà présent — ignoré/).first()).toBeVisible();
  await page.getByRole('button', { name: 'Importer 2 produit(s)' }).click();
  await expect(page.getByText(/0.*produit\(s\) importé\(s\)/)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/Ignorés :/)).toBeVisible();
  await page.getByRole('button', { name: 'Fermer', exact: true }).click();

  // Le produit importé est vendable (stock initial en ledger)
  await page.getByRole('button', { name: 'Session', exact: true }).click();
  await page.locator('input[type="number"]').fill('50000');
  await page.getByRole('button', { name: 'Ouvrir', exact: true }).click();
  await page.getByRole('button', { name: 'Caisse', exact: true }).click();
  await page.getByPlaceholder(/Rechercher/).first().fill('Perceuse');
  await expect(page.getByText('Stock: 10')).toBeVisible();
});

test('filtre fournisseur et tri par référence dans l’inventaire', async ({ page }) => {
  await login(page);

  // Importer un produit rattaché à un nouveau fournisseur
  await page.getByRole('button', { name: 'Catalogue', exact: true }).click();
  await page.getByRole('button', { name: 'Import CSV' }).click();
  await page.getByLabel('Fichier CSV').setInputFiles({
    name: 'mini.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('nom;prix_detail;fournisseur;stock_initial\nMarteau;15000;Grossiste Tana;5\n', 'utf-8'),
  });
  await page.getByRole('button', { name: 'Importer 1 produit(s)' }).click();
  await expect(page.getByText(/1.*produit\(s\) importé\(s\)/)).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Fermer', exact: true }).click();

  // Inventaire : filtre par le fournisseur créé à l'import
  await page.getByRole('button', { name: 'Stock', exact: true }).click();
  await page.getByRole('button', { name: 'Inventaire & ajustements' }).click();
  await expect(page.getByRole('row').filter({ hasText: 'Torche LED' })).toBeVisible();

  await page.getByLabel('Filtrer par fournisseur').selectOption({ label: 'Grossiste Tana' });
  await expect(page.getByRole('row').filter({ hasText: 'Marteau' })).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: 'Torche LED' })).toHaveCount(0);

  // Retour à tous : la liste est triée par référence (JIA-CABL < JIA-ELEC < …)
  await page.getByLabel('Filtrer par fournisseur').selectOption({ label: 'Tous les fournisseurs' });
  const refs = await page.locator('tbody tr span.font-mono').allTextContents();
  const sorted = [...refs].sort((a, b) => a.localeCompare(b));
  expect(refs).toEqual(sorted);
});

test('modèle CSV téléchargeable', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: 'Catalogue', exact: true }).click();
  await page.getByRole('button', { name: 'Import CSV' }).click();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Télécharger le modèle' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('modele_catalogue.csv');
});
