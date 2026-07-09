/**
 * Génération d'étiquettes QR pour les produits.
 *
 * Deux gabarits :
 * - Planche A4 (24 ou 40 étiquettes/page, grille CSS print)
 * - Rouleau thermique (ESC/POS)
 *
 * Chaque étiquette = QR(item_number) + nom court + prix détail (optionnel)
 */

import { formatAriary } from '@/core/format';

export interface LabelData {
  itemNumber: string;
  name: string;
  price: number; // Prix détail en Ariary
  showPrice: boolean;
}

/**
 * Génère une page HTML de planche d'étiquettes A4.
 *
 * @param labels - Données des étiquettes
 * @param perPage - Nombre d'étiquettes par page (24 ou 40)
 * @returns Chaîne HTML complète prête pour impression
 */
export function generateLabelSheet(
  labels: LabelData[],
  perPage: 24 | 40 = 24
): string {
  const cols = perPage === 40 ? 5 : 4;
  const rows = perPage === 40 ? 8 : 6;

  const cells: string[] = [];

  // Remplir la grille
  for (let i = 0; i < rows * cols; i++) {
    const label = labels[i];
    if (label) {
      cells.push(generateLabelCell(label));
    } else {
      cells.push('<div class="cell empty"></div>');
    }
  }

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Étiquettes JIABY</title>
<style>
  @page { size: A4; margin: 5mm; }
  body { margin: 0; font-family: 'IBM Plex Mono', monospace; }
  .sheet {
    display: grid;
    grid-template-columns: repeat(${cols}, 1fr);
    grid-template-rows: repeat(${rows}, 1fr);
    gap: 2mm;
    width: 200mm;
    height: 287mm;
    padding: 5mm;
    box-sizing: border-box;
  }
  .cell {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    border: 1px dashed #ccc;
    padding: 2mm;
    text-align: center;
    font-size: 7pt;
    page-break-inside: avoid;
  }
  .cell.empty { border: none; }
  .qr-placeholder {
    width: 20mm;
    height: 20mm;
    border: 1px solid #000;
    margin-bottom: 1mm;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 5pt;
    color: #999;
  }
  .item-number { font-size: 6pt; color: #666; }
  .item-name { font-weight: bold; font-size: 7pt; margin: 0.5mm 0; }
  .item-price { font-size: 8pt; font-weight: bold; }
  @media print { .cell { border-color: transparent; } }
</style>
</head>
<body>
<div class="sheet">
  ${cells.join('\n  ')}
</div>
</body>
</html>`;
}

function generateLabelCell(label: LabelData): string {
  // Le QR code sera généré côté client avec la librairie 'qrcode'
  // Ici, placeholder pour l'impression HTML
  return `
<div class="cell">
  <div class="qr-placeholder" data-qr="${label.itemNumber}">
    QR: ${label.itemNumber}
  </div>
  <div class="item-number">${label.itemNumber}</div>
  <div class="item-name">${label.name}</div>
  ${label.showPrice ? `<div class="item-price">${formatAriary(label.price)}</div>` : ''}
</div>`;
}

/**
 * Génère une étiquette pour imprimante thermique (format rouleau).
 * Format compact : 58 mm de large.
 */
export function generateThermalLabel(label: LabelData): string {
  const WIDTH = 32;
  const lines: string[] = [];

  lines.push(''); // Marge
  lines.push(center(label.name, WIDTH));
  lines.push('');
  if (label.showPrice) {
    lines.push(center(formatAriary(label.price), WIDTH));
    lines.push('');
  }
  lines.push(center(label.itemNumber, WIDTH));
  lines.push('');
  lines.push(''); // Marge bas
  lines.push('\n'.repeat(2)); // Coupe

  return lines.join('\n');
}

function center(text: string, width: number): string {
  const len = text.length;
  if (len >= width) return text;
  const left = Math.floor((width - len) / 2);
  return ' '.repeat(left) + text;
}
