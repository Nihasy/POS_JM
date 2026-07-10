import { test, expect, type Page } from '@playwright/test';
import { login, openSession, addToCart, closeTicket } from './helpers';

/**
 * Clients & crédit : création, vente à crédit, règlement partiel/complet,
 * règlement supérieur au solde refusé (S18–S19).
 */

async function creditSale(page: Page, amount: number) {
  await addToCart(page, 'Ampoule', 'Ampoule 9W');
  await page.keyboard.press('F6');
  await page.getByRole('button', { name: /RAKOTO Jean/ }).click();
  await page.getByRole('button', { name: 'F10 Encaisser' }).click();
  await page.getByRole('button', { name: 'Crédit' }).click();
  for (const digit of String(amount)) {
    await page.getByRole('button', { name: digit, exact: true }).click();
  }
  await page.getByRole('button', { name: '↵' }).click();
  await page.getByRole('button', { name: 'Encaisser', exact: true }).click();
  await expect(page.getByText(/enregistrée/)).toBeVisible({ timeout: 15_000 });
  await closeTicket(page);
}

test('création d’un client avec plafond', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: 'Clients', exact: true }).click();

  await page.getByRole('button', { name: '+ Nouveau client' }).click();
  await page.getByPlaceholder('Nom *').fill('RASOA');
  await page.getByPlaceholder('Prénom').fill('Marie');
  await page.getByPlaceholder('Téléphone', { exact: true }).fill('033 11 222 33');
  await page.getByPlaceholder('Plafond crédit (Ar)').fill('50000');
  await page.getByRole('button', { name: 'Créer le client' }).click();

  const row = page.getByRole('row').filter({ hasText: 'RASOA Marie' });
  await expect(row).toBeVisible({ timeout: 15_000 });
  await expect(row).toContainText('50 000 Ar');
  await expect(row).toContainText('033 11 222 33');
});

test('client sans nom refusé', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: 'Clients', exact: true }).click();
  await page.getByRole('button', { name: '+ Nouveau client' }).click();
  await expect(page.getByRole('button', { name: 'Créer le client' })).toBeDisabled();
});

test('règlement crédit : trop-perçu refusé puis solde complet encaissé (S19)', async ({
  page,
}) => {
  await login(page);
  await openSession(page, 50000);

  // Dette de 3 000 Ar
  await creditSale(page, 3000);

  await page.getByRole('button', { name: 'Clients', exact: true }).click();
  const row = page.getByRole('row').filter({ hasText: 'RAKOTO Jean' });
  await expect(row).toContainText('3 000 Ar');

  // Règlement 5 000 > solde 3 000 → refusé
  await row.getByRole('button', { name: 'Règlement' }).click();
  await page.getByPlaceholder('Montant du règlement (Ar)').fill('5000');
  await page.getByRole('button', { name: 'Encaisser le règlement' }).click();
  await expect(page.getByText(/Règlement supérieur au solde dû/)).toBeVisible();

  // Solde complet → dette apurée
  await page.getByRole('button', { name: /Solde complet/ }).click();
  await page.getByRole('button', { name: 'Encaisser le règlement' }).click();

  const rowAfter = page.getByRole('row').filter({ hasText: 'RAKOTO Jean' });
  await expect(rowAfter.getByRole('button', { name: 'Règlement' })).toHaveCount(0, {
    timeout: 15_000,
  });
  await expect(page.getByText('Encours crédit total : 0 Ar')).toBeVisible();
});

test('crédit disponible affiché = plafond − solde dû', async ({ page }) => {
  await login(page);
  await openSession(page, 50000);

  await creditSale(page, 3000);

  await page.getByRole('button', { name: 'Clients', exact: true }).click();
  const row = page.getByRole('row').filter({ hasText: 'RAKOTO Jean' });
  // Plafond 100 000 − 3 000 dûs = 97 000 disponibles
  await expect(row).toContainText('97 000 Ar');
});
