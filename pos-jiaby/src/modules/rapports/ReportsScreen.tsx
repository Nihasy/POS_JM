import { useState, useMemo } from 'react';
import { MontantAr } from '@/components';
import { formatDate, daysAgo } from '@/core/format';
import { calculateVelocity, getItemsToReorder } from '@/core/domain/velocity';
import type { Sale, SaleItem } from '@/core/domain/types';

interface ReportsScreenProps {
  sales: Sale[];
  saleItems: SaleItem[];
  stockLevels: Map<string, number>;
  items: { id: string; name: string; costPrice: number; reorderLevel: number | null }[];
  itemSales30d: Map<string, number>;
  itemSales90d: Map<string, number>;
  showCost: boolean;
}

type ReportType =
  | 'ventes_detail'
  | 'synthese_ca'
  | 'par_produit'
  | 'par_categorie'
  | 'stock_bas'
  | 'valorisation'
  | 'velocite'
  | 'clients_credit';

const REPORTS: { id: ReportType; label: string }[] = [
  { id: 'ventes_detail', label: 'Ventes détaillées' },
  { id: 'synthese_ca', label: 'Synthèse CA' },
  { id: 'par_produit', label: 'Par produit' },
  { id: 'stock_bas', label: 'Stock bas' },
  { id: 'valorisation', label: 'Valorisation' },
  { id: 'velocite', label: 'Vélocité' },
];

/**
 * Écran des rapports.
 * 13 rapports prévus — ici les principaux.
 */
