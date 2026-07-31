# Deploy no Railway (sempre ligado, HTTPS automatico, reimplanta sozinho)

Objetivo: subir servidor + bot uma vez e nunca mais rodar nada na sua maquina.
Este projeto ja vem pronto: `npm start` (via `src/index.js`) liga os dois no mesmo
processo, e o `Dockerfile` diz ao Railway como construir.

## Passo 0 — pre-requisitos

- Uma conta no GitHub (gratis).
- Uma conta no Railway (railway.app) — da pra entrar com o GitHub.
- O token do bot (BotFather) e o `CHANNEL_ID` do seu canal.

## Passo 1 — mandar o codigo pro GitHub

Na pasta do projeto (ja iniciei o git e fiz o primeiro commit por voce):

```bash
git remote add origin https://github.com/<SEU_USUARIO>/captura-reporte-clientes.git
git push -u origin main
```

(Crie o repositorio vazio antes em github.com → New repository, com o mesmo nome.)

## Passo 2 — criar o projeto no Railway

1. railway.app → **New Project** → **Deploy from GitHub repo** → escolha o repositorio.
2. O Railway detecta o `Dockerfile` e faz o build sozinho.

## Passo 3 — variaveis de ambiente

No servico criado → aba **Variables** → adicione:

| Variavel | Valor |
|---|---|
| `BOT_TOKEN` | o token do BotFather (segredo) |
| `BOT_USERNAME` | `StakingRDU_bot` |
| `MINI_APP_SHORT_NAME` | o short name que voce deu no `/newapp` (ex.: `app`) |
| `CHANNEL_ID` | id do seu canal (ex.: `-1001234567890`) |
| `STORE_FILE` | `/data/store.json` |
| `PUBLIC_URL` | **preencha no passo 5** (depois que o dominio existir) |

> **Nao** defina `PORT` — o Railway injeta sozinho e o app ja le essa variavel.

## Passo 4 — armazenamento que nao some

Aba **Settings** (ou **Volumes**) → **Add Volume** → mount path `/data`.
Assim o `store.json` sobrevive a deploys e restarts. (O `STORE_FILE` acima aponta pra ca.)

> Alternativa mais robusta: trocar o JSON por Postgres (o Railway oferece). Nesse
> caso eu escrevo o adaptador em `src/store/index.js`. Pra comecar, o volume basta.

## Passo 5 — pegar o dominio e fechar o circuito

1. Aba **Settings → Networking → Generate Domain**. Vai sair algo como
   `https://captura-reporte-clientes-production.up.railway.app`.
2. Cole esse endereco na variavel `PUBLIC_URL` (sem barra no fim) e deixe o Railway
   reimplantar.
3. Cole o **mesmo** endereco no BotFather: `/myapps` → seu app → **Edit Web App URL**
   (ou informe na pergunta "Web App URL" se ainda estiver no `/newapp`).

## Pronto

- O bot ja esta escutando os cliques (24/7).
- O Mini App abre em `https://<seu-dominio>/`.
- Publique uma tip pra testar (pode rodar da sua maquina, aponta pro mesmo bot/canal):

```bash
node bin/post-tip.js --file examples/tip.json
```

Daqui pra frente, todo `git push` reimplanta automaticamente. Voce nao roda mais nada localmente.

## Conferindo

- Aba **Deployments → Logs**: deve aparecer `subindo servidor + bot no mesmo processo`
  e `[server] ... ouvindo`.
- `https://<seu-dominio>/api/version` deve responder com a versao.
