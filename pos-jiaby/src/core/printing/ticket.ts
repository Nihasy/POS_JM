/**
 * Génération de ticket ESC/POS 80 mm.
 *
 * Format du ticket :
 * ┌────────────────────────────────┐
 * │        JIABY POS               │
 * │  Matériel Électrique           │
 * │  Ticket: V-2026-00042          │
 * │  09/07/2026 14:30              │
 * │  Caissier: Admin               │
 * ├────────────────────────────────┤
 * │  Câble 2.5mm²                  │
 * │  2 × 10 000 Ar     20 000 Ar   │
 * │  Semi-gros                     │
 * │  Remise 5%           −1 000 Ar │
 * ├────────────────────────────────┤
 * │  TOTAL               19 000 Ar │
 * │  Espèces             20 000 Ar │
 * │  Rendu                 1 000 Ar │
 * ├────────────────────────────────┤
 * │        Merci !                  │
 * └────────────────────────────────┘
 */

import { formatAriary, formatDate, formatTime } from '@/core/format';

export interface TicketData {
  ticketNumber: string;
  date: Date;
  cashier: string;
  lines: {
    name: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
    discountPercent?: number | null;
    discountAmount?: number | null;
    tierApplied?: string | null;
  }[];
  subtotal: number;
  discountGlobalPercent?: number | null;
  discountGlobalAmount?: number | null;
  total: number;
  payments: {
    method: string;
    amount: number;
    reference?: string | null;
    change?: number | null;
  }[];
  header?: string;
  footer?: string;
}

/**
 * Génère le texte brut du ticket au format ESC/POS 80 mm.
 *
 * Utilise des caractères ASCII uniquement (compatibles ESC/POS).
 * Les accents sont remplacés par leur version sans accent.
 */
export function generateTicketText(data: TicketData): string {
  const WIDTH = 42; // Caractères par ligne pour 80 mm en police standard
  const lines: string[] = [];

  // Séparateur
  const sep = '─'.repeat(WIDTH);
  const thinSep = '·'.repeat(WIDTH);

  // En-tête
  lines.push(center('JIABY POS', WIDTH));
  lines.push(center(data.header || 'Materiel Electrique', WIDTH));
  lines.push(thinSep);
  lines.push(`Ticket: ${data.ticketNumber}`);
  lines.push(`${formatDate(data.date)} ${formatTime(data.date)}`);
  lines.push(`Caissier: ${data.cashier}`);
  lines.push(sep);

  // Lignes
  for (const line of data.lines) {
    // Nom du produit
    const name = truncate(line.name, 28);
    lines.push(name);

    // Qté × PU = Total
    const qtyStr = `${line.quantity}`.padStart(4);
    const puStr = formatAriary(line.unitPrice).padStart(12);
    const totalStr = formatAriary(line.lineTotal).padStart(12);
    lines.push(`${qtyStr} × ${puStr}  ${totalStr}`);

    // Palier
    if (line.tierApplied && line.tierApplied !== 'detail') {
      lines.push(`  ${line.tierApplied.toUpperCase()}`);
    }

    // Remise ligne
    if (line.discountPercent) {
      const discount = Math.round(line.lineTotal * line.discountPercent / 100);
      lines.push(
        `  Remise ${line.discountPercent}%`.padEnd(28) +
          formatAriary(-discount).padStart(14)
      );
    }
    if (line.discountAmount) {
      lines.push(
        '  Remise'.padEnd(28) +
          formatAriary(-line.discountAmount).padStart(14)
      );
    }
  }

  lines.push(sep);

  // Remise globale
  if (data.discountGlobalPercent && data.subtotal !== data.total) {
    lines.push('Remise globale:'.padEnd(28) + `${data.discountGlobalPercent}%`.padStart(14));
  }

  // Total
  lines.push('');
  lines.push(center(`TOTAL: ${formatAriary(data.total)}`, WIDTH));
  lines.push('');

  // Paiements
  for (const p of data.payments) {
    const methodLabel = p.method === 'ESPECES' ? 'Especes' : p.method;
    lines.push(
      methodLabel.padEnd(28) + formatAriary(p.amount).padStart(14)
    );
    if (p.reference) {
      lines.push(`  Ref: ${truncate(p.reference, 36)}`);
    }
    if (p.change && p.change > 0) {
      lines.push(
        'Rendu'.padEnd(28) + formatAriary(p.change).padStart(14)
      );
    }
  }

  lines.push(sep);

  // Pied
  lines.push(center(data.footer || 'Merci de votre visite !', WIDTH));
  lines.push('');

  // Coupe papier
  lines.push('\n'.repeat(4));

  return lines.join('\n');
}

/**
 * Centre un texte sur une largeur donnée.
 */
function center(text: string, width: number): string {
  const len = text.length;
  if (len >= width) return text;
  const left = Math.floor((width - len) / 2);
  return ' '.repeat(left) + text;
}

/**
 * Tronque un texte avec "…" si trop long.
 */
function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1) + '…';
}

/**
 * Commandes ESC/POS basiques.
 */
export const ESCPOS = {
  INIT: '\x1b\x40',
  CUT: '\x1d\x56\x42\x00',
  BOLD_ON: '\x1b\x45\x01',
  BOLD_OFF: '\x1b\x45\x00',
  ALIGN_LEFT: '\x1b\x61\x00',
  ALIGN_CENTER: '\x1b\x61\x01',
  ALIGN_RIGHT: '\x1b\x61\x02',
  DOUBLE_HEIGHT: '\x1d\x21\x11',
  NORMAL: '\x1d\x21\x00',
};

/**
 * Génère le buffer ESC/POS complet (commandes + texte).
 */
export function generateEscPosBuffer(data: TicketData): string {
  let buf = '';

  buf += ESCPOS.INIT;
  buf += ESCPOS.ALIGN_CENTER;
  buf += ESCPOS.BOLD_ON;
  buf += ESCPOS.DOUBLE_HEIGHT;
  buf += 'JIABY POS\n';
  buf += ESCPOS.NORMAL;
  buf += ESCPOS.BOLD_OFF;
  buf += (data.header || 'Materiel Electrique') + '\n';
  buf += ESCPOS.ALIGN_LEFT;
  buf += '\n';

  // Le texte brut du ticket
  buf += generateTicketText(data);
  buf += ESCPOS.CUT;

  return buf;
}
