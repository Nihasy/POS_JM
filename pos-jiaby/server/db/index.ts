/**
 * Connexion PostgreSQL — Drizzle ORM.
 *
 * Configuration pour le serveur de synchronisation.
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const DATABASE_URL = process.env.DATABASE_URL || 'postgres://localhost:5432/jiaby_sync';

const client = postgres(DATABASE_URL, {
  max: 10,
  idle_timeout: 30,
});

export const db = drizzle(client, { schema });

export type Database = typeof db;
export { schema };
