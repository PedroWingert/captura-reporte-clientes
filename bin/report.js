// Relatorio de uma tip: o que cada cliente reportou.
//   node bin/report.js <betKey>
//   node bin/report.js <betKey> --roster roster.json
// roster.json: [{ "id": "123", "name": "Fulano" }, ...]
// Com roster, quem nao respondeu aparece como SEM_RESPOSTA (armadilha 6).
import fs from 'node:fs';
import { getStore } from '../src/store/index.js';
import { buildTipReport, formatTipReport } from '../src/report.js';

const args = process.argv.slice(2);
const betKey = args.find((a) => !a.startsWith('--'));
if (!betKey) {
  console.error('Uso: node bin/report.js <betKey> [--roster roster.json] [--json]');
  process.exit(1);
}
const rosterIdx = args.indexOf('--roster');
const roster = rosterIdx !== -1 ? JSON.parse(fs.readFileSync(args[rosterIdx + 1], 'utf8')) : null;
const asJson = args.includes('--json');

const rep = buildTipReport(getStore(), betKey, roster);
if (asJson) {
  console.log(JSON.stringify(rep, null, 2));
} else {
  console.log(formatTipReport(rep));
}
