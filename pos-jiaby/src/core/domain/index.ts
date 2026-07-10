/**
 * Domain — Règles métier pures.
 * Ne dépend ni de React ni de Tauri. Fonctions pures testables.
 *
 * Les fonctions portent les mêmes signatures que le proto Python
 * de référence (docs/pos_proto.py).
 */

export * from './types';
export * from './ledger';
export * from './pmp';
export * from './pricing';
export * from './finalize';
export * from './receive';
export * from './adjustment';
export * from './cashup';
export * from './velocity';
export * from './numbering';
