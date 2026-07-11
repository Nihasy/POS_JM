import { useState } from 'react';
import { Modal } from '@/components';
import {
  parseCatalogueCsv,
  csvTemplate,
  type CatalogueCsvRow,
  type CsvParseResult,
} from '@/core/import/catalogueCsv';

interface ImportCsvModalProps {
  open: boolean;
  onClose: () => void;
  /** Noms de produits existants — signalés « déjà présent » dans l'aperçu. */
  existingNames: string[];
  onImport: (rows: CatalogueCsvRow[]) => Promise<{ created: number; skipped: string[] }>;
}

/**
 * Import CSV du catalogue : choisir un fichier → aperçu + erreurs
 * ligne par ligne → import en une transaction. Modèle téléchargeable.
 */
export function ImportCsvModal({ open, onClose, existingNames, onImport }: ImportCsvModalProps) {
  const [parsed, setParsed] = useState<CsvParseResult | null>(null);
  const [fileName, setFileName] = useState('');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ created: number; skipped: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const existing = new Set(existingNames.map((n) => n.toLowerCase()));

  const reset = () => {
    setParsed(null);
    setFileName('');
    setResult(null);
    setError(null);
  };

  const handleFile = async (file: File | undefined) => {
    reset();
    if (!file) return;
    setFileName(file.name);
    const text = await file.text();
    setParsed(parseCatalogueCsv(text));
  };

  const handleTemplate = async () => {
    const content = '﻿' + csvTemplate();
    try {
      if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
        const { invoke } = await import('@tauri-apps/api/core');
        const path = await invoke<string>('save_report_csv', {
          filename: 'modele_catalogue.csv',
          content,
        });
        setError(null);
        setResult(null);
        setFileName(`Modèle enregistré : ${path}`);
      } else {
        const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'modele_catalogue.csv';
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Téléchargement du modèle impossible');
    }
  };

  const handleImport = async () => {
    if (!parsed || parsed.rows.length === 0) return;
    setImporting(true);
    setError(null);
    try {
      const res = await onImport(parsed.rows);
      setResult(res);
      setParsed(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur lors de l’import');
    }
    setImporting(false);
  };

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="Import CSV du catalogue"
    >
      <div className="w-[34rem] max-w-full space-y-3">
        <p className="text-xs text-encre-2">
          Fichier CSV (séparateur « ; » ou « , »), en-têtes en première ligne.
          Colonnes obligatoires : <code className="font-mono">nom</code> et{' '}
          <code className="font-mono">prix_detail</code>. Catégories et fournisseurs
          inconnus sont créés automatiquement ; le stock initial génère une écriture
          d'ouverture.
        </p>

        <div className="flex items-center gap-2">
          <input
            type="file"
            accept=".csv,text/csv"
            aria-label="Fichier CSV"
            className="flex-1 text-sm"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
          <button
            onClick={handleTemplate}
            className="shrink-0 rounded border border-gray-300 px-3 py-1.5 text-xs text-encre-2 hover:bg-gray-50 touch-target"
          >
            Télécharger le modèle
          </button>
        </div>

        {fileName && !parsed && !result && (
          <p className="text-xs text-encre-2">{fileName}</p>
        )}

        {/* Aperçu */}
        {parsed && (
          <>
            <div className="rounded bg-atelier px-3 py-2 text-sm">
              <strong>{parsed.rows.length}</strong> produit(s) prêt(s) à importer
              {parsed.errors.length > 0 && (
                <span className="text-alerte">
                  {' '}
                  — {parsed.errors.length} ligne(s) en erreur (ignorées)
                </span>
              )}
            </div>

            {parsed.errors.length > 0 && (
              <div className="max-h-28 space-y-0.5 overflow-y-auto rounded bg-red-50 px-3 py-2 text-xs text-red-600">
                {parsed.errors.map((e, i) => (
                  <p key={i}>
                    Ligne {e.line} : {e.message}
                  </p>
                ))}
              </div>
            )}

            {parsed.rows.length > 0 && (
              <div className="max-h-48 overflow-auto rounded border border-gray-200">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-carte">
                    <tr className="border-b text-left text-encre-2">
                      <th className="px-2 py-1">Produit</th>
                      <th className="px-2 py-1">Catégorie</th>
                      <th className="px-2 py-1">Fournisseur</th>
                      <th className="px-2 py-1 text-right">Prix</th>
                      <th className="px-2 py-1 text-right">Stock</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.rows.map((r, i) => (
                      <tr key={i} className="border-b">
                        <td className="px-2 py-1">
                          {r.name}
                          {existing.has(r.name.toLowerCase()) && (
                            <span className="ml-1 text-alerte">(déjà présent — ignoré)</span>
                          )}
                        </td>
                        <td className="px-2 py-1 text-encre-2">{r.categoryName ?? '—'}</td>
                        <td className="px-2 py-1 text-encre-2">{r.supplierName ?? '—'}</td>
                        <td className="px-2 py-1 text-right font-mono">{r.sellingPrice}</td>
                        <td className="px-2 py-1 text-right font-mono">{r.initialStock}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* Résultat */}
        {result && (
          <div className="rounded bg-green-50 px-3 py-2 text-sm text-especes">
            <strong>{result.created}</strong> produit(s) importé(s).
            {result.skipped.length > 0 && (
              <span className="block text-xs text-encre-2">
                Ignorés : {result.skipped.join(', ')}
              </span>
            )}
          </div>
        )}

        {error && (
          <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>
        )}

        <div className="flex justify-end gap-2 border-t pt-3">
          <button
            onClick={() => {
              reset();
              onClose();
            }}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-encre-2 hover:bg-gray-50 touch-target"
          >
            {result ? 'Fermer' : 'Annuler'}
          </button>
          {parsed && parsed.rows.length > 0 && (
            <button
              onClick={handleImport}
              disabled={importing}
              className="rounded-lg bg-neutre px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 touch-target"
            >
              {importing ? 'Import…' : `Importer ${parsed.rows.length} produit(s)`}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
