import { test, expect } from '@playwright/test';
import { login, openSession, payCash } from './helpers';

/**
 * Hard tests des nouveautés catalogue : import massif en une
 * transaction, chaîne import → vente au palier CSV → inventaire,
 * référence manuelle (doublon refusé, personnalisée scannable).
 */

test('import massif : 150 produits en une seule transaction', async ({ page }) => {
  test.setTimeout(120_000);
  await login(page);

  const lines = ['nom;categorie;fournisseur;prix_detail;cout;stock_initial'];
  for (let i = 1; i <= 150; i++) {
    lines.push(`Produit Masse ${String(i).padStart(3, '0')};Outillage;Grossiste Tana;${1000 + i};${500 + i};${i}`);
  }

  await page.getByRole('button', { name: 'Catalogue', exact: true }).click();
  await page.getByRole('button', { name: 'Import CSV' }).click();
  await page.getByLabel('Fichier CSV').setInputFiles({
    name: 'masse.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(lines.join('\n'), 'utf-8'),
  });
  await expect(
    page.locator('div.rounded.bg-atelier').filter({ hasText: 'prêt(s) à importer' })
  ).toContainText('150');

  await page.getByRole('button', { name: 'Importer 150 produit(s)' }).click();
  await expect(page.getByText(/150.*produit\(s\) importé\(s\)/)).toBeVisible({
    timeout: 60_000,
  });
  await page.getByRole('button', { name: 'Fermer', exact: true }).click();

  // 4 produits démo + 150 importés
  await expect(page.getByText('154 produits')).toBeVisible({ timeout: 15_000 });

  // Contrôles ponctuels : premier et dernier, stock initial exact
  await page.getByPlaceholder(/Rechercher un produit/).fill('Produit Masse 001');
  await expect(
    page.getByRole('button', { name: /Modifier Produit Masse 001/ })
  ).toContainText('Stock: 1');
  await page.getByPlaceholder(/Rechercher un produit/).fill('Produit Masse 150');
  await expect(
    page.getByRole('button', { name: /Modifier Produit Masse 150/ })
  ).toContainText('Stock: 150');
});

test('chaîne : import CSV → vente au palier du CSV (au mètre) → inventaire 0 écart', async ({
  page,
}) => {
  await login(page);
  await openSession(page, 50000);

  // Fil vendu au mètre, palier semi-gros à 20 m
  await page.getByRole('button', { name: 'Catalogue', exact: true }).click();
  await page.getByRole('button', { name: 'Import CSV' }).click();
  await page.getByLabel('Fichier CSV').setInputFiles({
    name: 'fil.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      'nom;unite;prix_detail;cout;qte_semi_gros;prix_semi_gros;stock_initial\n' +
        'Fil souple 1,5mm²;m;2500;1500;20;2200;300,5\n',
      'utf-8'
    ),
  });
  await page.getByRole('button', { name: 'Importer 1 produit(s)' }).click();
  await expect(page.getByText(/1.*produit\(s\) importé\(s\)/)).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Fermer', exact: true }).click();

  // Vente de 25 m → palier semi-gros du CSV : 25 × 2 200 = 55 000
  await page.getByRole('button', { name: 'Caisse', exact: true }).click();
  await page.getByPlaceholder(/Rechercher/).first().fill('Fil souple');
  await page.getByRole('button', { name: /Fil souple/ }).first().click();
  await page.getByLabel('Quantité Fil souple 1,5mm²').fill('25');
  await expect(page.getByText('55 000 Ar').first()).toBeVisible();
  await payCash(page, 55000);
  await expect(page.getByText(/enregistrée/)).toBeVisible({ timeout: 15_000 });

  // Inventaire : théorique = 300,5 − 25 = 275,5 → compté identique = 0 écart
  await page.getByRole('button', { name: 'Stock', exact: true }).click();
  await page.getByRole('button', { name: 'Inventaire & ajustements' }).click();
  const row = page.getByRole('row').filter({ hasText: 'Fil souple' });
  await expect(row).toContainText('275,5');
  await row.locator('input[type="number"]').fill('275.5');
  await expect(page.getByText('1 produit(s) compté(s) — 0 écart(s)')).toBeVisible();
});

test('référence manuelle : personnalisée scannable, doublon refusé sans bloquer', async ({
  page,
}) => {
  await login(page);
  await openSession(page, 50000);

  // Produit avec référence personnalisée
  await page.getByRole('button', { name: 'Catalogue', exact: true }).click();
  await page.getByRole('button', { name: '+ Nouveau' }).click();
  await page.getByPlaceholder('Ex: Câble 2.5mm² 100m').fill('Batterie 12V');
  await page.getByLabel('Référence').fill('BAT-12V');
  const nums = page.locator('input[type="number"]');
  await nums.nth(1).fill('95000');
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.getByText('BAT-12V')).toBeVisible({ timeout: 15_000 });

  // La référence personnalisée est scannable en caisse (douchette)
  await page.getByRole('button', { name: 'Caisse', exact: true }).click();
  const search = page.getByPlaceholder(/Rechercher/).first();
  await search.click();
  await page.keyboard.type('bat-12v');
  await page.keyboard.press('Enter');
  await expect(page.getByText('95 000 Ar').first()).toBeVisible();
  await expect(search).toHaveValue('');

  // Doublon : refus avec message, le formulaire reste utilisable
  await page.getByRole('button', { name: 'Catalogue', exact: true }).click();
  await page.getByRole('button', { name: '+ Nouveau' }).click();
  await page.getByPlaceholder('Ex: Câble 2.5mm² 100m').fill('Autre batterie');
  await page.getByLabel('Référence').fill('BAT-12V');
  await page.locator('input[type="number"]').nth(1).fill('50000');
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.getByText(/« BAT-12V » est déjà utilisée/)).toBeVisible({
    timeout: 15_000,
  });

  // Correction dans la même modale → enregistrement passe
  await page.getByLabel('Référence').fill('BAT-12V-B');
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.getByText('Autre batterie')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('BAT-12V-B')).toBeVisible();
});
