import { test, expect, type Page } from '@playwright/test';
import { login, openSession, addToCart, payCash } from './helpers';

/**
 * Caisse avancée : remises, quantités décimales, paliers par quantité,
 * paiements multiples, MVola, crédit, refus (trop-perçu, plafond, stock).
 */

async function typeAmount(page: Page, amount: number) {
  for (const digit of String(amount)) {
    await page.getByRole('button', { name: digit, exact: true }).click();
  }
  await page.getByRole('button', { name: '↵' }).click();
}

test('remise globale en % (S14) : 2 ampoules −10% → 5 400 Ar', async ({ page }) => {
  await login(page);
  await openSession(page, 50000);

  await addToCart(page, 'Ampoule', 'Ampoule 9W');
  await addToCart(page, 'Ampoule', 'Ampoule 9W');
  await expect(page.getByText('6 000 Ar').first()).toBeVisible();

  await page.keyboard.press('F4');
  await page.getByPlaceholder('ex : 5').fill('10');
  await page.getByRole('button', { name: 'Appliquer la remise' }).click();
  await expect(page.getByText('5 400 Ar').first()).toBeVisible();

  await payCash(page, 5400);
  await expect(page.getByText(/enregistrée/)).toBeVisible({ timeout: 15_000 });
});

test('remise globale en montant : −500 Ar → 5 500 Ar', async ({ page }) => {
  await login(page);
  await openSession(page, 50000);

  await addToCart(page, 'Ampoule', 'Ampoule 9W');
  await addToCart(page, 'Ampoule', 'Ampoule 9W');

  await page.keyboard.press('F4');
  await page.getByRole('button', { name: 'Montant (Ar)' }).click();
  await page.getByPlaceholder('ex : 2000').fill('500');
  await page.getByRole('button', { name: 'Appliquer la remise' }).click();
  await expect(page.getByText('5 500 Ar').first()).toBeVisible();

  await payCash(page, 5500);
  await expect(page.getByText(/enregistrée/)).toBeVisible({ timeout: 15_000 });
});

test('vente au mètre : 2,5 m de câble → 10 000 Ar', async ({ page }) => {
  await login(page);
  await openSession(page, 50000);

  await addToCart(page, 'Câble', 'Câble 2,5mm²');
  await page.getByLabel('Quantité Câble 2,5mm²').fill('2.5');
  await expect(page.getByText('10 000 Ar').first()).toBeVisible();

  await payCash(page, 10000);
  await expect(page.getByText(/enregistrée/)).toBeVisible({ timeout: 15_000 });
});

test('palier gros par saisie de quantité (S10) : 100 m → 300 000 Ar', async ({ page }) => {
  await login(page);
  await openSession(page, 50000);

  await addToCart(page, 'Câble', 'Câble 2,5mm²');
  await page.getByLabel('Quantité Câble 2,5mm²').fill('100');
  await expect(page.getByText('300 000 Ar').first()).toBeVisible();

  await payCash(page, 300000);
  await expect(page.getByText(/enregistrée/)).toBeVisible({ timeout: 15_000 });
});

test('paiement mixte espèces + MVola (S15)', async ({ page }) => {
  await login(page);
  await openSession(page, 50000);

  // Torche : 15 000 Ar
  await addToCart(page, 'Torche', 'Torche LED');
  await page.getByRole('button', { name: 'F10 Encaisser' }).click();

  // MVola 5 000 Ar avec référence
  await page.getByRole('button', { name: 'MVola' }).click();
  await page.getByPlaceholder('Référence MVola (obligatoire)').fill('MV-12345');
  await typeAmount(page, 5000);
  await expect(page.getByText('Reste à payer')).toBeVisible();

  // Espèces 10 000 Ar → complet
  await page.getByRole('button', { name: 'Espèces' }).click();
  await typeAmount(page, 10000);
  await page.getByRole('button', { name: 'Encaisser', exact: true }).click();
  await expect(page.getByText(/enregistrée/)).toBeVisible({ timeout: 15_000 });
});

test('MVola sans référence refusé', async ({ page }) => {
  await login(page);
  await openSession(page, 50000);

  await addToCart(page, 'Ampoule', 'Ampoule 9W');
  await page.getByRole('button', { name: 'F10 Encaisser' }).click();
  await page.getByRole('button', { name: 'MVola' }).click();
  await typeAmount(page, 3000);
  await expect(page.getByText('Référence MVola obligatoire.')).toBeVisible();
});

test('trop-perçu non-espèces refusé (S16)', async ({ page }) => {
  await login(page);
  await openSession(page, 50000);

  await addToCart(page, 'Ampoule', 'Ampoule 9W');
  await page.getByRole('button', { name: 'F10 Encaisser' }).click();
  await page.getByRole('button', { name: 'MVola' }).click();
  await page.getByPlaceholder('Référence MVola (obligatoire)').fill('MV-999');
  await typeAmount(page, 5000);
  await expect(page.getByText(/Trop-perçu refusé/)).toBeVisible();
});

test('crédit sans client refusé (S17)', async ({ page }) => {
  await login(page);
  await openSession(page, 50000);

  await addToCart(page, 'Ampoule', 'Ampoule 9W');
  await page.getByRole('button', { name: 'F10 Encaisser' }).click();
  await page.getByRole('button', { name: 'Crédit' }).click();
  await typeAmount(page, 3000);
  await expect(page.getByText('Client obligatoire pour le paiement à crédit.')).toBeVisible();
});

