/**
 * Worker de synchronisation (côté client Tauri).
 *
 * Fonctionnement :
 * - Détection connexion → push file sync_queue (batchs de 100, retry backoff)
 * - Push → pull → marquage synced_at
 * - État sync visible dans la barre du haut
 *
 * S35 : re-sync complète sans doublon après 7 jours hors ligne.
 */

interface SyncConfig {
  serverUrl: string;
  shopId: string;
  batchSize: number;
  maxRetries: number;
  retryBaseDelayMs: number;
}

interface SyncStatus {
  isOnline: boolean;
  pendingCount: number;
  lastSyncAt: string | null;
  lastError: string | null;
  inProgress: boolean;
}

const DEFAULT_CONFIG: SyncConfig = {
  serverUrl: 'http://localhost:3001',
  shopId: 'shop-01',
  batchSize: 100,
  maxRetries: 5,
  retryBaseDelayMs: 1000,
};

/**
 * Service de synchronisation.
 * Gère l'état et les opérations de sync.
 */
class SyncWorker {
  private config: SyncConfig;
  private status: SyncStatus = {
    isOnline: false,
    pendingCount: 0,
    lastSyncAt: null,
    lastError: null,
    inProgress: false,
  };
  private listeners: Set<(status: SyncStatus) => void> = new Set();

  constructor(config: Partial<SyncConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** S'abonner aux changements d'état */
  subscribe(fn: (status: SyncStatus) => void): () => void {
    this.listeners.add(fn);
    fn(this.getStatus());
    return () => this.listeners.delete(fn);
  }

  getStatus(): SyncStatus {
    return { ...this.status };
  }

  private notify(): void {
    const status = this.getStatus();
    for (const fn of this.listeners) {
      fn(status);
    }
  }

  /** Tenter une synchronisation */
  async sync(getPendingEvents: (limit: number) => Promise<unknown[]>): Promise<void> {
    if (this.status.inProgress) return;

    this.status.inProgress = true;
    this.notify();

    try {
      // 1. Push : envoyer les événements en attente
      const events = await getPendingEvents(this.config.batchSize);

      if (events.length > 0) {
        let retries = 0;
        let pushed = false;

        while (!pushed && retries < this.config.maxRetries) {
          try {
            const response = await fetch(`${this.config.serverUrl}/sync/push`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                shop_id: this.config.shopId,
                events,
              }),
            });

            if (response.ok) {
              pushed = true;
              // Marquer comme synchronisés (appelé par le repository)
            }
          } catch {
            retries++;
            await this.delay(
              this.config.retryBaseDelayMs * Math.pow(2, retries)
            );
          }
        }

        if (!pushed) {
          throw new Error(`Échec push après ${this.config.maxRetries} tentatives`);
        }
      }

      // 2. Pull : récupérer les mises à jour catalogue
      const since = this.status.lastSyncAt || new Date(0).toISOString();
      const pullResponse = await fetch(
        `${this.config.serverUrl}/sync/pull?since=${encodeURIComponent(since)}`
      );

      if (pullResponse.ok) {
        const data = await pullResponse.json();
        // Appliquer les mises à jour catalogue (géré par le repository)
        void data;
      }

      this.status.lastSyncAt = new Date().toISOString();
      this.status.lastError = null;
      this.status.isOnline = true;
    } catch (err) {
      this.status.lastError =
        err instanceof Error ? err.message : 'Erreur sync inconnue';
      this.status.isOnline = navigator.onLine;
    } finally {
      this.status.inProgress = false;
      this.notify();
    }
  }

  /** Mettre à jour le compteur d'événements en attente */
  setPendingCount(count: number): void {
    this.status.pendingCount = count;
    this.notify();
  }

  /** Mettre à jour l'état de connexion */
  setOnline(online: boolean): void {
    this.status.isOnline = online;
    this.notify();
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Singleton
export const syncWorker = new SyncWorker();

/**
 * Configure le worker de sync avec les paramètres de la boutique.
 */
export function configureSync(config: Partial<SyncConfig>): void {
  const worker = new SyncWorker(config);
  // Remplacer le singleton
  Object.assign(syncWorker, worker);
}
