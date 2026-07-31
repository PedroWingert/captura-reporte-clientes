// Entrypoint unico de producao: sobe o servidor (Mini App + API) e o bot
// (long polling dos cliques) NO MESMO processo. Assim os dois compartilham o
// mesmo armazenamento (getStore() e singleton em processo) — sem corrida entre
// processos e sem divergencia de dados. Um `npm start` liga tudo.
import './server.js'; // efeito colateral: passa a ouvir a porta
import { loop } from './telegram/bot.js';
import { VERSION } from './version.js';

console.log(`[app] v${VERSION} subindo servidor + bot no mesmo processo`);

// Se o bot cair (ex.: erro de rede persistente), o servidor continua servindo o
// Mini App. O loop ja tem retry interno; este catch e a ultima rede de seguranca.
loop().catch((err) => {
  console.error('[app] o bot parou:', err?.message, '— o servidor segue no ar.');
});

// Nao deixa uma rejeicao solta derrubar o processo inteiro.
process.on('unhandledRejection', (err) => {
  console.error('[app] unhandledRejection:', err?.message || err);
});
