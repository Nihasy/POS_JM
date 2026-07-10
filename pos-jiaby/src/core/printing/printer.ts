/**
 * Intégration imprimante ESC/POS.
 *
 * Supporte :
 * - USB raw (via Tauri plugin serialport)
 * - Driver Windows (impression HTML 80mm en fallback)
 * - Réimpression depuis l'historique
 *
 * Configuration via app_config:
 *   receipt_printer_type: 'escpos' | 'windows_driver'
 *   receipt_printer_port: 'COM3' | 'USB001' | etc.
 */

import { generateEscPosBuffer, generateTicketText } from './ticket';
import type { TicketData } from './ticket';
import { printHtml } from './printHtml';

export type PrinterType = 'escpos' | 'windows_driver';

interface PrinterConfig {
  type: PrinterType;
  port?: string; // ex: 'COM3' pour USB série
  width?: number; // largeur en mm (défaut: 80)
}

/**
 * Interface abstraite pour une imprimante.
 */
export interface ReceiptPrinter {
  print(data: TicketData): Promise<void>;
  printBuffer(buffer: string): Promise<void>;
  openDrawer(): Promise<void>;
}

/**
 * Imprimante ESC/POS via port série (USB raw).
 */
class EscPosPrinter implements ReceiptPrinter {
  private config: PrinterConfig;

  constructor(config: PrinterConfig) {
    this.config = config;
  }

  async print(data: TicketData): Promise<void> {
    const buffer = generateEscPosBuffer(data);
    await this.printBuffer(buffer);
  }

  async printBuffer(buffer: string): Promise<void> {
    // En production (Tauri), utiliser tauri-plugin-serialplugin
    // await serialport.write(this.config.port!, buffer);
    console.log('[ESC/POS] Impression sur', this.config.port || 'USB');
    console.log(buffer);
  }

  async openDrawer(): Promise<void> {
    // Commande ESC/POS pour ouvrir le tiroir-caisse
    const drawerCmd = '\x1b\x70\x00\x19\xfa';
    await this.printBuffer(drawerCmd);
  }
}

/**
 * Imprimante via driver Windows (impression HTML 80mm).
 * Fallback quand pas d'imprimante ESC/POS.
 *
 * L'impression passe par un iframe caché dans la page (et non
 * window.open, bloqué ou instable dans le WebView Tauri).
 */
class WindowsDriverPrinter implements ReceiptPrinter {
  async print(data: TicketData): Promise<void> {
    const text = generateTicketText(data);

    await printHtml(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Ticket ${data.ticketNumber}</title>
        <style>
          @page { size: 80mm auto; margin: 2mm; }
          body {
            font-family: 'Courier New', 'IBM Plex Mono', monospace;
            font-size: 9pt;
            width: 76mm;
            margin: 0;
            padding: 0;
          }
          pre {
            font-family: 'Courier New', 'IBM Plex Mono', monospace;
            font-size: 9pt;
            white-space: pre-wrap;
            margin: 0;
          }
          @media print {
            body { -webkit-print-color-adjust: exact; }
          }
        </style>
      </head>
      <body>
        <pre>${escapeHtml(text)}</pre>
      </body>
      </html>
    `);
  }

  async printBuffer(_buffer: string): Promise<void> {
    // Non supporté en mode driver Windows
    throw new Error('printBuffer non supporté en mode Windows Driver. Utilisez print().');
  }

  async openDrawer(): Promise<void> {
    // Non supporté en mode driver Windows
    console.warn('Ouverture tiroir-caisse non supportée en mode driver Windows.');
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Factory : crée l'imprimante selon la config.
 */
export function createPrinter(config: PrinterConfig): ReceiptPrinter {
  switch (config.type) {
    case 'escpos':
      return new EscPosPrinter(config);
    case 'windows_driver':
      return new WindowsDriverPrinter();
    default:
      return new WindowsDriverPrinter();
  }
}

/**
 * Format de ticket pour l'historique (réimpression).
 */
export function formatTicketForHistory(data: TicketData): string {
  return generateTicketText(data);
}
