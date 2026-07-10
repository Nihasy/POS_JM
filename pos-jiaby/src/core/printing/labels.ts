/**
 * Génération d'étiquettes QR pour les produits.
 *
 * Deux gabarits :
 * - Planche A4 (24 ou 40 étiquettes/page, grille CSS print)
 * - Rouleau thermique (ESC/POS)
 *
 * Chaque étiquette = QR(item_number) + nom court + prix détail (optionnel)
 */

import QRCode from 'qrcode';
import { formatAriary } from '@/core/format';
import { printHtml } from './printHtml';

export interface LabelData {
  itemNumber: string;
  name: string;
  price: number; // Prix détail en Ariary
  showPrice: boolean;
}

/**
 * Génère les QR codes (data URL PNG) pour une liste d'étiquettes.
 * QR = item_number, lu par la douchette 2D en mode clavier.
 */
async function generateQrDataUrls(labels: LabelData[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  for (const label of labels) {
    if (!result.has(label.itemNumber)) {
      result.set(
        label.itemNumber,
        await QRCode.toDataURL(label.itemNumber, { margin: 1, width: 160 })
      );
    }
  }
  return result;
}

/**
 * Génère une page HTML de planche d'étiquettes A4.
 *
 * @param labels - Données des étiquettes
 * @param perPage - Nombre d'étiquettes par page (24 ou 40)
 * @returns Chaîne HTML complète prête pour impression
 */
export async function generateLabelSheet(
  labels: LabelData[],
  perPage: 24 | 40 = 24
): Promise<string> {
  const cols = perPage === 40 ? 5 : 4;
  const rows = perPage === 40 ? 8 : 6;

  const qrCodes = await generateQrDataUrls(labels);
  const cells: string[] = [];

  // Remplir la grille
  for (let i = 0; i < rows * cols; i++) {
    const label = labels[i];
    if (label) {
      cells.push(generateLabelCell(label, qrCodes.get(label.itemNumber)!));
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
  .qr-code {
    width: 20mm;
    height: 20mm;
    margin-bottom: 1mm;
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

function generateLabelCell(label: LabelData, qrDataUrl: string): string {
  return `
<div class="cell">
  <img class="qr-code" src="${qrDataUrl}" alt="${escapeHtml(label.itemNumber)}" />
  <div class="item-number">${escapeHtml(label.itemNumber)}</div>
  <div class="item-name">${escapeHtml(label.name)}</div>
  ${label.showPrice ? `<div class="item-price">${formatAriary(label.price)}</div>` : ''}
</div>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Imprime la planche d'étiquettes (iframe caché — fiable sous Tauri,
 * window.open y est bloqué).
 */
export async function printLabelSheet(
  labels: LabelData[],
  perPage: 24 | 40 = 24
): Promise<void> {
  const html = await generateLabelSheet(labels, perPage);
  await printHtml(html);
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
