
FROM node:24.22.0-bookworm-slim AS test

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci

COPY src ./src
COPY tests ./tests

RUN node --test tests/scheduler.test.js && touch /test-passed

FROM node:24.22.0-bookworm-slim AS runtime

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci --omit=dev

COPY server.js ./
COPY src ./src
COPY --from=test /test-passed /tmp/test-passed

RUN rm /tmp/test-passed

ENV NODE_ENV=production
ENV PORT=8080
ENV APP_NAME=Planora

USER node

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s \
  CMD node -e "fetch('http://127.0.0.1:8080/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "server.js"]
