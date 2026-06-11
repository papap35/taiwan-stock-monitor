FROM node:20-alpine

WORKDIR /app

RUN corepack enable && corepack prepare yarn@stable --activate

COPY backend/package.json backend/yarn.lock* ./
RUN yarn install --frozen-lockfile --production

COPY backend/src ./src

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://localhost:3001/health || exit 1

CMD ["node", "src/app.js"]
