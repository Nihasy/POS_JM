-- Migration 002 — Fournisseur habituel du produit.
-- Permet le tri/filtre par fournisseur dans les écrans Stock et
-- l'affectation à l'import CSV du catalogue. Optionnel (NULL).
ALTER TABLE items ADD COLUMN supplier_id TEXT REFERENCES suppliers(id);
