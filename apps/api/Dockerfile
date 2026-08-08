# ─── Build stage ───
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json* ./
COPY prisma ./prisma/
RUN npm ci || npm install

COPY tsconfig.json ./
COPY src ./src/
RUN npx prisma generate
RUN npm run build

# ─── Production stage ───
FROM node:20-alpine AS production
WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

EXPOSE 3000

CMD ["node", "dist/main.js"]
