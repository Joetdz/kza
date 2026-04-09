import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Charge le .env de l'API
dotenv.config({ path: resolve(__dirname, '../apps/api/.env') });

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌  DATABASE_URL manquant dans apps/api/.env');
  console.error('   Ajoute : DATABASE_URL=postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres');
  process.exit(1);
}

const sql = readFileSync(
  resolve(__dirname, '../apps/api/supabase/migrations.sql'),
  'utf8'
);

const client = new pg.Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
  console.log('✅  Connecté à Supabase');
  await client.query(sql);
  console.log('✅  Migration exécutée avec succès');
} catch (err) {
  console.error('❌  Erreur :', err.message);
  process.exit(1);
} finally {
  await client.end();
}
