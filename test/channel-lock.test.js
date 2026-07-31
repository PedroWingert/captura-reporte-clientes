import { test } from 'node:test';
import assert from 'node:assert/strict';

// Prepara o ambiente ANTES de importar config/api.
process.env.BOT_TOKEN = '123:TESTE';
process.env.CHANNEL_ID = '-1009999999999';

const { sendMessage } = await import('../src/telegram/api.js');

test('trava de canal: envio comum ao canal e recusado em codigo', async () => {
  await assert.rejects(
    () => sendMessage('-1009999999999', 'aviso de sistema'),
    /TRAVA DE CANAL/,
  );
});

test('trava de canal: envio a outro chat nao e bloqueado pela trava', async () => {
  // Vai falhar na chamada de rede (token falso), mas NAO pela trava de canal.
  await assert.rejects(
    () => sendMessage('42', 'ola'),
    (err) => !/TRAVA DE CANAL/.test(err.message),
  );
});
