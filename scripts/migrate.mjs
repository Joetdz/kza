// Applique les migrations SQL de apps/api/prisma/manual-migrations — UNIQUEMENT après
// confirmation explicite. Rien n'est jamais appliqué automatiquement.
//
//   npm run migrate            → liste ce qui reste à appliquer, demande confirmation
//   npm run migrate -- --status → liste seulement, ne change rien
//
// Les migrations appliquées sont enregistrées dans la table _kza_migrations.
// Première utilisation : 001 à 015 ont été exécutées à la main dans Supabase avant que
// ce suivi existe — elles sont enregistrées comme « déjà appliquées » sans être
// relancées (ça aussi est soumis à ta confirmation).

import { readFileSync, readdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';
import pg from 'pg';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../apps/api/.env') });

const MIGRATIONS_DIR = resolve(__dirname, '../apps/api/prisma/manual-migrations');
// Dernière migration appliquée à la main avant l'existence de ce script.
const BASELINE_UPTO = '015';
// Évite que deux personnes (ou deux terminaux) migrent en même temps.
const LOCK_KEY = 4242001;

const statusOnly = process.argv.includes('--status');
const urls = [process.env.DIRECT_URL, process.env.DATABASE_URL].filter(Boolean);
if (urls.length === 0) {
  console.error('❌  DIRECT_URL / DATABASE_URL manquant dans apps/api/.env');
  process.exit(1);
}

const files = readdirSync(MIGRATIONS_DIR).filter(f => /^\d{3}_.+\.sql$/.test(f)).sort();

// Les lignes de commentaire en tête du fichier = sa description.
function describe(file) {
  const lines = readFileSync(resolve(MIGRATIONS_DIR, file), 'utf8').split('\n');
  const desc = [];
  for (const line of lines) {
    if (!line.startsWith('--')) break;
    const text = line.replace(/^--\s?/, '').trim();
    if (text) desc.push(text);
  }
  return desc.slice(0, 3).join(' ') || '(pas de description)';
}

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(res => rl.question(question, answer => { rl.close(); res(answer.trim()); }));
}

// The direct port (5432) is often blocked on home/office networks — fall back to the pooler.
let client;
let url;
for (const candidate of urls) {
  const c = new pg.Client({ connectionString: candidate, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 });
  try { await c.connect(); client = c; url = candidate; break; } catch { await c.end().catch(() => {}); }
}
if (!client) {
  console.error('❌  Connexion impossible à la base (DIRECT_URL et DATABASE_URL).');
  process.exit(1);
}

try {
  const u = new URL(url);
  console.log(`\n🔌  Base : ${u.hostname}:${u.port}\n`);

  const { rows: [{ exists }] } = await client.query(`SELECT to_regclass('public._kza_migrations') IS NOT NULL AS exists`);
  const applied = new Set();
  if (exists) {
    const { rows } = await client.query('SELECT name FROM _kza_migrations');
    rows.forEach(r => applied.add(r.name));
  }

  const baseline = exists ? [] : files.filter(f => f.slice(0, 3) <= BASELINE_UPTO);
  const pending = files.filter(f => !applied.has(f) && !baseline.includes(f));

  if (baseline.length) {
    console.log(`📋  Première utilisation du suivi. Ces ${baseline.length} migrations seront enregistrées`);
    console.log(`    comme DÉJÀ APPLIQUÉES (tu les as exécutées à la main), sans être relancées :`);
    console.log(`    ${baseline[0]} … ${baseline[baseline.length - 1]}\n`);
  }

  if (pending.length === 0) {
    console.log('✅  Base à jour : aucune migration à appliquer.');
    if (!baseline.length || statusOnly) process.exit(0);
  } else {
    console.log(`🧾  ${pending.length} migration(s) à appliquer :\n`);
    for (const f of pending) console.log(`   • ${f}\n     ${describe(f)}\n`);
  }

  if (statusOnly) {
    console.log('ℹ️   Mode --status : rien n\'a été modifié.');
    process.exit(0);
  }

  if (!process.stdin.isTTY) {
    console.error('⛔  Pas de terminal interactif : impossible de demander ta confirmation, rien n\'est appliqué.');
    process.exit(1);
  }

  console.log('⚠️   Pense à faire une sauvegarde (Supabase → Database → Backups) avant une migration qui modifie des données.');
  const answer = await ask('\n👉  Tape OUI pour appliquer, autre chose pour annuler : ');
  if (answer !== 'OUI') {
    console.log('\n🛑  Annulé. Rien n\'a été modifié.');
    process.exit(0);
  }

  await client.query('SELECT pg_advisory_lock($1)', [LOCK_KEY]);
  await client.query(`CREATE TABLE IF NOT EXISTS _kza_migrations (
    name text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now(),
    baseline boolean NOT NULL DEFAULT false
  )`);

  for (const f of baseline) {
    await client.query('INSERT INTO _kza_migrations (name, baseline) VALUES ($1, true) ON CONFLICT DO NOTHING', [f]);
  }
  if (baseline.length) console.log(`\n📌  ${baseline.length} migrations enregistrées comme déjà appliquées.`);

  for (const f of pending) {
    // Re-vérifie sous le verrou : quelqu'un a pu l'appliquer entre-temps.
    const { rowCount } = await client.query('SELECT 1 FROM _kza_migrations WHERE name = $1', [f]);
    if (rowCount) { console.log(`↷   ${f} déjà appliquée, ignorée.`); continue; }
    process.stdout.write(`▶️   ${f} … `);
    try {
      await client.query(readFileSync(resolve(MIGRATIONS_DIR, f), 'utf8'));
    } catch (err) {
      // Les fichiers ont leur propre BEGIN/COMMIT : on annule ce qui serait resté ouvert.
      await client.query('ROLLBACK').catch(() => {});
      console.log('❌');
      console.error(`\n❌  Échec de ${f} : ${err.message}`);
      console.error('    Les migrations précédentes sont appliquées ; celle-ci et les suivantes ne le sont pas.');
      process.exit(1);
    }
    await client.query('INSERT INTO _kza_migrations (name) VALUES ($1)', [f]);
    console.log('✅');
  }
  console.log('\n🎉  Terminé.');
} catch (err) {
  console.error('❌  Erreur :', err.message);
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}
