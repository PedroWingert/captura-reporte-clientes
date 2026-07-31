// Publica uma tip no canal.
//   node bin/post-tip.js --file tip.json
//   node bin/post-tip.js --home "Sao Paulo" --away Palmeiras --market 1x2 --side home --date 2026-08-01 --odd 1.85 --kickoff "2026-08-01T21:30:00-03:00" --cap 500
//   ...adicione --dry para so montar e nao enviar ao canal.
import fs from 'node:fs';
import { postTip } from '../src/tips.js';

function parseArgs(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) { a[key] = true; }
    else { a[key] = next; i++; }
  }
  return a;
}

const args = parseArgs(process.argv.slice(2));

let bet;
if (args.file) {
  bet = JSON.parse(fs.readFileSync(args.file, 'utf8'));
} else {
  bet = {
    date: args.date,
    home: args.home,
    away: args.away,
    market: args.market,
    side: args.side,
    line: args.line || '',
    odd: args.odd,
    kickoff: args.kickoff,           // sem isto, o formulario falha fechado no apito
    capValue: args.cap !== undefined ? Number(args.cap) : undefined, // sem isto, falha fechado no teto
    note: args.note,
  };
}

const dry = !!args.dry;

postTip(bet, { send: !dry })
  .then((out) => {
    console.log('Tip', dry ? 'MONTADA (nao enviada)' : 'PUBLICADA');
    console.log('  betKey:', out.betKey);
    console.log('  link Mini App:', out.link);
    console.log('  --- mensagem ---');
    console.log(out.text);
    if (dry) console.log('\n(rode sem --dry para enviar ao canal)');
  })
  .catch((err) => { console.error('Falha:', err.message); process.exit(1); });
