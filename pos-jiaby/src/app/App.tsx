import { ShortcutRail } from '@/components';

const SHORTCUTS = [
  { key: 'F2', label: 'Rechercher' },
  { key: 'F4', label: 'Remise' },
  { key: 'F6', label: 'Client' },
  { key: 'F8', label: 'Suspendre' },
  { key: 'F9', label: 'Rappeler' },
  { key: 'F10', label: 'Encaisser' },
  { key: 'F12', label: 'Clôture' },
];

export function App() {
  return (
    <div className="flex h-screen flex-col bg-atelier">
      {/* Barre du haut */}
      <header className="liseré-terre flex items-center justify-between bg-carte px-4 py-2 shadow-sm">
        <h1 className="text-xl font-bold text-encre">JIABY POS</h1>
        <div className="flex items-center gap-4">
          {/* État sync et session seront ajoutés en Phase 5 / Phase 4 */}
        </div>
      </header>

      {/* Contenu principal */}
      <main className="flex-1 overflow-auto p-4">
        <div className="flex h-full items-center justify-center">
          <div className="text-center">
            <p className="text-2xl font-semibold text-encre">JIABY POS</p>
            <p className="mt-2 text-encre-2">Système de point de vente</p>
            <p className="mt-4 text-sm text-encre-2">Phase 0 — Bootstrap OK</p>
          </div>
        </div>
      </main>

      {/* Rail de raccourcis */}
      <ShortcutRail shortcuts={SHORTCUTS} />
    </div>
  );
}