export function ReportsScreen({
  sales,
  stockLevels,
  items,
  itemSales30d,
  itemSales90d,
  showCost,
}: ReportsScreenProps) {
  const [report, setReport] = useState<ReportType>('ventes_detail');
  const [days, setDays] = useState(30);

  // Filtrer les ventes sur la période
  const filteredSales = useMemo(() => {
    const since = daysAgo(days).toISOString();
    return sales.filter(
      (s) => s.created_at >= since && s.status === 'COMPLETED'
    );
  }, [sales, days]);

  const totalCA = useMemo(
    () => filteredSales.reduce((s, sale) => s + sale.total, 0),
    [filteredSales]
  );

  const velocityResults = useMemo(() => {
    if (report !== 'velocite') return [];
    return calculateVelocity(
      items.map((item) => ({
        itemId: item.id,
        itemName: item.name,
        currentStock: stockLevels.get(item.id) ?? 0,
        totalSold30d: itemSales30d.get(item.id) ?? 0,
        totalSold90d: itemSales90d.get(item.id) ?? 0,
      }))
    );
  }, [report, items, stockLevels, itemSales30d, itemSales90d]);

  const reorderItems = useMemo(() => {
    if (report !== 'stock_bas') return [];
    return getItemsToReorder(
      items.map((item) => ({
        itemId: item.id,
        name: item.name,
        stock: stockLevels.get(item.id) ?? 0,
        reorderLevel: item.reorderLevel,
      }))
    );
  }, [report, items, stockLevels]);

  const stockValue = useMemo(() => {
    if (report !== 'valorisation') return 0;
    return items.reduce(
      (sum, item) => sum + (stockLevels.get(item.id) ?? 0) * item.costPrice,
      0
    );
  }, [report, items, stockLevels]);

  const exportCsv = () => {
    let csv = '';
    switch (report) {
      case 'ventes_detail':
        csv =
          'Date;Numéro;Total;Paiements\n' +
          filteredSales
            .map((s) => `${s.created_at};${s.sale_number};${s.total}`)
            .join('\n');
        break;
      case 'par_produit':
        csv = 'Produit;Ventes 30j;Ventes 90j;Stock\n';
        for (const item of items) {
          csv += `${item.name};${itemSales30d.get(item.id) ?? 0};${itemSales90d.get(item.id) ?? 0};${stockLevels.get(item.id) ?? 0}\n`;
        }
        break;
      case 'stock_bas':
        csv = 'Produit;Stock;Seuil;Déficit\n';
        for (const item of reorderItems) {
          csv += `${item.name};${item.stock};${item.reorderLevel};${item.deficit}\n`;
        }
        break;
      case 'velocite':
        csv =
          'Produit;Stock;Ventes/jour 30j;Jours stock 30j;Ventes/jour 90j;Jours stock 90j\n';
        for (const v of velocityResults) {
          csv += `${v.itemName};${v.currentStock};${v.salesPerDay30d};${v.daysOfStock30d ?? '∞'};${v.salesPerDay90d};${v.daysOfStock90d ?? '∞'}\n`;
        }
        break;
      default:
        csv = 'Rapport non exportable\n';
    }

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rapport_${report}_${formatDate(new Date())}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex h-full flex-col p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-encre">Rapports</h2>
        {/* Filtre période */}
        <select
          className="rounded border border-gray-300 px-3 py-2 text-sm"
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
        >
          <option value={1}>Aujourd'hui</option>
          <option value={7}>7 jours</option>
          <option value={30}>30 jours</option>
          <option value={90}>90 jours</option>
        </select>
      </div>

      {/* Onglets rapports */}
      <div className="mb-4 flex gap-1 flex-wrap">
        {REPORTS.map((r) => (
          <button
            key={r.id}
            onClick={() => setReport(r.id)}
            className={`rounded px-3 py-1.5 text-xs font-medium touch-target ${
              report === r.id
                ? 'bg-neutre text-white'
                : 'bg-gray-100 text-encre-2 hover:bg-gray-200'
            }`}
          >
            {r.label}
          </button>
        ))}
        <button
          onClick={exportCsv}
          className="ml-auto rounded bg-especes px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 touch-target"
        >
          Export CSV
        </button>
      </div>

      {/* Contenu du rapport */}
      <div className="flex-1 overflow-auto rounded-lg bg-carte p-4 shadow-sm">
        {/* Ventes détaillées */}
        {report === 'ventes_detail' && (
          <div>
            <div className="mb-3 flex justify-between text-sm">
              <span className="text-encre-2">
                {filteredSales.length} vente{filteredSales.length > 1 ? 's' : ''}
              </span>
              <span className="font-bold">
                CA total : <MontantAr value={totalCA} />
              </span>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-encre-2">
                  <th className="pb-2">Date</th>
                  <th className="pb-2">N°</th>
                  <th className="pb-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {filteredSales.slice(0, 50).map((s) => (
                  <tr key={s.id} className="border-b hover:bg-gray-50">
                    <td className="py-1.5 text-xs">
                      {formatDate(new Date(s.created_at))}
                    </td>
                    <td className="py-1.5 font-mono text-xs">{s.sale_number}</td>
                    <td className="py-1.5 text-right">
                      <MontantAr value={s.total} className="text-xs" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Synthèse CA */}
        {report === 'synthese_ca' && (
          <div className="text-center py-8">
            <p className="text-encre-2 mb-2">Chiffre d'affaires ({days} jours)</p>
            <MontantAr value={totalCA} total />
            <p className="text-xs text-encre-2 mt-4">
              {filteredSales.length} vente{filteredSales.length > 1 ? 's' : ''}
              {filteredSales.length > 0 &&
                ` — Moyenne: ${Math.round(totalCA / filteredSales.length)} Ar/vente`}
            </p>
          </div>
        )}

        {/* Par produit */}
        {report === 'par_produit' && (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-encre-2">
                <th className="pb-2">Produit</th>
                <th className="pb-2 text-right">Stock</th>
                <th className="pb-2 text-right">Ventes 30j</th>
                <th className="pb-2 text-right">Ventes 90j</th>
              </tr>
            </thead>
            <tbody>
              {items
                .filter((i) => (stockLevels.get(i.id) ?? 0) > 0 || (itemSales30d.get(i.id) ?? 0) > 0)
                .slice(0, 50)
                .map((item) => (
                  <tr key={item.id} className="border-b hover:bg-gray-50">
                    <td className="py-1.5">{item.name}</td>
                    <td className="py-1.5 text-right font-mono">
                      {stockLevels.get(item.id) ?? 0}
                    </td>
                    <td className="py-1.5 text-right font-mono">
                      {itemSales30d.get(item.id) ?? 0}
                    </td>
                    <td className="py-1.5 text-right font-mono">
                      {itemSales90d.get(item.id) ?? 0}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}

        {/* Stock bas */}
        {report === 'stock_bas' && (
          <div>
            {reorderItems.length === 0 ? (
              <p className="py-8 text-center text-especes">
                Tous les stocks sont au-dessus des seuils ✓
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-encre-2">
                    <th className="pb-2">Produit</th>
                    <th className="pb-2 text-right">Stock</th>
                    <th className="pb-2 text-right">Seuil</th>
                    <th className="pb-2 text-right">Déficit</th>
                  </tr>
                </thead>
                <tbody>
                  {reorderItems.map((item) => (
                    <tr key={item.itemId} className="border-b hover:bg-gray-50">
                      <td className="py-1.5">{item.name}</td>
                      <td className="py-1.5 text-right font-mono text-alerte">
                        {item.stock}
                      </td>
                      <td className="py-1.5 text-right font-mono">
                        {item.reorderLevel}
                      </td>
                      <td className="py-1.5 text-right font-mono text-red-500">
                        −{item.deficit}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Valorisation */}
        {report === 'valorisation' && showCost && (
          <div className="text-center py-8">
            <p className="text-encre-2 mb-2">Valeur du stock (Σ qté × PMP)</p>
            <MontantAr value={stockValue} total />
            <p className="text-xs text-encre-2 mt-4">
              {items.length} produits en catalogue
            </p>
          </div>
        )}
        {report === 'valorisation' && !showCost && (
          <p className="py-8 text-center text-encre-2">
            Rapport réservé au profil Admin.
          </p>
        )}

        {/* Vélocité */}
        {report === 'velocite' && (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-encre-2">
                <th className="pb-2">Produit</th>
                <th className="pb-2 text-right">Stock</th>
                <th className="pb-2 text-right">Vente/j (30j)</th>
                <th className="pb-2 text-right">Jours stock</th>
              </tr>
            </thead>
            <tbody>
              {velocityResults.slice(0, 30).map((v) => (
                <tr key={v.itemId} className="border-b hover:bg-gray-50">
                  <td className="py-1.5">{v.itemName}</td>
                  <td className="py-1.5 text-right font-mono">{v.currentStock}</td>
                  <td className="py-1.5 text-right font-mono">{v.salesPerDay30d}</td>
                  <td
                    className={`py-1.5 text-right font-mono ${
                      v.daysOfStock30d !== null && v.daysOfStock30d < 7
                        ? 'text-alerte font-bold'
                        : ''
                    }`}
                  >
                    {v.daysOfStock30d !== null ? v.daysOfStock30d : '∞'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
