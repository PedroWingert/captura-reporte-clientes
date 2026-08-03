// Bot: escuta os cliques dos botoes simples (callback_query) por long polling
// e grava o reporte. O retorno vai por answerCallbackQuery — so quem clicou ve.
import { getUpdates, answerCallbackQuery } from './api.js';
import { decodeCb } from '../tips.js';
import { recordButton } from '../service.js';
import { handleMessage } from './commands.js';
import { VERSION, BOOTED_AT } from '../version.js';

function clientNameFrom(user) {
  if (!user) return null;
  const nome = [user.first_name, user.last_name].filter(Boolean).join(' ').trim();
  return nome || user.username || String(user.id);
}

async function handleCallback(cb) {
  const decoded = decodeCb(cb.data || '');
  if (!decoded) {
    await answerCallbackQuery(cb.id, 'Botao invalido. Abra a mensagem da tip novamente.');
    return;
  }
  const status = decoded.acao === 'y' ? 'taken' : decoded.acao === 'n' ? 'declined' : null;
  if (!status) {
    await answerCallbackQuery(cb.id, 'Acao desconhecida.');
    return;
  }

  const clientId = String(cb.from?.id);
  const clientName = clientNameFrom(cb.from);

  let out;
  try {
    out = recordButton({ betKey: decoded.betKey, clientId, clientName, status });
  } catch (err) {
    // Erro nunca vai ao canal (armadilha 10). Vai como alerta so para o usuario.
    await answerCallbackQuery(cb.id, 'Nao consegui registrar agora. Tente de novo em instantes.');
    console.error('[bot] erro ao gravar:', err.message);
    return;
  }

  // Tanto sucesso quanto recusa de portao viram alerta individual (armadilha 2 e 5).
  await answerCallbackQuery(cb.id, out.message, { alert: true });
}

async function loop() {
  console.log(`[bot] v${VERSION} iniciado em ${BOOTED_AT}. Ouvindo callbacks...`);
  let offset = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    let updates = [];
    try {
      updates = await getUpdates(offset, 25);
    } catch (err) {
      console.error('[bot] getUpdates falhou:', err.message);
      await new Promise((r) => setTimeout(r, 2000));
      continue;
    }
    for (const u of updates) {
      offset = u.update_id + 1;
      if (u.callback_query) {
        try {
          await handleCallback(u.callback_query);
        } catch (err) {
          console.error('[bot] handleCallback falhou:', err.message);
        }
      } else if (u.message) {
        try {
          await handleMessage(u.message);
        } catch (err) {
          console.error('[bot] handleMessage falhou:', err.message);
        }
      }
    }
  }
}

// Roda so quando executado diretamente (node src/telegram/bot.js).
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('bot.js')) {
  loop().catch((e) => {
    console.error('[bot] fatal:', e);
    process.exit(1);
  });
}

export { handleCallback, loop };
