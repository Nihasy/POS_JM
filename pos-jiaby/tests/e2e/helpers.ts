import { expect, type Page } from '@playwright/test';

/** Connexion PIN 1234 (comptes seed). */
export async function login(page: Page): Promise<void> {
  await page.goto('/');
  // Attendre le pavé PIN (la base sql.js + le seed peuvent prendre un instant)
  await expect(page.getByRole('button', { name: 'Se connecter' })).toBeVisible({
    timeout: 20_000,
  });
  for (const digit of ['1', '2', '3', '4']) {
    await page.getByRole('button', { name: digit, exact: true }).click();
  }
  await page.getByRole('button', { name: 'Se connecter' }).click();
  // Barre du haut de l'app
  await expect(page.getByRole('button', { name: 'Catalogue' })).toBeVisible({
    timeout: 15_000,
  });
}

/** Ouvre une session de caisse avec le fonds donné. */
export async function openSession(page: Page, openingAmount: number): Promise<void> {
  await page.getByRole('button', { name: 'Session', exact: true }).click();
  await expect(page.getByText('Aucune session ouverte')).toBeVisible();
  await page.locator('input[type="number"]').fill(String(openingAmount));
  await page.getByRole('button', { name: 'Ouvrir', exact: true }).click();
  await expect(page.getByText('Session ouverte').first()).toBeVisible();
}

/** Ajoute un produit au panier depuis l'écran de vente. */
export async function addToCart(page: Page, searchTerm: string, cardText: string): Promise<void> {
  await page.getByRole('button', { name: 'Caisse', exact: true }).click();
  const search = page.getByPlaceholder(/Rechercher/).first();
  await search.fill(searchTerm);
  await page.getByRole('button', { name: new RegExp(cardText) }).first().click();
}

/** Ajoute une ligne de réception via la recherche (mot-clé ou référence). */
export async function addReceiveLine(
  page: Page,
  query: string,
  resultText: string | RegExp
): Promise<void> {
  await page.getByLabel('Rechercher un produit à réceptionner').fill(query);
  await page
    .getByRole('button', { name: resultText })
    .first()
    .click();
}

/** Ferme la facture (ticket de caisse) affichée après un encaissement. */
export async function closeTicket(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Fermer', exact: true }).click();
}

/**
 * Paye le montant donné en espèces dans la modale de paiement,
 * puis ferme la facture affichée.
 */
export async function payCash(page: Page, amount: number): Promise<void> {
  await page.getByRole('button', { name: 'F10 Encaisser' }).click();
  for (const digit of String(amount)) {
    await page.getByRole('button', { name: digit, exact: true }).click();
  }
  await page.getByRole('button', { name: '↵' }).click();
  await page.getByRole('button', { name: 'Encaisser', exact: true }).click();
  await closeTicket(page);
}
