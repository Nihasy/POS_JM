import { useState, useEffect, useCallback, useRef } from 'react';
import { Pastille, Modal } from '@/components';
import { openDatabase, backupDatabase, isTauri, type Db } from '@/core/db';
import { runSeed } from '@/core/db/seed';
import { seedDemoData } from '@/core/db/demoData';
import { useAuthStore } from '@/modules/auth/authStore';
import { authenticate, hasPermission } from '@/modules/auth/authService';
import { LoginScreen } from '@/modules/auth/LoginScreen';
import { UsersScreen } from '@/modules/auth/UsersScreen';
import {
  SalesScreen,
  CustomerSelect,
  DiscountModal,
  RecallModal,
  ReturnModal,
  useCartStore,
} from '@/modules/caisse';
import { TicketModal } from '@/modules/caisse/TicketModal';
import type { TicketData } from '@/core/printing/ticket';
import { CatalogueScreen } from '@/modules/catalogue';
import { ReceiveScreen, AdjustScreen } from '@/modules/stock';
import { ClientsScreen } from '@/modules/clients';
import { CashupScreen } from '@/modules/cashup/CashupScreen';
import { ReportsScreen } from '@/modules/rapports/ReportsScreen';
import { createPrinter } from '@/core/printing/printer';
import { printLabelSheet, type LabelData } from '@/core/printing/labels';
import type { CartPayment, Item } from '@/core/domain/types';
import type { ReceiveLine } from '@/core/domain/receive';
import {
  loadAppData,
  finalizeSaleTx,
  suspendSaleTx,
  listSuspendedSales,
  recallSaleTx,
  findSaleByNumber,
  returnSaleTx,
  receiveStockTx,
  adjustStockTx,
  manualOutTx,
  openSessionTx,
  closeSessionTx,
  addExpenseTx,
  createCustomerTx,
  customerPaymentTx,
  createItemTx,
  updateItemTx,
  deleteItemTx,
  createUserTx,
  updateUserPinTx,
  setUserActiveTx,
  unlockUserTx,
  runSync,
  type AppData,
  type SuspendedSale,
} from './services';

type View =
  | 'caisse'
  | 'catalogue'
  | 'stock'
  | 'clients'
  | 'cashup'
  | 'rapports'
  | 'utilisateurs';
type StockTab = 'reception' | 'inventaire';

const NAV: { view: View; label: string; key: string; adminOnly?: boolean }[] = [
  { view: 'caisse', label: 'Caisse', key: '1' },
  { view: 'catalogue', label: 'Catalogue', key: '2' },
  { view: 'stock', label: 'Stock', key: '3' },
  { view: 'clients', label: 'Clients', key: '4' },
  { view: 'cashup', label: 'Session', key: '5' },
  { view: 'rapports', label: 'Rapports', key: '6' },
  { view: 'utilisateurs', label: 'Utilisateurs', key: '7', adminOnly: true },
];

