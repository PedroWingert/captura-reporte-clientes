// Carrega configuracao a partir do ambiente. Sem dependencia externa:
// um mini-parser de .env cobre o caso local.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadDotEnv() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return;
  const text = fs.readFileSync(file, 'utf8');
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

loadDotEnv();

function req(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Config faltando: ${name} (veja .env.example)`);
  return v;
}

export const config = {
  root: ROOT,
  get botToken() { return req('BOT_TOKEN'); },
  botUsername: process.env.BOT_USERNAME || '',
  miniAppShortName: process.env.MINI_APP_SHORT_NAME || 'app',
  // channelId fica como string; ids de canal do Telegram sao numeros grandes.
  channelId: process.env.CHANNEL_ID || '',
  publicUrl: (process.env.PUBLIC_URL || 'http://localhost:3000').replace(/\/+$/, ''),
  port: Number(process.env.PORT || 3000),
  initDataMaxAgeSeconds: Number(process.env.INITDATA_MAX_AGE_SECONDS || 86400),
  storeFile: path.resolve(ROOT, process.env.STORE_FILE || './data/store.json'),
};

// Deep-link do Mini App carregando a chave da aposta em startapp.
export function miniAppLink(betKey) {
  const u = config.botUsername;
  const app = config.miniAppShortName;
  return `https://t.me/${u}/${app}?startapp=${encodeURIComponent(betKey)}`;
}
