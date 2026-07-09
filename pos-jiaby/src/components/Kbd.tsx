import type { ReactNode } from 'react';

/**
 * Touche clavier stylisée pour les raccourcis.
 * Affiche une touche F2, F4, F6, etc. dans le rail du bas.
 *
 * @example
 * <Kbd>F2</Kbd>
 * <Kbd>F10</Kbd>
 */
interface KbdProps {
  children: ReactNode;
  label?: string;
}

export function Kbd({ children, label }: KbdProps) {
  return (
    <kbd
      className="inline-flex items-center gap-1 rounded border border-gray-300 bg-gray-100 px-2 py-1 text-xs font-semibold text-encre-2 shadow-sm touch-target"
      title={label}
      aria-label={label}
    >
      {children}
      {label && <span className="text-[0.625rem] font-normal text-encre-2">{label}</span>}
    </kbd>
  );
}

/**
 * Conteneur pour le rail de raccourcis en bas d'écran.
 * Affiche F2, F4, F6, F8, F9, F10, F12 en permanence.
 */
interface ShortcutRailProps {
  shortcuts: { key: string; label: string }[];
}

export function ShortcutRail({ shortcuts }: ShortcutRailProps) {
  return (
    <div className="rail-raccourcis" role="toolbar" aria-label="Raccourcis clavier">
      {shortcuts.map((s) => (
        <Kbd key={s.key} label={s.label}>
          {s.key}
        </Kbd>
      ))}
    </div>
  );
}
