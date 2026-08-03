// Publicacao de tips pelo proprio Telegram: o admin manda /tip numa conversa
// privada com o bot, e o bot publica no canal com os botoes.
//
// Seguranca: so ids em ADMIN_IDS podem publicar, e so em chat privado. O bot
// nunca reage no canal (a trava de canal em api.js e a barreira final).
import { config } from '../config.js';
import { postTip } from '../tips.js';
import { sendMessage } from './api.js';

const HELP = [
  'Para publicar uma tip no canal, mande assim (um campo por linha):',
  '',
  '/tip',
  'times: Sao Paulo x Palmeiras',
  'mercado: Over 2.5 gols',
  'odd: 1.95',
  'apito: 21:30',
  'cap: 500',
  '',
  'Opcionais: data (padrao hoje), linha, lado, obs.',
  'Sem apito ou sem cap eu recuso: sao eles que travam o registro depois do jogo e acima do limite.',
].join('\n');

// Remove acentos e baixa a caixa, para casar chaves escritas de qualquer jeito.
function normKey(s) {
  return String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

function num(v) {
  if (v === undefined || v === null || v === '') return NaN;
  return Number(String(v).replace(',', '.'));
}

// Data de hoje no fuso do Brasil, no formato YYYY-MM-DD.
function hojeBR() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

// Monta o horario do apito. Aceita "HH:MM" (usa a data) ou uma data/hora completa.
function montaApito(raw, date) {
  if (!raw) return null;
  const t = String(raw).trim();
  const so_hora = t.match(/^(\d{1,2}):(\d{2})$/);
  if (so_hora) {
    const hh = so_hora[1].padStart(2, '0');
    return `${date}T${hh}:${so_hora[2]}:00${config.tzOffset}`;
  }
  const d = new Date(t);
  if (!Number.isNaN(d.getTime())) return d.toISOString();
  return null; // invalido -> tratado como faltando (falha fechado)
}

const ALIAS = {
  times: ['times', 'jogo', 'partida', 'confronto'],
  date: ['data', 'dia'],
  market: ['mercado', 'market', 'aposta'],
  line: ['linha', 'line'],
  side: ['lado', 'side'],
  odd: ['odd', 'cotacao', 'cot'],
  kickoff: ['apito', 'kickoff', 'horario', 'hora', 'inicio'],
  cap: ['cap', 'teto', 'limite'],
  note: ['obs', 'nota', 'note', 'observacao'],
};

function pick(fields, canonical) {
  for (const k of ALIAS[canonical]) if (fields[k] !== undefined) return fields[k];
  return undefined;
}

// Faz o parse do texto do /tip. Retorna { ok, bet } ou { ok:false, error }.
export function parseTipCommand(text) {
  const body = String(text).replace(/^\/tip\b/i, '').trim();
  if (!body) return { ok: false, error: 'Faltou o conteudo da tip.' };

  const fields = {};
  for (const line of body.split(/\r?\n/)) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = normKey(line.slice(0, idx));
    const val = line.slice(idx + 1).trim();
    if (val) fields[key] = val;
  }

  const times = pick(fields, 'times');
  let home, away;
  if (times) {
    const parts = times.split(/\s+(?:x|vs|×)\s+/i);
    if (parts.length >= 2) { home = parts[0].trim(); away = parts.slice(1).join(' x ').trim(); }
  }

  const date = pick(fields, 'date') || hojeBR();
  const market = pick(fields, 'market');
  const line = pick(fields, 'line') || '';
  const side = pick(fields, 'side') || '';
  const odd = num(pick(fields, 'odd'));
  const cap = num(pick(fields, 'cap'));
  const kickoff = montaApito(pick(fields, 'kickoff'), date);
  const note = pick(fields, 'note') || null;

  const faltando = [];
  if (!home || !away) faltando.push('times (ex.: Sao Paulo x Palmeiras)');
  if (!market) faltando.push('mercado');
  if (Number.isNaN(odd) || odd <= 1) faltando.push('odd (numero maior que 1)');
  if (!kickoff) faltando.push('apito (horario do jogo, ex.: 21:30)');
  if (Number.isNaN(cap) || cap <= 0) faltando.push('cap (teto de valor, numero maior que 0)');
  if (faltando.length) return { ok: false, error: 'Faltou/invalido: ' + faltando.join('; ') };

  return { ok: true, bet: { date, home, away, market, side, line, odd, kickoff, capValue: cap, note } };
}

// Escapa para HTML (parse_mode das respostas).
function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Handler de uma mensagem recebida. So age em chat privado de um admin.
export async function handleMessage(msg) {
  const text = (msg.text || '').trim();
  if (!text) return;
  if (msg.chat?.type !== 'private') return; // nunca reage em canal/grupo

  const chatId = msg.chat.id;
  const fromId = String(msg.from?.id || '');

  // Autorizacao. Se ninguem foi configurado ainda, ajuda no bootstrap mostrando o id.
  if (!config.adminIds.includes(fromId)) {
    await sendMessage(chatId, `Voce nao esta autorizado a publicar tips.\nSeu id do Telegram e: <code>${esc(fromId)}</code>\nPeca para adiciona-lo em ADMIN_IDS.`);
    return;
  }

  if (/^\/start\b/i.test(text)) {
    await sendMessage(chatId, `Bot de captura ativo. Seu id de admin: <code>${esc(fromId)}</code>\n\n${esc(HELP)}`);
    return;
  }
  if (/^\/(ajuda|help)\b/i.test(text)) {
    await sendMessage(chatId, esc(HELP));
    return;
  }
  if (!/^\/tip\b/i.test(text)) {
    await sendMessage(chatId, 'Comando nao reconhecido. Use /tip para publicar, ou /ajuda para ver o modelo.');
    return;
  }

  const parsed = parseTipCommand(text);
  if (!parsed.ok) {
    await sendMessage(chatId, `❌ ${esc(parsed.error)}\n\n${esc(HELP)}`);
    return;
  }

  try {
    const out = await postTip(parsed.bet, { send: true });
    await sendMessage(
      chatId,
      `✅ Tip publicada no canal.\nChave: <code>${esc(out.betKey)}</code>\nFormulario "peguei diferente": ${esc(out.link)}`,
    );
  } catch (err) {
    await sendMessage(chatId, `❌ Nao consegui publicar: ${esc(err.message)}`);
  }
}

export { HELP };
