/**
 * Base SQLite en mémoire via sql.js (WASM) — mode navigateur.
 *
 * Utilisé quand l'application tourne HORS du runtime Tauri :
 * `npm run dev` dans un navigateur et les tests E2E Playwright.
 * Les données ne sont PAS persistées entre les rechargements —
 * la production passe toujours par @tauri-apps/plugin-sql.
 */

import initSqlJs from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import migration001 from './migrations/001_init.sql?raw';
import migration002 from './migrations/002_item_supplier.sql?raw';
import type { Db } from './index';

export async function openBrowserDatabase(): Promise<Db> {
  const SQL = await initSqlJs({ locateFile: () => wasmUrl });
  const sqldb = new SQL.Database();

  // Schéma complet (mêmes migrations que le plugin Rust, dans l'ordre)
  sqldb.exec(migration001);
  sqldb.exec(migration002);

  type SqlValue = number | string | Uint8Array | null;

  return {
    async execute(sql: string, params?: unknown[]): Promise<unknown> {
      sqldb.run(sql, (params ?? []) as SqlValue[]);
      return {};
    },

    async select<T>(sql: string, params?: unknown[]): Promise<T[]> {
      const stmt = sqldb.prepare(sql);
      try {
        stmt.bind((params ?? []) as SqlValue[]);
        const rows: T[] = [];
        while (stmt.step()) {
          rows.push(stmt.getAsObject() as T);
        }
        return rows;
      } finally {
        stmt.free();
      }
    },
  };
}
