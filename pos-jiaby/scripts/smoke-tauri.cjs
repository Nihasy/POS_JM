/**
 * Smoke-test de l'application Tauri RÉELLE (WebView2 + SQLite + Rust).
 *
 * Contrairement aux E2E Playwright (mode navigateur, sql.js), ce script
 * pilote l'exécutable installé via le port de debug CDP de WebView2 et
 * exerce les chemins de production : plugin SQL, transactions Rust
 * (execute_transaction), hashage bcrypt.
 *
 * Usage :
 *   1. Lancer l'app avec :
 *      $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=9223"
 *      & "$env:LOCALAPPDATA\JIABY POS\pos-jiaby.exe"
 *   2. node scripts/smoke-tauri.cjs
 *
 * ⚠ Écrit dans la base de l'app : à réserver à une base jetable
 *   (sauvegarder/restaurer %APPDATA%\mg.jiaby.pos autour du run).
 */

const { chromium, expect } = require('@playwright/test');

const CDP_URL = 'http://127.0.0.1:9223';

async function typeDigits(page, digits) {
  for (const d of String(digits)) {
    await page.getByRole('button', { name: d, exact: true }).click();
  }
}

async function main() {
  console.log('Connexion CDP à l’app Tauri…');
  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = browser.contexts()[0];
  const page = context.pages()[0];
  if (!page) throw new Error('Aucune page WebView2 trouvée.');

  // ── 1. Login (seed au premier démarrage : PBKDF2/bcrypt, patient) ──
  console.log('1. Login PIN 1234…');
  await expect(page.getByRole('button', { name: 'Se connecter' })).toBeVisible({
    timeout: 30_000,
  });
  await typeDigits(page, '1234');
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('button', { name: 'Catalogue' })).toBeVisible({
    timeout: 20_000,
  });
  console.log('   ✓ connecté (Administrateur)');

  // ── 2. Création d'un produit (INSERT simple) ─────────────────────
  console.log('2. Création produit…');
  await page.getByRole('button', { name: 'Catalogue', exact: true }).click();
  await page.getByRole('button', { name: '+ Nouveau' }).click();
  await page.getByPlaceholder('Ex: Câble 2.5mm² 100m').fill('Produit Smoke');
  await page.getByPlaceholder('Carton, Lot…').fill('carton');
  const nums = page.locator('input[type="number"]');
  await nums.nth(0).fill('10'); // qté/pack
  await nums.nth(1).fill('4000'); // prix de vente
  await nums.nth(2).fill('2500'); // coût
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.getByText('Produit Smoke')).toBeVisible({ timeout: 15_000 });
  console.log('   ✓ produit créé');

  // ── 3. Ouverture de session (INSERT simple) ──────────────────────
  console.log('3. Ouverture de session…');
  await page.getByRole('button', { name: 'Session', exact: true }).click();
  await page.locator('input[type="number"]').first().fill('50000');
  await page.getByRole('button', { name: 'Ouvrir', exact: true }).click();
  await expect(page.getByText('Session ouverte').first()).toBeVisible({ timeout: 15_000 });
  console.log('   ✓ session ouverte (50 000 Ar)');

  // ── 4. RÉCEPTION (transaction Rust — le flux qui plantait) ───────
  console.log('4. Réception 2 cartons + 5 unités…');
  await page.getByRole('button', { name: 'Stock', exact: true }).click();
  await page.getByPlaceholder('IMPORT-CN-01…').fill('LOT-SMOKE');
  await page.locator('select').nth(1).selectOption({ label: 'Produit Smoke' });
  await page.getByRole('button', { name: '+ Ajouter' }).click();
  const row = page.getByRole('row').filter({ hasText: 'Produit Smoke' });
  const rowNums = row.locator('input[type="number"]');
  await rowNums.nth(0).fill('2'); // cartons ×10
  await rowNums.nth(1).fill('5'); // unités
  await rowNums.nth(2).fill('2500'); // coût
  await page.getByRole('button', { name: 'Valider la réception' }).click();
  await expect(page.getByText(/Réception enregistrée \(LOT-SMOKE\)/)).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole('button', { name: 'Plus tard' }).click();
  console.log('   ✓ réception enregistrée (25 unités)');

  // ── 5. Vente espèces avec rendu (transaction Rust) ───────────────
  console.log('5. Vente 2 × 4 000 Ar, payée 10 000…');
  await page.getByRole('button', { name: 'Caisse', exact: true }).click();
  await page.getByPlaceholder(/Rechercher/).first().fill('Smoke');
  await page.getByRole('button', { name: /Produit Smoke/ }).first().click();
  await page.getByLabel('Quantité Produit Smoke').fill('2');
  await page.getByRole('button', { name: 'F10 Encaisser' }).click();
  await typeDigits(page, '10000');
  await page.getByRole('button', { name: '↵' }).click();
  await expect(page.getByText(/Rendu/).first()).toBeVisible();
  await page.getByRole('button', { name: 'Encaisser', exact: true }).click();
  await expect(page.getByText(/Vente V-\d{4}-00001 enregistrée/)).toBeVisible({
    timeout: 15_000,
  });
  console.log('   ✓ vente V-…-00001, rendu 2 000 Ar');

  // ── 6. Stock à jour (ledger) : 25 − 2 = 23 ───────────────────────
  await page.getByPlaceholder(/Rechercher/).first().fill('Smoke');
  await expect(page.getByText('Stock: 23')).toBeVisible({ timeout: 15_000 });
  console.log('   ✓ stock ledger = 23');

  // ── 7. Ajustement d'inventaire (transaction Rust) ────────────────
  console.log('7. Inventaire : compté 22 (écart −1)…');
  await page.getByRole('button', { name: 'Stock', exact: true }).click();
  await page.getByRole('button', { name: 'Inventaire & ajustements' }).click();
  const invRow = page.getByRole('row').filter({ hasText: 'Produit Smoke' });
  await invRow.locator('input[type="number"]').fill('22');
  await page.getByRole('button', { name: "Valider l'inventaire (Admin)" }).click();
  await expect(page.getByText(/Inventaire validé — 1 écart/)).toBeVisible({
    timeout: 15_000,
  });
  console.log('   ✓ ajustement enregistré');

  // ── 8. Dépense + clôture juste (transaction Rust) ────────────────
  console.log('8. Dépense 1 000 Ar puis clôture…');
  await page.getByRole('button', { name: 'Session', exact: true }).click();
  await page.getByPlaceholder('Montant').fill('1000');
  await page.getByPlaceholder('Motif').fill('Smoke test');
  await page.getByRole('button', { name: '+ Ajouter', exact: true }).click();
  await expect(page.getByText('Smoke test')).toBeVisible({ timeout: 15_000 });
  // Attendu = 50 000 + 8 000 − 1 000 = 57 000
  await page.locator('input[type="number"]').last().fill('57000');
  await page.getByRole('button', { name: 'Clôturer' }).click();
  await expect(page.getByText(/écart \+?0 Ar/)).toBeVisible({ timeout: 15_000 });
  console.log('   ✓ clôture : caisse juste (attendu 57 000 Ar)');

  // ── 9. Création d'un utilisateur (bcrypt Rust + transaction) ─────
  console.log('9. Création utilisateur caissier…');
  await page.getByRole('button', { name: 'Utilisateurs', exact: true }).click();
  await page.getByRole('button', { name: '+ Nouvel utilisateur' }).click();
  await page.getByPlaceholder("Nom d'utilisateur *").fill('vendeur');
  await page.getByPlaceholder('Nom complet *').fill('Vendeur Smoke');
  await page.getByPlaceholder('PIN (4-6 chiffres) *').fill('5678');
  await page.getByPlaceholder('Confirmer le PIN *').fill('5678');
  await page.getByRole('button', { name: "Créer l'utilisateur" }).click();
  await expect(
    page.getByRole('row').filter({ hasText: 'vendeur' }).first()
  ).toContainText('Actif', { timeout: 20_000 });
  console.log('   ✓ utilisateur créé');

  // ── 10. Reconnexion caissier (bcrypt verify Rust) ────────────────
  console.log('10. Login caissier PIN 5678…');
  await page.getByRole('button', { name: 'Déconnexion' }).click();
  await expect(page.getByRole('button', { name: 'Se connecter' })).toBeVisible();
  await typeDigits(page, '5678');
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByText('Vendeur Smoke')).toBeVisible({ timeout: 20_000 });
  const usersBtn = await page
    .getByRole('button', { name: 'Utilisateurs', exact: true })
    .count();
  if (usersBtn !== 0) throw new Error('Le caissier voit l’écran Utilisateurs !');
  console.log('   ✓ caissier connecté, droits restreints');

  console.log('\n✅ SMOKE TAURI : tous les flux de production fonctionnent.');
  await browser.close();
}

main().catch((e) => {
  console.error('\n❌ SMOKE TAURI ÉCHOUÉ :', e.message);
  process.exit(1);
});
