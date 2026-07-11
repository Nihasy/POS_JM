import { test, expect, type Page } from '@playwright/test';
import { login, openSession, addToCart, payCash, closeTicket } from './helpers';

/**
 * Tests de cohérence « hard » : scénarios adversariaux et vérifications
 * croisées — remises suspendues, sur-retours, avoirs clients, chaîne
 * complète du ledger, rapport Z avec retours, total nul refusé.
 */

async function typeAmount(page: Page, amount: number) {
  for (const digit of String(amount)) {
    await page.getByRole('button', { name: digit, exact: true }).click();
  }
  await page.getByRole('button', { name: '↵' }).click();
}

async function searchStock(page: Page, term: string, expected: string) {
  await page.getByRole('button', { name: 'Caisse', exact: true }).click();
  const search = page.getByPlaceholder(/Rechercher/).first();
  await search.fill(term);
  await expect(page.getByText(`Stock: ${expected}`)).toBeVisible();
  await search.fill('');
}

test('vente à total nul (remise 100 %) refusée', async ({ page }) => {
  await login(page);
  await openSession(page, 50000);

  await addToCart(page, 'Ampoule', 'Ampoule 9W');
  await page.keyboard.press('F4');
  await page.getByPlaceholder('ex : 5').fill('100');
  await page.getByRole('button', { name: 'Appliquer la remise' }).click();
  await expect(page.getByText('0 Ar').first()).toBeVisible();

  await page.getByRole('button', { name: 'F10 Encaisser' }).click();
  await page.getByRole('button', { name: 'Encaisser', exact: true }).click();
  await expect(page.getByText('Le total de la vente doit être positif.')).toBeVisible({
    timeout: 15_000,
  });
});

test('la remise globale survit à la suspension et au rappel (S21)', async ({ page }) => {
  await login(page);
  await openSession(page, 50000);

  // 2 ampoules − 10 % = 5 400 Ar
  await addToCart(page, 'Ampoule', 'Ampoule 9W');
  await addToCart(page, 'Ampoule', 'Ampoule 9W');
  await page.keyboard.press('F4');
  await page.getByPlaceholder('ex : 5').fill('10');
  await page.getByRole('button', { name: 'Appliquer la remise' }).click();
  await expect(page.getByText('5 400 Ar').first()).toBeVisible();

  await page.keyboard.press('F8');
  await expect(page.getByText(/Panier suspendu/)).toBeVisible({ timeout: 15_000 });

  // Le montant listé au rappel inclut la remise
  await page.keyboard.press('F9');
  const entry = page.getByRole('button', { name: /P-\d{4}-00001/ });
  await expect(entry).toContainText('5 400 Ar');
  await entry.click();

  // Panier restauré AVEC la remise : total 5 400, pas 6 000
  await expect(page.getByText('Remise globale 10%')).toBeVisible();
  await expect(page.getByText('5 400 Ar').first()).toBeVisible();

  await payCash(page, 5400);
  await expect(page.getByText(/enregistrée/)).toBeVisible({ timeout: 15_000 });
});

test('sur-retour bloqué : impossible de retourner deux fois les articles', async ({ page }) => {
  await login(page);
  await openSession(page, 50000);

  // Vente de 2 ampoules → stock 148
  await addToCart(page, 'Ampoule', 'Ampoule 9W');
  await addToCart(page, 'Ampoule', 'Ampoule 9W');
  await payCash(page, 6000);
  await expect(page.getByText(/V-\d{4}-00001 enregistrée/)).toBeVisible({ timeout: 15_000 });

  // Premier retour : les 2 ampoules → stock 150
  await page.getByRole('button', { name: /Retour d.articles/ }).click();
  await page.getByPlaceholder('N° de vente (V-2026-00001)').fill('V-2026-00001');
  await page.getByRole('button', { name: 'Chercher' }).click();
  await page.locator('input[type="number"]').first().fill('2');
  await page.getByPlaceholder('PIN Admin (obligatoire pour un retour)').fill('1234');
  await page.getByRole('button', { name: 'Valider le retour' }).click();
  await expect(page.getByText(/Avoir R-\d{4}-00001/)).toBeVisible({ timeout: 15_000 });
  await searchStock(page, 'Ampoule', '150');

  // Second retour sur la même vente → refusé, stock inchangé
  await page.getByPlaceholder(/Rechercher/).first().fill('');
  await page.getByRole('button', { name: /Retour d.articles/ }).click();
  await page.getByPlaceholder('N° de vente (V-2026-00001)').fill('V-2026-00001');
  await page.getByRole('button', { name: 'Chercher' }).click();
  await page.locator('input[type="number"]').first().fill('1');
  await page.getByPlaceholder('PIN Admin (obligatoire pour un retour)').fill('1234');
  await page.getByRole('button', { name: 'Valider le retour' }).click();
  await expect(page.getByText(/déjà retourné 2, restant 0/)).toBeVisible({ timeout: 15_000 });
  await page.keyboard.press('Escape');
  await searchStock(page, 'Ampoule', '150');
});

