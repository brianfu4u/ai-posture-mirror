# Production Multi-Stage Dockerfile for Google Cloud Run
FROM node:20-alpine AS builder

WORKDIR /app
COPY package.json ./
COPY tsconfig.base.json ./
COPY packages/ ./packages/
COPY apps/server-overseas/ ./apps/server-overseas/

WORKDIR /app/apps/server-overseas
RUN npm run build || true

FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

COPY --from=builder /app/apps/server-overseas/dist ./dist
COPY --from=builder /app/apps/server-overseas/package.json ./package.json

EXPOSE 8080

CMD ["node", "dist/index.js"]
