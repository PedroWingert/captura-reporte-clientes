import crypto from 'node:crypto';

// Gera um initData assinado igual ao do Telegram, para os testes.
export function makeInitData({ botToken, user, authDate, startParam, queryId = 'AAA' }) {
  const params = new URLSearchParams();
  params.set('auth_date', String(authDate));
  if (user) params.set('user', JSON.stringify(user));
  if (startParam) params.set('start_param', startParam);
  params.set('query_id', queryId);

  const pairs = [];
  for (const [k, v] of params.entries()) pairs.push(`${k}=${v}`);
  pairs.sort();
  const dcs = pairs.join('\n');

  const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hash = crypto.createHmac('sha256', secret).update(dcs).digest('hex');
  params.set('hash', hash);
  return params.toString();
}
