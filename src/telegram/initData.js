// Armadilha 1: a autenticacao e o ponto critico.
// O Telegram entrega ao Mini App um pacote assinado (initData) com HMAC derivado
// do token do bot. Validamos SEMPRE no servidor. Sem isso, qualquer um forja a
// identidade de qualquer cliente.
//
// Alem da assinatura, tratamos o timestamp (auth_date): o pacote e replayavel
// dentro da janela de validade, entao rejeitamos pacotes velhos e marcamos cada
// hash como usado (uso unico) via store.markAuthSeen.
import crypto from 'node:crypto';

// Compara duas strings hex em tempo constante.
function safeEqualHex(a, b) {
  try {
    const ba = Buffer.from(a, 'hex');
    const bb = Buffer.from(b, 'hex');
    if (ba.length !== bb.length) return false;
    return crypto.timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

// Valida o initData. Retorna { ok, user, authDate, hash } ou { ok:false, error }.
// `store` e opcional; se fornecido, aplica protecao contra replay (uso unico).
export function validateInitData(initData, { botToken, maxAgeSeconds = 86400, store = null, now = Date.now() } = {}) {
  if (!initData || typeof initData !== 'string') {
    return { ok: false, error: 'initData ausente' };
  }
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return { ok: false, error: 'initData sem hash' };

  // Monta o data_check_string: pares "chave=valor" (menos hash), ordenados, com \n.
  const pairs = [];
  for (const [k, v] of params.entries()) {
    if (k === 'hash') continue;
    pairs.push(`${k}=${v}`);
  }
  pairs.sort();
  const dataCheckString = pairs.join('\n');

  // secret_key = HMAC-SHA256(key="WebAppData", msg=botToken)
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  // hash calculado = HMAC-SHA256(key=secret_key, msg=data_check_string)
  const calc = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  if (!safeEqualHex(calc, hash)) {
    return { ok: false, error: 'assinatura invalida' };
  }

  // Timestamp: rejeita pacote fora da janela.
  const authDate = Number(params.get('auth_date') || 0);
  if (!authDate) return { ok: false, error: 'auth_date ausente' };
  const ageSeconds = Math.floor(now / 1000) - authDate;
  if (ageSeconds > maxAgeSeconds) {
    return { ok: false, error: 'initData expirado' };
  }
  if (ageSeconds < -60) {
    // auth_date no futuro alem de uma folga pequena de relogio.
    return { ok: false, error: 'auth_date no futuro' };
  }

  // Replay: cada hash so vale uma vez.
  if (store) {
    const seen = store.markAuthSeen(hash, authDate);
    if (seen) return { ok: false, error: 'initData ja usado (replay)' };
  }

  let user = null;
  const userRaw = params.get('user');
  if (userRaw) {
    try { user = JSON.parse(userRaw); } catch { /* ignora user malformado */ }
  }

  return {
    ok: true,
    user,
    authDate,
    hash,
    startParam: params.get('start_param') || null,
  };
}
