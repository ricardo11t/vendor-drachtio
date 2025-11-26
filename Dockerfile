FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# ============================================================
# VARIÁVEIS INTERNAS (não mexer)
# ============================================================
ENV NODE_ENV=production
ENV DRACHTIO_HOST=drachtio
ENV DRACHTIO_PORT=9022
ENV DRACHTIO_SECRET=cymru
ENV REDIS_HOST=redis
ENV REDIS_PORT=6379
ENV LOGLEVEL=info

# ============================================================
# CONFIGURAR NO DOCKER-COMPOSE:
# - BACKEND_URL
# - API_KEY_SIP
# 
# TODO O RESTO VEM DA API!
# ============================================================

CMD ["npm", "start"]
