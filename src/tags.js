// Classificacao das apostas para a aba de Analise. Como o "mercado" e texto livre,
// aqui a gente extrai tags estruturadas (escopo, tipo, unidade, linha, time) por
// heuristica — o tipster confirma/corrige no dashboard. `liga` nao vem do texto
// (nao e capturada hoje), entao fica pro tipster preencher.

const ESCOPOS = ['time', 'jogo'];
const TIPOS = ['under', 'over', 'handicap', 'outros'];
const UNIDADES = ['cartoes', 'gols', 'escanteios', 'outros'];

export const TAG_OPCOES = { escopos: ESCOPOS, tipos: TIPOS, unidades: UNIDADES };

function norm(s) {
  return String(s ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

// True se o texto do mercado menciona o time (tolera truncamento, ex.: "Phi" ~ "Philadelphia").
export function textMentionsTeam(text, name) {
  if (!name) return false;
  const t = norm(text).replace(/[^a-z0-9\s]/g, ' ');
  const words = t.split(/\s+/).filter((w) => w.length >= 3);
  const teamJoined = norm(name).replace(/[^a-z0-9]/g, '');
  if (teamJoined.length < 3) return false; // nomes curtos demais dao falso-positivo
  for (const w of words) {
    if (teamJoined.includes(w)) return true;              // "santos" dentro de "santos"
    if (teamJoined.startsWith(w)) return true;            // prefixo completo
    if (w.length >= 3 && teamJoined.startsWith(w.slice(0, 4))) return true; // "phil" ~ "philadelphia"
    if (w.startsWith(teamJoined.slice(0, 3))) return true; // "phi" (texto) ~ "phi"(time truncado)
  }
  return false;
}

// Sugere tags a partir dos campos livres da tip. Nunca preenche liga.
export function suggestTags(tip) {
  const raw = `${tip.market || ''} ${tip.side || ''} ${tip.line || ''}`;
  const t = norm(raw);

  let unidade = null;
  if (/cart/.test(t)) unidade = 'cartoes';
  else if (/escanteio|corner|scanteio/.test(t)) unidade = 'escanteios';
  else if (/gol|goal|\bft\b|ambas marcam|btts/.test(t)) unidade = 'gols';

  let tipo = null;
  if (/handicap|asiatic|\bah\b|hand\b/.test(t)) tipo = 'handicap';
  else if (/over|mais de|acima|\bmais\b|\+\d|\bo\b/.test(t)) tipo = 'over';
  else if (/under|menos de|abaixo|\bmenos\b|\bu\b/.test(t)) tipo = 'under';

  const mLinha = raw.match(/[+-]?\d+(?:[.,]\d+)?/);
  const linha = mLinha ? Number(mLinha[0].replace(',', '.')) : null;

  let time = null; let escopo = 'jogo';
  for (const nm of [tip.home, tip.away]) {
    if (textMentionsTeam(raw, nm)) { time = nm; escopo = 'time'; break; }
  }

  return {
    escopo,
    tipo,
    unidade,
    linha: Number.isFinite(linha) ? linha : null,
    time,
    liga: null,
  };
}

// Sanitiza tags vindas do dashboard: so aceita valores conhecidos; normaliza a linha.
export function cleanTags(tags = {}) {
  const rawLinha = tags.linha;
  const linha = rawLinha === '' || rawLinha == null ? null : Number(String(rawLinha).replace(',', '.'));
  return {
    escopo: ESCOPOS.includes(tags.escopo) ? tags.escopo : null,
    tipo: TIPOS.includes(tags.tipo) ? tags.tipo : null,
    unidade: UNIDADES.includes(tags.unidade) ? tags.unidade : null,
    linha: Number.isFinite(linha) ? linha : null,
    time: tags.time ? String(tags.time).trim() : null,
    liga: tags.liga ? String(tags.liga).trim() : null,
  };
}