export function App() {
  const { user, activeSessionId, login, logout, setActiveSession } = useAuthStore();
  const cartStore = useCartStore();

  const [db, setDb] = useState<Db | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const [view, setView] = useState<View>('caisse');
  const [stockTab, setStockTab] = useState<StockTab>('reception');
  const [data, setData] = useState<AppData | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Modales caisse
  const [showDiscount, setShowDiscount] = useState(false);
  const [showCustomerSelect, setShowCustomerSelect] = useState(false);
  const [showRecall, setShowRecall] = useState(false);
  const [showReturn, setShowReturn] = useState(false);
  const [suspendedSales, setSuspendedSales] = useState<SuspendedSale[]>([]);
  const [quoteToConvert, setQuoteToConvert] = useState<string | null>(null);

  // Étiquettes après réception (S02)
  const [labelOffer, setLabelOffer] = useState<LabelData[] | null>(null);

  // Facture / ticket de caisse affiché après encaissement
  const [ticketData, setTicketData] = useState<TicketData | null>(null);

  // Sync
  const [syncStatus, setSyncStatus] = useState<{ online: boolean; error: string | null }>({
    online: navigator.onLine,
    error: null,
  });

  const toastTimer = useRef<number | null>(null);
  const notify = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 4000);
  }, []);

  // ─── Démarrage : DB + seed ───────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const database = await openDatabase();
        await runSeed(database);
        // Mode navigateur (dev/E2E) : catalogue de démonstration
        if (!isTauri()) await seedDemoData(database);
        setDb(database);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e ?? 'Erreur inconnue');
        setBootError(`[DB] ${msg}`);
        console.error('openDatabase error:', e);
      }
    })();
  }, []);

  // ─── Chargement des données ──────────────────────────────────────
  const refresh = useCallback(async () => {
    if (!db) return;
    const appData = await loadAppData(db);
    setData(appData);
    setActiveSession(appData.activeSession?.id ?? null);
  }, [db, setActiveSession]);

  useEffect(() => {
    if (db && user) void refresh();
  }, [db, user, refresh]);

  // ─── Sync périodique (Phase 5) ───────────────────────────────────
  useEffect(() => {
    if (!db || !user) return;
    const doSync = async () => {
      const result = await runSync(db);
      setSyncStatus({ online: result.online, error: result.error });
      if (result.pushed > 0) void refresh();
    };
    void doSync();
    const interval = window.setInterval(doSync, 30_000);
    const onOnline = () => void doSync();
    window.addEventListener('online', onOnline);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('online', onOnline);
    };
  }, [db, user, refresh]);

  // ─── Navigation clavier (Ctrl+1…6) ───────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!e.ctrlKey) return;
      const entry = NAV.find((n) => n.key === e.key);
      if (entry) {
        e.preventDefault();
        setView(entry.view);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // ─── Auth ────────────────────────────────────────────────────────
  const handleLogin = useCallback(
    async (pin: string) => {
      if (!db) return { success: false, error: 'Base non prête' };
      const result = await authenticate(db, pin);
      if (result.success && result.user) {
        login(result.user);
        return { success: true };
      }
      return {
        success: false,
        error: result.error === 'LOCKED' ? 'Compte verrouillé (1 min).' : 'PIN incorrect',
      };
    },
    [db, login]
  );

  // ─── Caisse ──────────────────────────────────────────────────────
  /** Assemble la facture (ticket 80 mm) depuis le panier courant. */
  const buildTicketData = useCallback(
    (
      saleNumber: string,
      payments: CartPayment[],
      changeGiven: number | null
    ): TicketData => {
      const state = useCartStore.getState();
      return {
        ticketNumber: saleNumber,
        date: new Date(),
        cashier: user?.fullName ?? '',
        lines: state.lines.map((l) => ({
          name: l.name,
          quantity: l.quantity,
          unitPrice: l.appliedPrice,
          lineTotal: l.lineTotal,
          discountPercent: l.discountPercent,
          discountAmount: l.discountAmount,
          tierApplied: l.tierApplied,
        })),
        subtotal: state.subtotal,
        discountGlobalPercent: state.discountGlobalPercent,
        discountGlobalAmount: state.discountGlobalAmount,
        total: state.total,
        payments: payments.map((p) => ({
          method: p.method,
          amount: p.amount,
          reference: p.reference,
          change: p.method === 'ESPECES' ? changeGiven : null,
        })),
      };
    },
    [user]
  );

  const handlePrintTicket = useCallback(async (ticket: TicketData) => {
    const printer = createPrinter({ type: 'windows_driver' });
    await printer.print(ticket);
  }, []);

  const handlePrintLabels = useCallback(
    async (labels: LabelData[], perPage: 24 | 40) => {
      try {
        await printLabelSheet(labels, perPage);
      } catch (e) {
        notify(`Étiquettes non imprimées : ${e instanceof Error ? e.message : 'erreur'}`);
      }
      setLabelOffer(null);
    },
    [notify]
  );

  const handleFinalize = useCallback(
    async (payments: CartPayment[]) => {
      if (!db || !user) return;
      const state = useCartStore.getState();
      try {
        const result = await finalizeSaleTx(db, {
          lines: state.lines,
          payments,
          customerId: state.customerId,
          userId: user.id,
          discountGlobalPercent: state.discountGlobalPercent,
          discountGlobalAmount: state.discountGlobalAmount,
          originalSaleId: quoteToConvert,
        });
        // Facture affichée à l'écran — impression au choix du caissier
        setTicketData(buildTicketData(result.saleNumber, payments, result.changeGiven));
        setQuoteToConvert(null);
        notify(`Vente ${result.saleNumber} enregistrée.`);
        await refresh();
      } catch (e) {
        notify(e instanceof Error ? e.message : 'Erreur lors de la finalisation');
        throw e;
      }
    },
    [db, user, quoteToConvert, buildTicketData, notify, refresh]
  );

  const handleSuspend = useCallback(async () => {
    if (!db || !user) return;
    const state = useCartStore.getState();
    if (state.lines.length === 0) return;
    try {
      const number = await suspendSaleTx(
        db,
        state.lines,
        state.customerId,
        user.id,
        state.discountGlobalPercent,
        state.discountGlobalAmount
      );
      cartStore.clearCart();
      notify(`Panier suspendu (${number}).`);
      await refresh();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Erreur lors de la suspension');
    }
  }, [db, user, cartStore, notify, refresh]);

  const handleQuote = useCallback(async () => {
    if (!db || !user) return;
    const state = useCartStore.getState();
    if (state.lines.length === 0) return;
    try {
      const result = await finalizeSaleTx(db, {
        lines: state.lines,
        payments: [],
        customerId: state.customerId,
        userId: user.id,
        discountGlobalPercent: state.discountGlobalPercent,
        discountGlobalAmount: state.discountGlobalAmount,
        isQuote: true,
      });
      // Proforma imprimable pour le client (avant de vider le panier)
      setTicketData({
        ...buildTicketData(result.saleNumber, [], null),
        documentType: 'devis',
      });
      cartStore.clearCart();
      notify(`Devis ${result.saleNumber} créé (aucun mouvement de stock).`);
      await refresh();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Erreur lors de la création du devis');
    }
  }, [db, user, cartStore, buildTicketData, notify, refresh]);

  const handleOpenRecall = useCallback(async () => {
    if (!db) return;
    setSuspendedSales(await listSuspendedSales(db));
    setShowRecall(true);
  }, [db]);

  const handleRecall = useCallback(
    async (saleId: string) => {
      if (!db || !data) return;
      try {
        const result = await recallSaleTx(db, saleId);
        const customer = result.customerId
          ? data.customers.find((c) => c.id === result.customerId)
          : null;
        cartStore.loadCart(
          result.lines,
          result.customerId,
          customer ? `${customer.last_name} ${customer.first_name}` : null
        );
        // La remise globale suspendue est restaurée avec le panier
        cartStore.setGlobalDiscount(
          result.discountGlobalPercent,
          result.discountGlobalAmount
        );
        // Un devis rappelé sera converti en vente à l'encaissement (S23)
        setQuoteToConvert(result.isQuote ? saleId : null);
        setShowRecall(false);
        notify(
          result.isQuote
            ? `Devis ${result.saleNumber} chargé — l'encaissement le convertira en vente.`
            : `Panier ${result.saleNumber} rappelé.`
        );
        await refresh();
      } catch (e) {
        notify(e instanceof Error ? e.message : 'Erreur lors du rappel');
      }
    },
    [db, data, cartStore, notify, refresh]
  );

  const handleReturn = useCallback(
    async (params: {
      sale: import('@/core/domain/types').Sale;
      lines: { item: import('@/core/domain/types').SaleItem; quantity: number }[];
      refundMethod: 'ESPECES' | 'MVOLA' | 'CREDIT';
      refundReference: string | null;
      adminPin: string;
    }) => {
      if (!db || !user) return;
      // Les retours exigent un PIN admin (S26)
      const auth = await authenticate(db, params.adminPin);
      if (!auth.success || auth.user?.role !== 'admin') {
        throw new Error('PIN admin invalide — retour refusé.');
      }
      const result = await returnSaleTx(db, {
        originalSale: params.sale,
        returnLines: params.lines,
        refundMethod: params.refundMethod,
        refundReference: params.refundReference,
        userId: user.id,
      });
      notify(`Avoir ${result.saleNumber} enregistré.`);
      await refresh();
    },
    [db, user, notify, refresh]
  );

  // ─── Stock ───────────────────────────────────────────────────────
  const handleReceive = useCallback(
    async (
      lines: {
        itemId: string;
        itemName: string;
        qtyPerPack: number | null;
        currentStock: number;
        currentPmp: number;
        numberOfPacks: number;
        looseUnits: number;
        unitCost: number;
      }[],
      supplierId: string | null,
      lotRef: string
    ) => {
      if (!db || !user || !data) return;
      const receiveLines: ReceiveLine[] = lines.map((l) => ({
        itemId: l.itemId,
        quantityPerPack: l.qtyPerPack,
        numberOfPacks: l.numberOfPacks,
        looseUnits: l.looseUnits,
        unitCost: l.unitCost,
        currentStock: l.currentStock,
        currentPmp: l.currentPmp,
      }));
      try {
        const result = await receiveStockTx(db, {
          lines: receiveLines,
          supplierId,
          lotRef,
          userId: user.id,
        });
        notify(`Réception enregistrée (${lotRef || 'sans référence'}).`);
        await refresh();

        // Proposition d'impression d'étiquettes (S02)
        const labels: LabelData[] = [];
        for (const [itemId, units] of result.totalUnits) {
          const item = data.items.find((i: Item) => i.id === itemId);
          if (!item) continue;
          for (let n = 0; n < Math.min(units, 40); n++) {
            labels.push({
              itemNumber: item.item_number,
              name: item.short_name || item.name,
              price: item.selling_price,
              showPrice: true,
            });
          }
        }
        if (labels.length > 0) setLabelOffer(labels);
      } catch (e) {
        notify(e instanceof Error ? e.message : 'Erreur lors de la réception');
      }
    },
    [db, user, data, notify, refresh]
  );

  const handleAdjust = useCallback(
    async (
      lines: { itemId: string; expectedQty: number; countedQty: number }[],
      reason: import('@/core/domain/adjustment').AdjustmentReason
    ) => {
      if (!db || !user) return;
      const result = await adjustStockTx(db, { lines, reason, userId: user.id });
      notify(`Ajustement validé — ${result.adjustedCount} écriture(s).`);
      await refresh();
    },
    [db, user, notify, refresh]
  );

  const handleManualOut = useCallback(
    async (
      itemId: string,
      quantity: number,
      reason: import('@/core/domain/adjustment').AdjustmentReason,
      comment: string
    ) => {
      if (!db || !user) return;
      await manualOutTx(db, { itemId, quantity, reason, userId: user.id, comment });
      await refresh();
    },
    [db, user, refresh]
  );

  // ─── Sessions de caisse ──────────────────────────────────────────
  const handleOpenSession = useCallback(
    async (openingAmount: number) => {
      if (!db || !user) return;
      await openSessionTx(db, user.id, openingAmount);
      notify('Session de caisse ouverte.');
      await refresh();
    },
    [db, user, notify, refresh]
  );

  const handleCloseSession = useCallback(
    async (countedCash: number, note: string) => {
      if (!db || !data?.activeSession) return;
      const result = await closeSessionTx(db, {
        session: data.activeSession,
        countedCash,
        note,
      });
      notify(
        `Session clôturée — attendu ${result.expectedCash} Ar, écart ${result.difference >= 0 ? '+' : ''}${result.difference} Ar.`
      );
      await refresh();
    },
    [db, data, notify, refresh]
  );

  const handleAddExpense = useCallback(
    async (category: string, amount: number, reason: string) => {
      if (!db || !data?.activeSession) return;
      await addExpenseTx(db, {
        sessionId: data.activeSession.id,
        category,
        amount,
        reason,
      });
      await refresh();
    },
    [db, data, refresh]
  );

  // ─── Clients ─────────────────────────────────────────────────────
  const handleCreateCustomer = useCallback(
    async (params: {
      firstName: string;
      lastName: string;
      phone: string | null;
      creditLimit: number;
    }) => {
      if (!db) return;
      await createCustomerTx(db, params);
      await refresh();
    },
    [db, refresh]
  );

  const handleCustomerPayment = useCallback(
    async (customerId: string, amount: number) => {
      if (!db || !user) return;
      await customerPaymentTx(db, { customerId, amount, userId: user.id });
      notify('Règlement enregistré.');
      await refresh();
    },
    [db, user, notify, refresh]
  );

  // ─── Utilisateurs (Admin) ────────────────────────────────────────
  const handleCreateUser = useCallback(
    async (params: {
      username: string;
      fullName: string;
      role: 'admin' | 'caissier';
      pin: string;
    }) => {
      if (!db) return;
      await createUserTx(db, params);
      notify(`Utilisateur « ${params.username.trim().toLowerCase()} » créé.`);
      await refresh();
    },
    [db, notify, refresh]
  );

  const handleChangeUserPin = useCallback(
    async (userId: string, pin: string) => {
      if (!db) return;
      await updateUserPinTx(db, { userId, pin });
      notify('PIN modifié.');
      await refresh();
    },
    [db, notify, refresh]
  );

  const handleSetUserActive = useCallback(
    async (userId: string, active: boolean) => {
      if (!db || !user) return;
      await setUserActiveTx(db, { userId, active, currentUserId: user.id });
      notify(active ? 'Compte réactivé.' : 'Compte désactivé.');
      await refresh();
    },
    [db, user, notify, refresh]
  );

  const handleUnlockUser = useCallback(
    async (userId: string) => {
      if (!db) return;
      await unlockUserTx(db, userId);
      notify('Compte déverrouillé.');
      await refresh();
    },
    [db, notify, refresh]
  );

  // ─── Sauvegarde manuelle (Admin) ─────────────────────────────────
  const handleBackup = useCallback(async () => {
    try {
      const path = await backupDatabase();
      notify(`Sauvegarde créée : ${path}`);
    } catch (e) {
      notify(`Sauvegarde impossible : ${e instanceof Error ? e.message : 'erreur'}`);
    }
  }, [notify]);

  // ─── Rendu ───────────────────────────────────────────────────────

  if (bootError) {
    return (
      <div className="flex h-screen items-center justify-center bg-atelier p-8">
        <div className="max-w-md rounded-lg bg-carte p-6 text-center shadow-lg liseré-terre">
          <p className="text-lg font-semibold text-encre">JIABY POS</p>
          <p className="mt-3 text-sm text-red-600">{bootError}</p>
          <p className="mt-2 text-xs text-encre-2">
            L'application nécessite le runtime Tauri (SQLite). Lancez « npm run tauri dev ».
          </p>
        </div>
      </div>
    );
  }

  if (!db) {
    return (
      <div className="flex h-screen items-center justify-center bg-atelier">
        <p className="text-encre-2">Ouverture de la base…</p>
      </div>
    );
  }

  if (!user) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  const isAdmin = user.role === 'admin';
  const showCost = hasPermission(user.role, 'stock.cout_visible');
  const hasSession = activeSessionId !== null;

  return (
    <div className="flex h-screen flex-col bg-atelier">
      {/* Barre du haut */}
      <header className="liseré-terre flex items-center justify-between bg-carte px-4 py-2 shadow-sm">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold text-encre">JIABY POS</h1>
          <nav className="flex gap-1">
            {NAV.filter((n) => !n.adminOnly || isAdmin).map((n) => (
              <button
                key={n.view}
                onClick={() => setView(n.view)}
                className={`rounded px-3 py-1.5 text-sm font-medium touch-target ${
                  view === n.view
                    ? 'bg-neutre text-white'
                    : 'text-encre-2 hover:bg-gray-100'
                }`}
                title={`Ctrl+${n.key}`}
              >
                {n.label}
              </button>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          {/* État sync */}
          <Pastille
            variant={syncStatus.online ? 'sync-ok' : 'hors-ligne'}
            label={
              syncStatus.online
                ? `Synchronisé${data && data.pendingSyncCount > 0 ? ` (${data.pendingSyncCount} en attente)` : ''}`
                : `Hors ligne${data && data.pendingSyncCount > 0 ? ` — ${data.pendingSyncCount} en attente` : ''}`
            }
          />
          {/* État session */}
          <Pastille
            variant={hasSession ? 'sync-ok' : 'alerte'}
            label={hasSession ? 'Session ouverte' : 'Pas de session'}
          />
          {isAdmin && (
            <button
              onClick={handleBackup}
              className="rounded px-2 py-1 text-xs text-encre-2 hover:bg-gray-100 touch-target"
              title="Sauvegarder la base maintenant"
            >
              Sauvegarde
            </button>
          )}
          <span className="text-sm text-encre-2">
            {user.fullName}
            <span className="ml-1 rounded bg-gray-100 px-1.5 py-0.5 text-[0.625rem] font-semibold uppercase">
              {user.role}
            </span>
          </span>
          <button
            onClick={() => {
              cartStore.clearCart();
              setView('caisse');
              logout();
            }}
            className="rounded px-2 py-1 text-xs text-encre-2 hover:bg-gray-100 touch-target"
          >
            Déconnexion
          </button>
        </div>
      </header>

      {/* Toast */}
      {toast && (
        <div className="fixed left-1/2 top-14 z-[60] -translate-x-1/2 rounded-lg bg-encre px-4 py-2 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}

      {/* Contenu principal */}
      <main className="flex-1 overflow-auto">
        {!data ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-encre-2">Chargement…</p>
          </div>
        ) : (
          <>
            {view === 'caisse' && (
              <SalesScreen
                items={data.items}
                stockLevels={data.stockLevels}
                onSearch={() => {}}
                onFinalize={handleFinalize}
                onSuspend={handleSuspend}
                onRecall={handleOpenRecall}
                onSelectCustomer={() => setShowCustomerSelect(true)}
                onDiscount={() => setShowDiscount(true)}
                onQuote={handleQuote}
                onOpenReturn={() => setShowReturn(true)}
                canSell={hasPermission(user.role, 'caisse.vendre')}
                hasOpenSession={hasSession}
              />
            )}

            {view === 'catalogue' && (
              <CatalogueScreen
                items={data.items}
                categories={data.categories}
                stockLevels={data.stockLevels}
                onCreateItem={async (form) => {
                  await createItemTx(db, form);
                  await refresh();
                }}
                onUpdateItem={async (id, form) => {
                  await updateItemTx(db, id, form);
                  await refresh();
                }}
                onDeleteItem={async (id) => {
                  await deleteItemTx(db, id);
                  await refresh();
                }}
                canEdit={hasPermission(user.role, 'catalogue.edition')}
                canDelete={hasPermission(user.role, 'catalogue.suppression')}
                showCost={showCost}
              />
            )}

            {view === 'stock' && (
              <div className="flex h-full flex-col">
                <div className="flex gap-1 px-4 pt-3">
                  {(
                    [
                      { id: 'reception', label: 'Réception' },
                      { id: 'inventaire', label: 'Inventaire & ajustements' },
                    ] as { id: StockTab; label: string }[]
                  ).map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setStockTab(tab.id)}
                      className={`rounded-t px-4 py-2 text-sm font-medium touch-target ${
                        stockTab === tab.id
                          ? 'bg-carte text-encre shadow-sm'
                          : 'text-encre-2 hover:bg-gray-100'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
                <div className="flex-1 overflow-hidden">
                  {stockTab === 'reception' ? (
                    <ReceiveScreen
                      items={data.items}
                      suppliers={data.suppliers}
                      stockLevels={data.stockLevels}
                      onReceive={handleReceive}
                    />
                  ) : (
                    <AdjustScreen
                      items={data.items}
                      categories={data.categories}
                      stockLevels={data.stockLevels}
                      onAdjust={handleAdjust}
                      onManualOut={handleManualOut}
                      canAdjust={hasPermission(user.role, 'stock.ajustement')}
                    />
                  )}
                </div>
              </div>
            )}

            {view === 'clients' && (
              <ClientsScreen
                customers={data.customers}
                onCreateCustomer={handleCreateCustomer}
                onPayment={handleCustomerPayment}
                canEdit={hasPermission(user.role, 'clients.edition')}
              />
            )}

            {view === 'cashup' && (
              <CashupScreen
                activeSession={data.activeSession}
                expenses={data.sessionExpenses}
                todayCashSales={data.sessionCashSales}
                todayCashReturns={data.sessionCashReturns}
                todayMvolaTotal={data.sessionMvolaTotal}
                todayCreditTotal={data.sessionCreditTotal}
                onOpenSession={handleOpenSession}
                onCloseSession={handleCloseSession}
                onAddExpense={handleAddExpense}
              />
            )}

            {view === 'utilisateurs' &&
              (isAdmin ? (
                <UsersScreen
                  users={data.users}
                  currentUserId={user.id}
                  onCreateUser={handleCreateUser}
                  onChangePin={handleChangeUserPin}
                  onSetActive={handleSetUserActive}
                  onUnlock={handleUnlockUser}
                />
              ) : (
                <div className="flex h-full items-center justify-center">
                  <p className="text-encre-2">Écran réservé au profil Admin.</p>
                </div>
              ))}

            {view === 'rapports' && (
              <ReportsScreen
                sales={data.sales}
                saleItems={data.saleItems}
                stockLevels={data.stockLevels}
                items={data.items.map((i) => ({
                  id: i.id,
                  name: i.name,
                  costPrice: showCost ? i.cost_price : 0,
                  reorderLevel: i.reorder_level,
                }))}
                itemSales30d={data.itemSales30d}
                itemSales90d={data.itemSales90d}
                showCost={showCost}
              />
            )}
          </>
        )}
      </main>

      {/* Modales caisse */}
      <DiscountModal open={showDiscount} onClose={() => setShowDiscount(false)} />
      {showCustomerSelect && data && (
        <CustomerSelect
          customers={data.customers}
          onSelect={(c) => {
            cartStore.setCustomer(c.id, `${c.last_name} ${c.first_name}`);
            setShowCustomerSelect(false);
          }}
          onClose={() => setShowCustomerSelect(false)}
        />
      )}
      <RecallModal
        open={showRecall}
        onClose={() => setShowRecall(false)}
        suspendedSales={suspendedSales}
        onRecall={handleRecall}
      />
      <ReturnModal
        open={showReturn}
        onClose={() => setShowReturn(false)}
        onSearchSale={(n) => findSaleByNumber(db, n)}
        onReturn={handleReturn}
      />

      {/* Facture / ticket de caisse après encaissement */}
      <TicketModal
        ticket={ticketData}
        onPrint={handlePrintTicket}
        onClose={() => setTicketData(null)}
      />

      {/* Proposition d'étiquettes après réception (S02) */}
      <Modal
        open={labelOffer !== null}
        onClose={() => setLabelOffer(null)}
        title="Imprimer les étiquettes ?"
      >
        <div className="space-y-3">
          <p className="text-sm text-encre-2">
            {labelOffer?.length ?? 0} étiquette(s) QR à imprimer pour cette réception.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => labelOffer && handlePrintLabels(labelOffer, 24)}
              className="flex-1 rounded-lg bg-neutre py-2 text-sm font-semibold text-white hover:bg-blue-700 touch-target"
            >
              Planche A4 (24/page)
            </button>
            <button
              onClick={() => labelOffer && handlePrintLabels(labelOffer, 40)}
              className="flex-1 rounded-lg bg-neutre py-2 text-sm font-semibold text-white hover:bg-blue-700 touch-target"
            >
              Planche A4 (40/page)
            </button>
            <button
              onClick={() => setLabelOffer(null)}
              className="flex-1 rounded-lg border border-gray-300 py-2 text-sm text-encre-2 hover:bg-gray-50 touch-target"
            >
              Plus tard
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
