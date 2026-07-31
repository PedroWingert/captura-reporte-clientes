// Armadilha 8: chave da aposta deterministica.
// Derive a chave dos atributos da aposta por hash. A mesma aposta -> a mesma chave.
// Isso permite upsert por (chave, cliente): clicar duas vezes nao cria duas linhas.
import crypto from 'node:crypto';

// Normaliza texto para que "Real Madrid " e "real madrid" produzam a mesma chave.
function norm(s) {
  return String(s ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // remove acentos (diacriticos combinantes)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// Campos que definem uma aposta, em ordem fixa (entram todos no hash).
const FIELDS = ['date', 'home', 'away', 'market', 'side', 'line'];

// Obrigatorios para uma tip valida. 'line' e opcional: mercados como 1x2 nao tem
// linha; handicap/over-under tem. Vazio entra no hash normalmente (deterministico).
const REQUIRED = ['date', 'home', 'away', 'market', 'side'];

export function betKey(bet) {
  const parts = FIELDS.map((f) => `${f}=${norm(bet[f])}`);
  const canonical = parts.join('|');
  const hash = crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
  return hash.slice(0, 12);
}

// Util para validar que todos os atributos necessarios existem antes de gerar a chave.
export function assertBetComplete(bet) {
  const faltando = REQUIRED.filter((f) => bet[f] === undefined || bet[f] === null || bet[f] === '');
  if (faltando.length) {
    throw new Error(`Aposta incompleta, faltam campos: ${faltando.join(', ')}`);
  }
}

export { FIELDS as BET_FIELDS };
