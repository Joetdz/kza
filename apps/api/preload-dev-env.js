// Loaded via `node --require ./preload-dev-env.js` (see package.json's start:dev:branch,
// wired through NODE_OPTIONS since `nest start` doesn't expose a way to pass this directly).
//
// Why this exists: @prisma/client auto-loads plain `.env` from the working directory the
// instant it's require()'d — before our own NestJS ConfigModule ever runs — and dotenv-style
// loaders never overwrite a process.env key that's already set. So by the time our app's own
// config logic looks at NODE_ENV, DATABASE_URL is already pinned to production. The only
// reliable fix is to force the real env vars in BEFORE anything else (including @prisma/client)
// gets required — hence a --require preload, and Object.assign (not dotenv's non-destructive
// merge) so it actually overwrites what Prisma's own auto-load would otherwise set later.
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '.env.development');
if (!fs.existsSync(file)) {
  console.warn(`[preload-dev-env] ${file} not found — falling back to whatever .env provides.`);
} else {
  const parsed = {};
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m) continue;
    let value = m[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    parsed[m[1]] = value;
  }
  Object.assign(process.env, parsed);
  const host = (process.env.DATABASE_URL || '').match(/@([^:/]+)/)?.[1] ?? '(unknown)';
  console.log(`[preload-dev-env] Loaded .env.development — DATABASE_URL host: ${host}`);
}
