# ---- Build ----
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
COPY shared/package.json ./shared/
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/

RUN npm ci

COPY shared ./shared
COPY backend ./backend
COPY frontend ./frontend

RUN npm run build --workspace=shared \
  && npm run build --workspace=frontend \
  && npm run build --workspace=backend

# ---- Production ----
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV SERVE_STATIC=true
ENV PORT=3001

RUN addgroup -S ucbs && adduser -S ucbs -G ucbs

COPY package.json package-lock.json ./
COPY shared/package.json ./shared/
COPY backend/package.json ./backend/

RUN npm ci --omit=dev --workspace=backend --workspace=shared && npm cache clean --force

COPY --from=builder /app/shared/dist ./shared/dist
COPY --from=builder /app/backend/dist ./backend/dist
COPY --from=builder /app/frontend/dist ./frontend/dist

WORKDIR /app/backend
USER ucbs

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3001/health || exit 1

CMD ["node", "dist/index.js"]