test('vente à crédit avec client → solde dû mis à jour (S18)', async ({ page }) => {
  await login(page);
  await openSession(page, 50000);

  await addToCart(page, 'Ampoule', 'Ampoule 9W');

  // Associer le client (F6)
  await page.keyboard.press('F6');
  await page.getByRole('button', { name: /RAKOTO Jean/ }).click();
  await expect(page.getByText('Client : RAKOTO Jean')).toBeVisible();

  await page.getByRole('button', { name: 'F10 Encaisser' }).click();
  await page.getByRole('button', { name: 'Crédit' }).click();
  await typeAmount(page, 3000);
  await page.getByRole('button', { name: 'Encaisser', exact: true }).click();
  await expect(page.getByText(/enregistrée/)).toBeVisible({ timeout: 15_000 });

  // Solde visible sur l'écran Clients
  await page.getByRole('button', { name: 'Clients', exact: true }).click();
  const row = page.getByRole('row').filter({ hasText: 'RAKOTO Jean' });
  await expect(row).toContainText('3 000 Ar');
  await expect(row.getByRole('button', { name: 'Règlement' })).toBeVisible();
});

test('plafond crédit dépassé → vente bloquée (S20)', async ({ page }) => {
  await login(page);
  await openSession(page, 50000);

  // Panneau 150 000 Ar > plafond RAKOTO 100 000 Ar
  await addToCart(page, 'Panneau', 'Panneau 50W');
  await page.keyboard.press('F6');
  await page.getByRole('button', { name: /RAKOTO Jean/ }).click();

  await page.getByRole('button', { name: 'F10 Encaisser' }).click();
  await page.getByRole('button', { name: 'Crédit' }).click();
  await typeAmount(page, 150000);
  await page.getByRole('button', { name: 'Encaisser', exact: true }).click();
  await expect(page.getByText(/Plafond crédit dépassé/)).toBeVisible({ timeout: 15_000 });
});

test('stock insuffisant → vente bloquée (S28)', async ({ page }) => {
  await login(page);
  await openSession(page, 50000);

  // Panneau : stock 8, on en demande 9
  await addToCart(page, 'Panneau', 'Panneau 50W');
  await page.getByLabel('Quantité Panneau 50W').fill('9');
  await page.getByRole('button', { name: 'F10 Encaisser' }).click();
  await typeAmount(page, 1350000);
  await page.getByRole('button', { name: 'Encaisser', exact: true }).click();
  await expect(page.getByText(/Stock insuffisant/)).toBeVisible({ timeout: 15_000 });
});

test('deux ventes consécutives : la modale de paiement repart à zéro', async ({ page }) => {
  await login(page);
  await openSession(page, 50000);

  // Vente 1 : payée 5 000 sur 3 000 → rendu
  await addToCart(page, 'Ampoule', 'Ampoule 9W');
  await payCash(page, 5000);
  await expect(page.getByText(/V-\d{4}-00001 enregistrée/)).toBeVisible({ timeout: 15_000 });

  // Vente 2 : la modale ne doit contenir AUCUN paiement résiduel
  await addToCart(page, 'Ampoule', 'Ampoule 9W');
  await page.getByRole('button', { name: 'F10 Encaisser' }).click();
  await expect(page.getByText('Total à payer')).toBeVisible();
  await expect(page.getByText('Payé', { exact: true })).toHaveCount(0);
  await expect(page.getByText(/Rendu/)).toHaveCount(0);

  await typeAmount(page, 3000);
  await page.getByRole('button', { name: 'Encaisser', exact: true }).click();
  await expect(page.getByText(/V-\d{4}-00002 enregistrée/)).toBeVisible({ timeout: 15_000 });
});

test('paiement saisi au clavier physique : montant + Entrée', async ({ page }) => {
  await login(page);
  await openSession(page, 50000);

  await addToCart(page, 'Ampoule', 'Ampoule 9W');
  await page.getByRole('button', { name: 'F10 Encaisser' }).click();

  // Frappe directe au clavier : 5000 puis Entrée → rendu 2 000 Ar
  await page.keyboard.type('5000');
  await page.keyboard.press('Enter');
  await expect(page.getByText(/Rendu/).first()).toBeVisible();
  await page.getByRole('button', { name: 'Encaisser', exact: true }).click();
  await expect(page.getByText(/enregistrée/)).toBeVisible({ timeout: 15_000 });
});

test('la saisie clavier ne double pas dans le champ référence MVola', async ({ page }) => {
  await login(page);
  await openSession(page, 50000);

  await addToCart(page, 'Ampoule', 'Ampoule 9W');
  await page.getByRole('button', { name: 'F10 Encaisser' }).click();
  await page.getByRole('button', { name: 'MVola' }).click();

  // Taper des chiffres dans le champ référence ne doit PAS remplir le pavé
  const refInput = page.getByPlaceholder('Référence MVola (obligatoire)');
  await refInput.click();
  await refInput.fill('');
  await page.keyboard.type('123456');
  await expect(refInput).toHaveValue('123456');
  // Le pavé est resté à 0
  await expect(page.locator('.font-mono.text-2xl')).toHaveText('0');
});

test('annulation du paiement : rien ne persiste à la réouverture', async ({ page }) => {
  await login(page);
  await openSession(page, 50000);

  await addToCart(page, 'Ampoule', 'Ampoule 9W');
  await page.getByRole('button', { name: 'F10 Encaisser' }).click();
  await typeAmount(page, 1000);
  await expect(page.getByText('Payé', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Annuler' }).click();

  await page.getByRole('button', { name: 'F10 Encaisser' }).click();
  await expect(page.getByText('Payé', { exact: true })).toHaveCount(0);
});
