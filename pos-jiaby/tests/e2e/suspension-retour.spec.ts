import { test, expect } from '@playwright/test';
import { login, openSession, addToCart, payCash } from './helpers';

/**
 * Suspension / rappel de panier (S21–S22), devis → conversion (S23),
 * retours avec PIN admin (S26–S27).
 */

test('suspendre un panier puis le rappeler et l’encaisser (S21–S22)', async ({ page }) => {
  await login(page);
  await openSession(page, 50000);

  await addToCart(page, 'Ampoule', 'Ampoule 9W');
  await addToCart(page, 'Ampoule', 'Ampoule 9W');
  await expect(page.getByText('6 000 Ar').first()).toBeVisible();

  // F8 : suspension → panier vidé
  await page.keyboard.press('F8');
  await expect(page.getByText(/Panier suspendu \(P-\d{4}-00001\)/)).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText('Panier vide.')).toBeVisible();

  // F9 : rappel
  await page.keyboard.press('F9');
  await page.getByRole('button', { name: /P-\d{4}-00001/ }).click();
  await expect(page.getByText(/rappelé/)).toBeVisible();
  await expect(page.getByText('6 000 Ar').first()).toBeVisible();

  await payCash(page, 6000);
  await expect(page.getByText(/enregistrée/)).toBeVisible({ timeout: 15_000 });

  // Le panier suspendu est consommé : plus rien à rappeler
  await page.keyboard.press('F9');
  await expect(page.getByText('Aucun panier suspendu ni devis en attente.')).toBeVisible();
});

test('devis sans mouvement de stock, converti en vente (S23)', async ({ page }) => {
  await login(page);
  await openSession(page, 50000);

  await addToCart(page, 'Torche', 'Torche LED');
  await page.getByRole('button', { name: 'Devis', exact: true }).click();
  await expect(page.getByText(/Devis D-\d{4}-00001 créé/)).toBeVisible({ timeout: 15_000 });

  // Le proforma imprimable s'affiche : en-tête DEVIS, mention légale,
  // total, AUCUN paiement
  const proforma = page.locator('pre');
  await expect(proforma).toContainText('DEVIS PROFORMA');
  await expect(proforma).toContainText('Devis: D-2026-00001');
  await expect(proforma).toContainText('TOTAL');
  await expect(proforma).toContainText("Ceci n'est pas une facture");
  await expect(proforma).not.toContainText('Especes');
  await expect(page.getByRole('button', { name: 'Imprimer' })).toBeVisible();
  await page.getByRole('button', { name: 'Fermer', exact: true }).click();

  // Aucun mouvement de stock : la torche est toujours à 48
  await page.getByPlaceholder(/Rechercher/).first().fill('Torche');
  await expect(page.getByText('Stock: 48')).toBeVisible();

  // Rappel du devis → conversion à l'encaissement
  await page.keyboard.press('F9');
  await page.getByRole('button', { name: /D-\d{4}-00001/ }).click();
  await expect(page.getByText(/convertira en vente/)).toBeVisible();

  await payCash(page, 15000);
  await expect(page.getByText(/Vente V-\d{4}-00001 enregistrée/)).toBeVisible({
    timeout: 15_000,
  });

  // Stock décrémenté après conversion
  await page.getByPlaceholder(/Rechercher/).first().fill('Torche');
  await expect(page.getByText('Stock: 47')).toBeVisible();

  // Le devis converti n'est plus rappelable
  await page.keyboard.press('F9');
  await expect(page.getByText('Aucun panier suspendu ni devis en attente.')).toBeVisible();
});

test('retour partiel avec PIN admin → avoir + stock ré-crédité (S26–S27)', async ({ page }) => {
  await login(page);
  await openSession(page, 50000);

  // Vente de 2 ampoules
  await addToCart(page, 'Ampoule', 'Ampoule 9W');
  await addToCart(page, 'Ampoule', 'Ampoule 9W');
  await payCash(page, 6000);
  await expect(page.getByText(/V-\d{4}-00001 enregistrée/)).toBeVisible({ timeout: 15_000 });

  // Stock après vente : 148
  await page.getByPlaceholder(/Rechercher/).first().fill('Ampoule');
  await expect(page.getByText('Stock: 148')).toBeVisible();

  // Retour d'une seule ampoule
  await page.getByRole('button', { name: /Retour d.articles/ }).click();
  await page.getByPlaceholder('N° de vente (V-2026-00001)').fill('V-2026-00001');
  await page.getByRole('button', { name: 'Chercher' }).click();
  await page.locator('input[type="number"]').first().fill('1');
  await expect(page.getByText(/Remboursement/)).toBeVisible();
  await expect(page.getByText('3 000 Ar').first()).toBeVisible();

  await page.getByPlaceholder('PIN Admin (obligatoire pour un retour)').fill('1234');
  await page.getByRole('button', { name: 'Valider le retour' }).click();
  await expect(page.getByText(/Avoir R-\d{4}-00001 enregistré/)).toBeVisible({
    timeout: 15_000,
  });

  // Stock ré-crédité : 149
  await page.getByPlaceholder(/Rechercher/).first().fill('Ampoule');
  await expect(page.getByText('Stock: 149')).toBeVisible();
});

test('retour refusé avec un PIN non admin (S26)', async ({ page }) => {
  await login(page);
  await openSession(page, 50000);

  await addToCart(page, 'Ampoule', 'Ampoule 9W');
  await payCash(page, 3000);
  await expect(page.getByText(/enregistrée/)).toBeVisible({ timeout: 15_000 });

  await page.getByRole('button', { name: /Retour d.articles/ }).click();
  await page.getByPlaceholder('N° de vente (V-2026-00001)').fill('V-2026-00001');
  await page.getByRole('button', { name: 'Chercher' }).click();
  await page.locator('input[type="number"]').first().fill('1');
  await page.getByPlaceholder('PIN Admin (obligatoire pour un retour)').fill('9999');
  await page.getByRole('button', { name: 'Valider le retour' }).click();
  await expect(page.getByText(/PIN admin invalide/)).toBeVisible({ timeout: 15_000 });

  // UR-1 : 5 PIN erronés dans la modale de retour ne doivent PAS
  // verrouiller les comptes de la boutique (contrairement au login)
  for (let i = 0; i < 4; i++) {
    await page.getByPlaceholder('PIN Admin (obligatoire pour un retour)').fill('0000');
    await page.getByRole('button', { name: 'Valider le retour' }).click();
    await expect(page.getByText(/PIN admin invalide/)).toBeVisible({ timeout: 15_000 });
  }
  await page.keyboard.press('Escape');

  // La connexion reste immédiatement possible
  await page.getByRole('button', { name: 'Déconnexion' }).click();
  for (const d of '1234') {
    await page.getByRole('button', { name: d, exact: true }).click();
  }
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('button', { name: 'Catalogue' })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText(/verrouillé/i)).toHaveCount(0);
});

test('retour introuvable et retour sur avoir refusés', async ({ page }) => {
  await login(page);
  await openSession(page, 50000);

  await page.getByRole('button', { name: 'Caisse', exact: true }).click();
  await page.getByRole('button', { name: /Retour d.articles/ }).click();
  await page.getByPlaceholder('N° de vente (V-2026-00001)').fill('V-2026-99999');
  await page.getByRole('button', { name: 'Chercher' }).click();
  await expect(page.getByText('Vente introuvable.')).toBeVisible();
});
