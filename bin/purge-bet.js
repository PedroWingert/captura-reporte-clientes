// Armadilha 9: uma aposta vive em varios lugares (tip, reportes, etc.).
// Este e o UNICO comando que limpa tudo de uma vez. Sempre com pre-visualizacao,
// e nunca apagando direto no banco a mao.
//
//   node bin/purge-bet.js <betKey>            -> so mostra o que seria removido
//   node bin/purge-bet.js <betKey> --confirm  -> remove de fato
import { getStore } from '../src/store/index.js';

const args = process.argv.slice(2);
const betKey = args.find((a) => !a.startsWith('--'));
const confirm = args.includes('--confirm');

if (!betKey) {
  console.error('Uso: node bin/purge-bet.js <betKey> [--confirm]');
  process.exit(1);
}

const store = getStore();

// Pre-visualizacao (dryRun) primeiro, SEMPRE.
const preview = store.purgeBet(betKey, { dryRun: true });

console.log(`Aposta ${betKey}:`);
console.log(`  tip encontrada: ${preview.tip ? 'sim' : 'nao'}`);
if (preview.tip) {
  console.log(`    ${preview.tip.home} x ${preview.tip.away} — ${preview.tip.market} ${preview.tip.side} ${preview.tip.line || ''}`.trim());
}
console.log(`  reportes de clientes: ${preview.reports.length}`);
for (const r of preview.reports) {
  console.log(`    - ${r.clientName || r.clientId}: ${r.status} [${r.source}]`);
}

if (!confirm) {
  console.log('\nNada foi removido. Confira acima e rode de novo com --confirm para apagar tudo isto de uma vez.');
  process.exit(0);
}

const done = store.purgeBet(betKey, { dryRun: false });
console.log(`\nRemovido: ${done.removedTips} tip(s) e ${done.removedReports} reporte(s).`);
