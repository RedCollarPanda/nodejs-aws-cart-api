FROM node:20-alpine AS builder

WORKDIR /app

# Copy manifests first so npm ci layer is cached independently of source changes
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build


FROM node:20-alpine AS production

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

EXPOSE 8080

ENV APP_PORT=8080 \
    NODE_ENV=production

CMD ["node", "dist/main"]