test('retour d’une vente à crédit en avoir client → solde dû apuré', async ({ page }) => {
  await login(page);
  await openSession(page, 50000);

  // Vente à crédit de 3 000 Ar à RAKOTO
  await addToCart(page, 'Ampoule', 'Ampoule 9W');
  await page.keyboard.press('F6');
  await page.getByRole('button', { name: /RAKOTO Jean/ }).click();
  await page.getByRole('button', { name: 'F10 Encaisser' }).click();
  await page.getByRole('button', { name: 'Crédit' }).click();
  await typeAmount(page, 3000);
  await page.getByRole('button', { name: 'Encaisser', exact: true }).click();
  await expect(page.getByText(/enregistrée/)).toBeVisible({ timeout: 15_000 });
  await closeTicket(page);

  // Le client doit 3 000 Ar
  await page.getByRole('button', { name: 'Clients', exact: true }).click();
  await expect(page.getByRole('row').filter({ hasText: 'RAKOTO Jean' })).toContainText(
    '3 000 Ar'
  );

  // Retour en « Avoir client » (le bouton n'existe que si la vente a un client)
  await page.getByRole('button', { name: 'Caisse', exact: true }).click();
  await page.getByRole('button', { name: /Retour d.articles/ }).click();
  await page.getByPlaceholder('N° de vente (V-2026-00001)').fill('V-2026-00001');
  await page.getByRole('button', { name: 'Chercher' }).click();
  await page.locator('input[type="number"]').first().fill('1');
  await page.getByRole('button', { name: 'Avoir client' }).click();
  await expect(page.getByText(/diminue le solde dû/)).toBeVisible();
  await page.getByPlaceholder('PIN Admin (obligatoire pour un retour)').fill('1234');
  await page.getByRole('button', { name: 'Valider le retour' }).click();
  await expect(page.getByText(/Avoir R-\d{4}-00001/)).toBeVisible({ timeout: 15_000 });

  // Dette apurée + stock ré-crédité
  await page.getByRole('button', { name: 'Clients', exact: true }).click();
  await expect(page.getByText('Encours crédit total : 0 Ar')).toBeVisible();
  await searchStock(page, 'Ampoule', '150');
});

