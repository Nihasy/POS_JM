/**
 * Scénarios contractuels — complète la couverture des 36 scénarios.
 *
 * Les scénarios S01–S05, S09–S17, S19, S28, S30–S31, S33, S36 sont
 * couverts par les fichiers de test dédiés (pmp, pricing, finalize,
 * cashup, velocity, ledger). Ce fichier couvre les scénarios restants :
 * S06–S08, S18, S20–S22, S24–S27, S29, S32, S34–S35.
 *
 * ⚠ docs/test_scenarios.py (référence Python) est absent du repo —
 * ces tests sont dérivés du plan et du CDC ; à re-valider 1:1 dès que
 * le fichier de référence sera fourni.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  prepareFinalize,
  prepareSuspend,
  checkKitStock,
  checkCreditLimit,
} from '../../src/core/domain/finalize';
import { lineTotal } from '../../src/core/domain/pricing';
import { saleNumber, quoteNumber, returnNumber } from '../../src/core/domain/numbering';
import { prepareAdjustment, prepareManualOut } from '../../src/core/domain/adjustment';
import { calculateExpectedCash } from '../../src/core/domain/cashup';
import { ItemRepo } from '../../src/core/db/repositories';
import { runSync } from '../../src/app/services';
import type { CartLine } from '../../src/core/domain/types';
import type { Db } from '../../src/core/db';

const makeLine = (overrides: Partial<CartLine> = {}): CartLine => ({
  tempId: crypto.randomUUID(),
  itemId: 'item-1',
  name: 'Produit Test',
  quantity: 2,
  unitPrice: 10000,
  appliedPrice: 10000,
  discountPercent: null,
  discountAmount: null,
  lineTotal: 20000,
  tierApplied: 'detail',
  isKit: false,
  ...overrides,
});

// ─── S06 : Vente au mètre (quantités décimales) ────────────────────

describe('S06 — Quantités décimales (vente au mètre)', () => {
  it('2,5 m × 4 000 Ar = 10 000 Ar', () => {
    const result = lineTotal({ quantity: 2.5, sellingPrice: 4000 });
    expect(result.lineTotal).toBe(10000);
  });

  it('Le total est arrondi à l’Ariary entier', () => {
    const result = lineTotal({ quantity: 1.3, sellingPrice: 3333 });
    expect(Number.isInteger(result.lineTotal)).toBe(true);
    expect(result.lineTotal).toBe(Math.round(1.3 * 3333));
  });
});

// ─── S07 : cost_price FIGÉ au moment de la vente ───────────────────

describe('S07 — Coût figé à la vente', () => {
  it('Le PMP du moment est snapshotté dans la ligne et le ledger', () => {
    const costPrices = new Map([['item-1', 7500]]);
    const result = prepareFinalize({
      cartLines: [makeLine()],
      payments: [{ method: 'ESPECES', amount: 20000, reference: null }],
      customerId: null,
      userId: 'user-1',
      allowNegativeStock: false,
      isQuote: false,
      isReturn: false,
      costPrices,
    });

    expect(result.errors).toHaveLength(0);
    expect(result.items[0]!.costPriceSnapshot).toBe(7500);
    expect(result.ledgerEntries[0]!.costPrice).toBe(7500);

    // Une modification ultérieure du PMP ne change pas le snapshot
    costPrices.set('item-1', 9999);
    expect(result.items[0]!.costPriceSnapshot).toBe(7500);
  });
});

// ─── S08 : Numérotation V/D/R-année-NNNNN ──────────────────────────

describe('S08 — Numérotation des pièces', () => {
  it('Vente : V-2026-NNNNN', () => {
    expect(saleNumber(2026, 42)).toBe('V-2026-00042');
  });
  it('Devis : D-2026-NNNNN', () => {
    expect(quoteNumber(2026, 7)).toBe('D-2026-00007');
  });
  it('Avoir : R-2026-NNNNN', () => {
    expect(returnNumber(2026, 123)).toBe('R-2026-00123');
  });
  it('Le préfixe suit le type dans prepareFinalize', () => {
    const quote = prepareFinalize({
      cartLines: [makeLine()],
      payments: [],
      customerId: null,
      userId: 'u',
      allowNegativeStock: false,
      isQuote: true,
      isReturn: false,
    });
    expect(quote.sale.saleNumber.startsWith('D-')).toBe(true);

    const ret = prepareFinalize({
      cartLines: [makeLine()],
      payments: [{ method: 'ESPECES', amount: 20000, reference: null }],
      customerId: null,
      userId: 'u',
      allowNegativeStock: false,
      isQuote: false,
      isReturn: true,
    });
    expect(ret.sale.saleNumber.startsWith('R-')).toBe(true);
  });
});

// ─── S18 / S20 : Crédit — paiement mixte et limite exacte ──────────

describe('S18 — Paiement mixte espèces + crédit', () => {
  it('Espèces 12 000 + crédit 8 000 sur 20 000 Ar : accepté avec client', () => {
    const result = prepareFinalize({
      cartLines: [makeLine()],
      payments: [
        { method: 'ESPECES', amount: 12000, reference: null },
        { method: 'CREDIT', amount: 8000, reference: null },
      ],
      customerId: 'customer-1',
      userId: 'user-1',
      allowNegativeStock: false,
      isQuote: false,
      isReturn: false,
    });
    expect(result.errors).toHaveLength(0);
    // Pas de rendu : les espèces ne dépassent pas la part restante
    expect(result.payments.find((p) => p.method === 'ESPECES')?.changeGiven).toBeNull();
  });
});

describe('S20 — Plafond crédit à la limite exacte', () => {
  it('balance + montant = plafond : accepté', () => {
    expect(checkCreditLimit(70000, 100000, 30000)).toBe(true);
  });
  it('balance + montant = plafond + 1 : refusé', () => {
    expect(checkCreditLimit(70001, 100000, 30000)).toBe(false);
  });
});

// ─── S21 / S22 : Suspension et rappel de panier ────────────────────

describe('S21 — Suspension de panier', () => {
  it('Statut SUSPENDED, AUCUN mouvement de stock', () => {
    const result = prepareSuspend([makeLine()], null, 'user-1');
    expect(result.errors).toHaveLength(0);
    expect(result.sale.status).toBe('SUSPENDED');
    expect(result.ledgerEntries).toHaveLength(0);
  });

  it('Panier vide : refus', () => {
    const result = prepareSuspend([], null, 'user-1');
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

describe('S22 — Rappel de panier', () => {
  it('Les lignes suspendues conservent prix appliqués et remises', () => {
    const line = makeLine({
      appliedPrice: 9000,
      discountPercent: 10,
      lineTotal: 16200,
      tierApplied: 'semi-gros',
    });
    const result = prepareSuspend([line], 'customer-1', 'user-1');

    const saved = result.items[0]!;
    expect(saved.appliedPrice).toBe(9000);
    expect(saved.discountPercent).toBe(10);
    expect(saved.lineTotal).toBe(16200);
    expect(saved.tierApplied).toBe('semi-gros');
    expect(result.sale.customerId).toBe('customer-1');
  });
});

// ─── S24 / S25 : Kits ──────────────────────────────────────────────

describe('S24 — Kit : contrôle du stock des composants', () => {
  const components = [
    { itemId: 'comp-1', name: 'Panneau', quantity: 1 },
    { itemId: 'comp-2', name: 'Batterie', quantity: 2 },
  ];

  it('Composant manquant : kit refusé', () => {
    const shortages = checkKitStock(
      components,
      3, // 3 kits → 3 panneaux + 6 batteries
      new Map([
        ['comp-1', 5],
        ['comp-2', 4], // il manque 2 batteries
      ])
    );
    expect(shortages).toHaveLength(1);
    expect(shortages[0]!.itemId).toBe('comp-2');
    expect(shortages[0]!.requested).toBe(6);
    expect(shortages[0]!.available).toBe(4);
  });

  it('Stock suffisant : kit vendable', () => {
    const shortages = checkKitStock(
      components,
      2,
      new Map([
        ['comp-1', 2],
        ['comp-2', 4],
      ])
    );
    expect(shortages).toHaveLength(0);
  });
});

describe('S25 — Kit : pas de sortie de stock directe sur la ligne kit', () => {
  it('La ligne kit est exclue du ledger (les composants sont décomposés par le service)', () => {
    const result = prepareFinalize({
      cartLines: [makeLine({ isKit: true })],
      payments: [{ method: 'ESPECES', amount: 20000, reference: null }],
      customerId: null,
      userId: 'user-1',
      allowNegativeStock: false,
      isQuote: false,
      isReturn: false,
    });
    expect(result.errors).toHaveLength(0);
    expect(result.ledgerEntries).toHaveLength(0);
  });
});

// ─── S26 / S27 : Retours ───────────────────────────────────────────

describe('S26 — Retour : ledger positif, avoir R-', () => {
  it('Le retour remet le stock (quantités positives dans le ledger)', () => {
    const result = prepareFinalize({
      cartLines: [makeLine({ quantity: 2, lineTotal: 20000 })],
      payments: [{ method: 'ESPECES', amount: 20000, reference: null }],
      customerId: null,
      userId: 'user-1',
      allowNegativeStock: false,
      isQuote: false,
      isReturn: true,
    });

    expect(result.errors).toHaveLength(0);
    expect(result.sale.isReturn).toBe(1);
    expect(result.ledgerEntries[0]!.quantity).toBe(2); // positif
  });
});

describe('S27 — Retour partiel au prix appliqué d’origine', () => {
  it('Remboursement au prorata du total de ligne remises comprises', () => {
    // Vente d'origine : 4 unités à 10 000 Ar avec remise → line_total 36 000 Ar
    const original = { quantity: 4, lineTotal: 36000 };
    // Retour de 1 unité → 36 000 / 4 = 9 000 Ar (et non 10 000 catalogue)
    const refund = Math.round((original.lineTotal / original.quantity) * 1);
    expect(refund).toBe(9000);

    const result = prepareFinalize({
      cartLines: [
        makeLine({ quantity: 1, appliedPrice: 9000, lineTotal: refund }),
      ],
      payments: [{ method: 'ESPECES', amount: refund, reference: null }],
      customerId: null,
      userId: 'user-1',
      allowNegativeStock: false,
      isQuote: false,
      isReturn: true,
    });
    expect(result.errors).toHaveLength(0);
    expect(result.sale.total).toBe(9000);
  });
});

// ─── S29 : Ajustements d'inventaire ────────────────────────────────

describe('S29 — Ajustements (contre-écritures)', () => {
  it('Écart compté − théorique → écriture ADJUSTMENT signée', () => {
    const result = prepareAdjustment(
      [
        { itemId: 'item-1', expectedQty: 10, countedQty: 8 }, // -2 (manquant)
        { itemId: 'item-2', expectedQty: 5, countedQty: 7 }, // +2 (surplus)
        { itemId: 'item-3', expectedQty: 4, countedQty: 4 }, // aucun écart
      ],
      'inventaire',
      'admin-1'
    );

    expect(result.ledgerEntries).toHaveLength(2);
    expect(result.ledgerEntries[0]!.quantity).toBe(-2);
    expect(result.ledgerEntries[1]!.quantity).toBe(2);
    expect(result.ledgerEntries.every((e) => e.refType === 'ADJUSTMENT')).toBe(true);
  });

  it('Sortie manuelle : quantité positive exigée, écriture négative', () => {
    const { ledgerEntry } = prepareManualOut({
      itemId: 'item-1',
      quantity: 3,
      reason: 'casse',
      userId: 'admin-1',
      comment: 'Carton tombé',
    });
    expect(ledgerEntry.quantity).toBe(-3);
    expect(ledgerEntry.refType).toBe('MANUAL_OUT');

    expect(() =>
      prepareManualOut({ itemId: 'item-1', quantity: 0, reason: 'don', userId: 'u' })
    ).toThrow();
  });
});

// ─── S32 : Dépenses de session ─────────────────────────────────────

describe('S32 — Les dépenses impactent l’attendu espèces', () => {
  it('attendu = ouverture + ventes − rendus − dépenses', () => {
    expect(calculateExpectedCash(50000, 200000, 5000, 15000)).toBe(230000);
  });
  it('Sans dépense, l’attendu est plus élevé du même montant', () => {
    const avec = calculateExpectedCash(50000, 200000, 0, 15000);
    const sans = calculateExpectedCash(50000, 200000, 0, 0);
    expect(sans - avec).toBe(15000);
  });
});

// ─── S34 : Soft delete — exclu des listes, JAMAIS de l'historique ──

describe('S34 — Soft delete', () => {
  function makeStubDb(captured: string[]): Db {
    return {
      async execute() {
        return {};
      },
      async select<T>(sql: string): Promise<T[]> {
        captured.push(sql);
        return [];
      },
    };
  }

  it('findAll exclut deleted=1 par défaut', async () => {
    const captured: string[] = [];
    const repo = new ItemRepo(makeStubDb(captured));
    await repo.findAll();
    expect(captured[0]).toContain('deleted = 0');
  });

  it('findAll(includeDeleted) et findById gardent l’historique accessible', async () => {
    const captured: string[] = [];
    const repo = new ItemRepo(makeStubDb(captured));
    await repo.findAll(true);
    await repo.findById('item-1');
    expect(captured[0]).not.toContain('deleted = 0');
    expect(captured[1]).not.toContain('deleted = 0');
  });
});

// ─── S35 : Sync idempotente (pas de doublon au re-push) ────────────

describe('S35 — Synchronisation sans doublon', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** Fausse DB : file sync_queue en mémoire. */
  function makeSyncDb(events: { id: string; synced: boolean }[]): Db {
    return {
      async select<T>(sql: string): Promise<T[]> {
        if (sql.includes('FROM app_config')) {
          if (sql.includes('?')) {
            // getConfig — piloté par les params, mais on simplifie :
            return [] as T[];
          }
        }
        if (sql.includes('FROM sync_queue')) {
          return events
            .filter((e) => !e.synced)
            .slice(0, 100)
            .map((e) => ({
              id: e.id,
              event_type: 'SALE',
              entity_id: e.id,
              payload: '{}',
              created_at: new Date().toISOString(),
            })) as T[];
        }
        return [] as T[];
      },
      async execute(sql: string, params?: unknown[]) {
        if (sql.includes('UPDATE sync_queue')) {
          for (const id of (params ?? []) as string[]) {
            const event = events.find((e) => e.id === id);
            if (event) event.synced = true;
          }
        }
        return {};
      },
    };
  }

  it('Un événement poussé est marqué synced_at et jamais re-poussé', async () => {
    const events = [
      { id: 'evt-1', synced: false },
      { id: 'evt-2', synced: false },
    ];

    // La config vient d'une DB séparée : on surcharge select pour app_config
    const db = makeSyncDb(events);
    const originalSelect = db.select.bind(db);
    db.select = async <T,>(sql: string, params?: unknown[]): Promise<T[]> => {
      if (sql.includes('FROM app_config')) {
        const key = (params ?? [])[0];
        if (key === 'sync_enabled') return [{ value: 'true' }] as T[];
        if (key === 'sync_server_url') return [{ value: 'http://test' }] as T[];
        return [] as T[];
      }
      return originalSelect(sql, params);
    };

    // Serveur factice idempotent par UUID (comportement de server/index.ts)
    const seenIds = new Set<string>();
    const pushedBatches: string[][] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: { body?: string }) => {
        const body = JSON.parse(init?.body ?? '{}') as { events: { id: string }[] };
        pushedBatches.push(body.events.map((e) => e.id));
        for (const e of body.events) seenIds.add(e.id);
        return { ok: true, status: 200 } as Response;
      })
    );

    // Premier push : 2 événements
    const first = await runSync(db);
    expect(first.error).toBeNull();
    expect(first.pushed).toBe(2);
    expect(events.every((e) => e.synced)).toBe(true);

    // Second push (re-sync) : rien à pousser → aucun doublon côté serveur
    const second = await runSync(db);
    expect(second.pushed).toBe(0);
    expect(pushedBatches).toHaveLength(1);
    expect(seenIds.size).toBe(2);
  });
});
