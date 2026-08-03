// Monta e publica a tip no canal com o teclado inline de tres botoes.
//
// Armadilha 2: os botoes pertencem a mensagem, nao ao cliente. Por isso:
//  - "Peguei" e "Nao peguei" sao botoes de callback (todos veem o mesmo teclado;
//    o retorno individual vem por answerCallbackQuery — um alerta so para quem clicou).
//  - "Peguei diferente" e um botao URL que abre o Mini App via deep-link, levando
//    a chave da aposta em startapp. (web_app inline nao e confiavel em canal.)
import { betKey, assertBetComplete } from './betkey.js';
import { config, miniAppLink } from './config.js';
import { postTipMessage } from './telegram/api.js';
import { getStore } from './store/index.js';
import { VERSION } from './version.js';

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// callback_data cabe em 64 bytes: "b|<acao>|<betKey>". acao: y=peguei, n=nao peguei.
export function encodeCb(acao, key) {
  return `b|${acao}|${key}`;
}
export function decodeCb(data) {
  const [tag, acao, key] = String(data).split('|');
  if (tag !== 'b' || !acao || !key) return null;
  return { acao, betKey: key };
}

export function buildTipMessage(bet) {
  const key = betKey(bet);
  const linhas = [
    `<b>${esc(bet.home)}</b> x <b>${esc(bet.away)}</b>`,
    `${esc(bet.market)} ${esc(bet.side)} ${esc(bet.line || '')}`.trim(),
    (bet.stakeUnits !== undefined && bet.stakeUnits !== null) ? `Stake: <b>${esc(bet.stakeUnits)}u</b>` : null,
    bet.odd ? `Odd divulgada: <b>@${esc(bet.odd)}</b>` : null,
    bet.kickoff ? `Apito: ${esc(new Date(bet.kickoff).toLocaleString('pt-BR'))}` : null,
    bet.note ? `\n${esc(bet.note)}` : null,
  ].filter(Boolean);

  const text = linhas.join('\n');

  const oddLabel = bet.odd ? `✅ Peguei @${bet.odd}` : '✅ Peguei';
  const replyMarkup = {
    inline_keyboard: [
      [
        { text: oddLabel, callback_data: encodeCb('y', key) },
        { text: '❌ Nao peguei', callback_data: encodeCb('n', key) },
      ],
      [
        { text: '✏️ Peguei diferente', url: miniAppLink(key) },
      ],
    ],
  };

  return { key, text, replyMarkup };
}

// Publica a tip: grava os metadados (kickoff, cap, atributos) e envia ao canal.
// O cap (teto por cliente) e passado por quem monta a tip; sem ele, o formulario
// falha fechado (armadilha 4).
export async function postTip(bet, { send = true } = {}) {
  assertBetComplete(bet);
  const { key, text, replyMarkup } = buildTipMessage(bet);

  // Persiste a tip ANTES de enviar: quando o cliente clicar, o metadado ja existe.
  getStore().putTip(key, {
    home: bet.home, away: bet.away, market: bet.market, side: bet.side, line: bet.line,
    date: bet.date, odd: bet.odd ?? null,
    stakeUnits: bet.stakeUnits ?? null,
    kickoff: bet.kickoff ?? null,
    capValue: bet.capValue ?? null,
    note: bet.note ?? null,
    version: VERSION,
  });

  let message = null;
  if (send) {
    message = await postTipMessage(text, replyMarkup);
  }
  return { betKey: key, link: miniAppLink(key), message, text, replyMarkup };
}
