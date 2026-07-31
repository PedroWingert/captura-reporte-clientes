# Captura de reporte de clientes

Captura, **no momento da tip**, o que cada cliente efetivamente fez: pegou na odd
divulgada, não pegou, ou pegou diferente (outra odd / outro valor, possivelmente
dividido em mais de uma casa). Botões no canal do Telegram + um Mini App (formulário)
que abre dentro do Telegram.

Implementação de referência do briefing `capturareporteclientes.docx`. Roda com
**zero dependências de runtime** (só Node ≥ 18: `http`, `crypto` e `fetch` nativos).
O armazenamento é um arquivo JSON local atrás de uma interface — trocável por um
banco na nuvem sem mexer em quem chama.

---

## A estrutura

1. **O post com botões** (`src/tips.js`) — a tip vai ao canal com um teclado inline:
   - `✅ Peguei @<odd>` e `❌ Não peguei` são botões de *callback* (o bot grava com um toque).
   - `✏️ Peguei diferente` é um botão *URL* que abre o Mini App via deep-link, levando a chave da aposta em `startapp`.
2. **O formulário / Mini App** (`webapp/`) — página servida por `src/server.js`, abre dentro
   do Telegram já sabendo quem é o cliente e de qual tip se trata (pelo `initData` assinado).
3. **O armazenamento** (`src/store/`) — JSON local por padrão (`data/store.json`), com escrita
   atômica. Em produção, troque `src/store/index.js` por um adaptador de banco acessível pela
   internet, com sincronização para o ambiente próprio depois.

```
src/
  config.js            carregamento de .env + deep-link do Mini App
  version.js           carimbo de versão (armadilha 11)
  betkey.js            chave da aposta determinística (armadilha 8)
  gates.js             portão do apito + teto de valor, falhando fechado (armadilhas 3 e 4)
  service.js           gravação central (botão e formulário passam por aqui)
  report.js            relatório por tip (armadilha 6)
  tips.js              monta a mensagem + teclado, publica no canal (armadilha 2)
  server.js            serve o Mini App + API (/api/tip, /api/report)
  store/               interface de armazenamento (JsonStore local)
  telegram/
    initData.js        validação HMAC + timestamp + replay do Mini App (armadilha 1)
    api.js             Bot API via fetch, com a TRAVA DE CANAL (armadilha 10)
    bot.js             long polling dos cliques de botão
webapp/                index.html + app.js + styles.css (o Mini App)
bin/                   post-tip.js · report.js · purge-bet.js (armadilha 9)
test/                  testes das partes sensíveis
```

---

## Onde cada armadilha do briefing é tratada

| # | Armadilha | Onde |
|---|-----------|------|
| 1 | Autenticação é o ponto crítico (valide `initData` no servidor; trate replay) | `src/telegram/initData.js` — HMAC com `secret = HMAC("WebAppData", token)`, checa `auth_date` e marca cada hash como usado (uso único) |
| 2 | Botões pertencem à mensagem, não ao cliente | `src/tips.js` (callback para ✅/❌) + `src/telegram/api.js` `answerCallbackQuery` (alerta individual) |
| 3 | Feche a porta no apito, e falhe fechando | `src/gates.js` `kickoffGate` — sem horário → recusa |
| 4 | Teto no valor, também falhando fechado | `src/gates.js` `valueCapGate` — sem `capValue` → recusa |
| 5 | Toda recusa diz o que fazer | mensagens em `src/gates.js` e `src/server.js` trazem o próximo passo concreto |
| 6 | "Não peguei" ≠ "não respondeu" | `status:'declined'` é um registro; ausência de registro é `SEM_RESPOSTA` no `src/report.js` |
| 7 | Havendo duas portas, defina quem ganha | `src/store/jsonStore.js` `upsertReport` compara `actionTs` — entrega atrasada não vence |
| 8 | Chave da aposta determinística | `src/betkey.js` (hash dos atributos) + upsert por `(chave, cliente)` |
| 9 | Uma aposta vive em vários lugares | `bin/purge-bet.js` — comando único, com pré-visualização antes do `--confirm` |
| 10 | Nunca envie mensagem de sistema ao canal | `src/telegram/api.js` — trava em código recusa envio ao `CHANNEL_ID` sem `allowChannel` |
| 11 | Carimbo de versão visível | `VERSION` + rodapé do Mini App + logs e `/api/version` |

---

## Configuração

1. `cp .env.example .env` e preencha `BOT_TOKEN`, `BOT_USERNAME`, `MINI_APP_SHORT_NAME`,
   `CHANNEL_ID`, `PUBLIC_URL`.
2. No **BotFather**: crie o bot, depois `/newapp` para registrar o Mini App com o
   mesmo `MINI_APP_SHORT_NAME` e a URL pública (`PUBLIC_URL`).
3. O bot precisa ser **admin do canal** para postar.

> O Mini App roda no dispositivo do cliente, então o `PUBLIC_URL` tem que ser
> acessível pela internet (em produção, atrás de HTTPS). Para testar o formulário
> dentro do Telegram use um túnel (ex.: um serviço de tunelamento) apontando para
> a porta local.

## Uso

```bash
# 1. Publicar uma tip no canal (monta a mensagem, grava metadados, envia)
node bin/post-tip.js --home "Sao Paulo" --away Palmeiras --market 1x2 --side home \
  --date 2026-08-01 --odd 1.85 --kickoff "2026-08-01T21:30:00-03:00" --cap 500

#    ...ou a partir de um arquivo, e --dry para só pré-visualizar sem enviar:
node bin/post-tip.js --file tip.json --dry

# 2. Subir o servidor (serve o Mini App + API) e o bot (escuta os cliques)
node src/server.js
node src/telegram/bot.js

# 3. Relatório: o que cada cliente reportou por tip
node bin/report.js <betKey> --roster roster.json

# 4. Limpeza segura de uma aposta (pré-visualiza; só apaga com --confirm)
node bin/purge-bet.js <betKey>
node bin/purge-bet.js <betKey> --confirm
```

`--kickoff` e `--cap` são o que mantêm os portões *fechados por padrão*: sem eles,
o registro é recusado (por segurança), não liberado.

## Testes

```bash
node --test
```

Cobrem: determinismo da chave, validação/replay do `initData`, portões falhando
fechado, precedência por timestamp, idempotência do clique duplo, distinção
não-peguei/não-respondeu e a trava de canal.

---

## Como trabalhar (do briefing)

- Antes de afirmar como algo funciona, verifique no código e cite arquivo e linha.
- Ao medir algo, diga também o que a medição não alcança.
- Mensagem que o cliente lê se confere **renderizada**, não lendo a string no código.
- Nada de "provavelmente" em caminho que envolve dinheiro: ou está medido, ou está
  marcado como não verificado.

## Limites desta implementação (o que ela *não* alcança)

- O armazenamento JSON local é para desenvolvimento; não cobre concorrência real
  nem múltiplas instâncias. A parte "nuvem + sincronização" do briefing é
  representada pela interface em `src/store/`, mas o adaptador de nuvem ainda não
  está escrito — é o ponto de troca.
- O `capValue` (teto por cliente) é calculado por quem monta a tip e passado pronto;
  a fórmula (unidades da tip × valor da unidade de cada cliente) depende do cadastro
  de bancas, que fica fora deste escopo.
- O bot usa long polling (`getUpdates`); para produção com volume, considere webhook.