test('chaîne ledger complète : réception → vente → retour → sortie → inventaire à 0 écart', async ({
  page,
}) => {
  await login(page);
  await openSession(page, 50000);

  // Réception : 2 cartons de 24 + 2 unités de torches → 48 + 50 = 98
  await page.getByRole('button', { name: 'Stock', exact: true }).click();
  await page.locator('select').nth(1).selectOption({ label: 'Torche LED rechargeable' });
  await page.getByRole('button', { name: '+ Ajouter' }).click();
  await page.getByLabel('Cartons Torche LED rechargeable').fill('2');
  await page.getByLabel('Unités Torche LED rechargeable').fill('2');
  await page.getByRole('button', { name: 'Valider la réception' }).click();
  await expect(page.getByText(/Réception enregistrée/)).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Plus tard' }).click();
  await searchStock(page, 'Torche', '98');

  // Vente de 3 torches → 95
  await addToCart(page, 'Torche', 'Torche LED');
  await page.getByLabel('Quantité Torche LED').fill('3');
  await payCash(page, 45000);
  await expect(page.getByText(/V-\d{4}-00001 enregistrée/)).toBeVisible({ timeout: 15_000 });
  await searchStock(page, 'Torche', '95');

  // Retour d'1 torche → 96
  await page.getByRole('button', { name: /Retour d.articles/ }).click();
  await page.getByPlaceholder('N° de vente (V-2026-00001)').fill('V-2026-00001');
  await page.getByRole('button', { name: 'Chercher' }).click();
  await page.locator('input[type="number"]').first().fill('1');
  await page.getByPlaceholder('PIN Admin (obligatoire pour un retour)').fill('1234');
  await page.getByRole('button', { name: 'Valider le retour' }).click();
  await expect(page.getByText(/Avoir R-\d{4}-00001/)).toBeVisible({ timeout: 15_000 });
  await searchStock(page, 'Torche', '96');

  // Sortie manuelle de 2 (casse) → 94
  await page.getByRole('button', { name: 'Stock', exact: true }).click();
  await page.getByRole('button', { name: 'Inventaire & ajustements' }).click();
  await page.getByRole('button', { name: 'Sortie manuelle' }).click();
  await page.locator('select').nth(1).selectOption('d0000001-0001-4000-8000-000000000002');
  await page.getByPlaceholder('Quantité').fill('2');
  await page.getByPlaceholder('Motif détaillé (obligatoire)').fill('Casse test cohérence');
  await page.getByRole('button', { name: 'Enregistrer la sortie' }).click();
  await expect(page.getByText('Sortie manuelle enregistrée.')).toBeVisible({ timeout: 15_000 });

  // Inventaire : le stock théorique DOIT être exactement 94 (0 écart)
  const row = page.getByRole('row').filter({ hasText: 'Torche LED rechargeable' });
  await expect(row).toContainText('94');
  await row.locator('input[type="number"]').fill('94');
  await expect(page.getByText('1 produit(s) compté(s) — 0 écart(s)')).toBeVisible();
  await page.getByRole('button', { name: "Valider l'inventaire (Admin)" }).click();
  await expect(page.getByText(/Inventaire validé — 0 écart/)).toBeVisible({ timeout: 15_000 });
});

test('rapport Z avec retour espèces : attendu = fond + ventes − retours − dépenses', async ({
  page,
}) => {
  await login(page);
  await openSession(page, 50000);

  // Vente espèces 3 000
  await addToCart(page, 'Ampoule', 'Ampoule 9W');
  await payCash(page, 3000);
  await expect(page.getByText(/enregistrée/)).toBeVisible({ timeout: 15_000 });

  // Retour espèces 3 000
  await page.getByRole('button', { name: /Retour d.articles/ }).click();
  await page.getByPlaceholder('N° de vente (V-2026-00001)').fill('V-2026-00001');
  await page.getByRole('button', { name: 'Chercher' }).click();
  await page.locator('input[type="number"]').first().fill('1');
  await page.getByPlaceholder('PIN Admin (obligatoire pour un retour)').fill('1234');
  await page.getByRole('button', { name: 'Valider le retour' }).click();
  await expect(page.getByText(/Avoir R-/)).toBeVisible({ timeout: 15_000 });

  // Dépense 500
  await page.getByRole('button', { name: 'Session', exact: true }).click();
  await page.getByPlaceholder('Montant').fill('500');
  await page.getByPlaceholder('Motif').fill('Test Z');
  await page.getByRole('button', { name: '+ Ajouter', exact: true }).click();
  await expect(page.getByText('Test Z')).toBeVisible();

  // Attendu = 50 000 + 3 000 − 3 000 − 500 = 49 500
  await expect(
    page.locator('div.bg-blue-50').filter({ hasText: 'Attendu' })
  ).toContainText('49 500 Ar');

  await page.locator('input[type="number"]').last().fill('49500');
  await page.getByRole('button', { name: 'Clôturer' }).click();
  await expect(page.getByText(/écart \+?0 Ar/)).toBeVisible({ timeout: 15_000 });
});
