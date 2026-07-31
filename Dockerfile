# Imagem de producao: sobe servidor + bot com "npm start" (src/index.js).
FROM node:24-alpine

WORKDIR /app

# Sem dependencias de runtime hoje; o passo fica pronto pra quando houver.
COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund || true

COPY . .

# Pasta de dados (montada como volume persistente no host).
RUN mkdir -p /data
ENV NODE_ENV=production
ENV STORE_FILE=/data/store.json

# A porta e definida pelo host via variavel PORT; o app a le em config.js.
CMD ["node", "src/index.js"]
