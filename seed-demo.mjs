import { JsonStore } from './src/store/jsonStore.js';
import fs from 'node:fs';
const f = process.env.STORE_FILE || './data/demo.json';
try { fs.unlinkSync(f); } catch {}
const s = new JsonStore(f);
const clientes = [['pedro', 'Pedro'], ['luiz', 'Luiz Henrique'], ['ana', 'Ana'], ['bruno', 'Bruno']];
const tips = [
  ['t1', '2026-08-01', 'Botafogo', 'Santos', 'Handicap Cartoes', '-0.5', 0.75, 1.95, 'green'],
  ['t2', '2026-08-02', 'Flamengo', 'Palmeiras', 'Over 2.5', '', 1, 2.10, 'red'],
  ['t3', '2026-08-04', 'Gremio', 'Inter', 'Ambas marcam', '', 0.5, 1.80, 'green'],
  ['t4', '2026-08-06', 'Corinthians', 'Sao Paulo', 'Escanteios', '9.5', 1, 1.90, 'green'],
  ['t5', '2026-08-08', 'Cruzeiro', 'Atletico', 'Handicap', '-1', 0.75, 2.30, 'red'],
  ['t6', '2026-08-10', 'Vasco', 'Fluminense', 'Over 1.5', '', 1.5, 1.55, 'green'],
];
let seed = 7;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
for (const [bk, date, home, away, market, line, stake, odd, result] of tips) {
  s.putTip(bk, { home, away, market, line, date, stakeUnits: stake, odd, capValue: null, kickoff: null });
  s.setTipResult(bk, result);
  for (const [cid, cname] of clientes) {
    if (cid === 'bruno' && rnd() < 0.35) { s.upsertReport({ betKey: bk, clientId: cid, clientName: cname, status: 'declined', source: 'button', actionTs: date + 'T10:00:00Z' }); continue; }
    const diff = (cid === 'ana');
    const usedOdd = diff ? Math.round((odd + 0.15) * 100) / 100 : odd;
    s.upsertReport({ betKey: bk, clientId: cid, clientName: cname, status: diff ? 'different' : 'taken', odd: usedOdd, stakes: [{ stakeUnits: stake, odd: usedOdd }], source: diff ? 'form' : 'button', actionTs: date + 'T10:00:00Z' });
  }
}
s.upsertClient('pedro', { unitValue: 100 });
s.upsertClient('luiz', { unitValue: 50 });
s.upsertClient('ana', { unitValue: 200 });
s.upsertClient('bruno', { unitValue: 80 });
console.log('seed ok ->', f);
