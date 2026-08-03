// Chamadas cruas a Bot API via fetch. Sem SDK.
//
// Armadilha 10: nunca enviar mensagem de sistema ao canal dos clientes.
// A trava esta AQUI, em codigo: qualquer sendMessage para o CHANNEL_ID e recusado
// a menos que venha marcado como uma tip legitima ({ allowChannel: true }).
// Nao confie so em configuracao — o chamador errado nunca alcanca o canal.
import { config } from '../config.js';

function apiUrl(method) {
  return `https://api.telegram.org/bot${config.botToken}/${method}`;
}

async function call(method, body) {
  const res = await fetch(apiUrl(method), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!data.ok) {
    throw new Error(`Telegram ${method} falhou: ${data.description || res.status}`);
  }
  return data.result;
}

// Guarda central: recusa qualquer envio ao canal que nao seja uma tip explicita.
function assertNotChannelLeak(chatId, { allowChannel = false } = {}) {
  const target = String(chatId);
  if (config.channelId && target === String(config.channelId) && !allowChannel) {
    throw new Error(
      'TRAVA DE CANAL: tentativa de enviar mensagem nao-tip ao canal dos clientes foi recusada. ' +
      'Somente postTip pode escrever no canal.'
    );
  }
}

// Envio generico. Bloqueado para o canal (a nao ser allowChannel).
export async function sendMessage(chatId, text, opts = {}) {
  assertNotChannelLeak(chatId, opts);
  const { allowChannel, ...rest } = opts;
  return call('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', ...rest });
}

// Posta uma tip no canal. Unico caminho autorizado a escrever la.
export async function postTipMessage(text, replyMarkup) {
  if (!config.channelId) throw new Error('CHANNEL_ID nao configurado');
  return call('sendMessage', {
    chat_id: config.channelId,
    text,
    parse_mode: 'HTML',
    reply_markup: replyMarkup,
  });
}

// Posta uma tip COM imagem (foto + legenda + botoes). `photo` e um file_id do
// Telegram (reaproveitado da foto que o admin enviou) ou uma URL de imagem.
export async function postTipPhoto(photo, caption, replyMarkup) {
  if (!config.channelId) throw new Error('CHANNEL_ID nao configurado');
  return call('sendPhoto', {
    chat_id: config.channelId,
    photo,
    caption,
    parse_mode: 'HTML',
    reply_markup: replyMarkup,
  });
}

// Resposta individual ao clique (armadilha 2): so aquele usuario enxerga.
export async function answerCallbackQuery(callbackQueryId, text, { alert = true } = {}) {
  return call('answerCallbackQuery', {
    callback_query_id: callbackQueryId,
    text,
    show_alert: alert,
  });
}

export async function getUpdates(offset, timeout = 25) {
  // 'message' cobre os comandos privados do admin (/tip); 'callback_query' os cliques.
  return call('getUpdates', { offset, timeout, allowed_updates: ['callback_query', 'message'] });
}

export { call as rawCall };
