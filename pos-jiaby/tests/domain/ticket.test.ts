import { describe, it, expect } from 'vitest';
import { generateTicketText, ESCPOS } from '../../src/core/printing/ticket';
import type { TicketData } from '../../src/core/printing/ticket';

const sampleTicket: TicketData = {
  ticketNumber: 'V-2026-00042',
  date: new Date('2026-07-09T14:30:00'),
  cashier: 'Admin',
  lines: [
    {
      name: 'Cable 2.5mm² 100m',
      quantity: 2,
      unitPrice: 10000,
      lineTotal: 20000,
      tierApplied: null,
    },
    {
      name: 'Ampoule LED 12W',
      quantity: 3,
      unitPrice: 5000,
      lineTotal: 14250,
      discountPercent: 5,
      tierApplied: 'semi-gros',
    },
  ],
  subtotal: 34250,
  total: 34250,
  payments: [
    { method: 'ESPECES', amount: 40000, change: 5750 },
  ],
  header: 'JIABY - Materiel Electrique',
  footer: 'Merci de votre visite !',
};

describe('generateTicketText', () => {
  it('Génère un ticket avec les sections requises', () => {
    const text = generateTicketText(sampleTicket);

    // En-tête
    expect(text).toContain('JIABY POS');
    expect(text).toContain('V-2026-00042');
    expect(text).toContain('09/07/2026');
    expect(text).toContain('14:30');

    // Lignes
    expect(text).toContain('Cable 2.5mm² 100m');
    expect(text).toContain('Ampoule LED 12W');

    // Paliers
    expect(text).toContain('SEMI-GROS');

    // Remises
    expect(text).toContain('Remise 5%');

    // Total
    expect(text).toContain('34');
    expect(text).toContain('250');
    expect(text).toContain('Ar');

    // Paiement et rendu
    expect(text).toContain('Especes');
    expect(text).toContain('Rendu');

    // Pied
    expect(text).toContain('Merci');
  });

  it('Gère un ticket sans remises ni paliers', () => {
    const simple: TicketData = {
      ticketNumber: 'V-2026-00001',
      date: new Date('2026-07-09T10:00:00'),
      cashier: 'Caissier',
      lines: [
        {
          name: 'Piles AA',
          quantity: 1,
          unitPrice: 2000,
          lineTotal: 2000,
        },
      ],
      subtotal: 2000,
      total: 2000,
      payments: [{ method: 'ESPECES', amount: 2000 }],
    };

    const text = generateTicketText(simple);
    expect(text).toContain('Piles AA');
    expect(text).toContain('2');
    expect(text).toContain('000');
  });
});

describe('ESCPOS commands', () => {
  it('Les commandes ESC/POS sont définies', () => {
    expect(ESCPOS.INIT).toBe('\x1b\x40');
    expect(ESCPOS.CUT).toBe('\x1d\x56\x42\x00');
    expect(ESCPOS.BOLD_ON).toBe('\x1b\x45\x01');
    expect(ESCPOS.ALIGN_CENTER).toBe('\x1b\x61\x01');
  });
});
