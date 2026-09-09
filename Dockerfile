FROM node:20-bookworm-slim AS build

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma
RUN npm ci
RUN npx prisma generate

COPY nest-cli.json tsconfig*.json ./
COPY src ./src
RUN npm run build

FROM node:20-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev && npx prisma generate

COPY --from=build /app/dist ./dist
RUN mkdir -p /app/uploads/payment-proofs

EXPOSE 4000
VOLUME ["/app/uploads"]

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
