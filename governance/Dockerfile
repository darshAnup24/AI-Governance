FROM node:20-slim

RUN apt-get update && apt-get install -y openssl curl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY prisma ./prisma/
RUN npx prisma generate

COPY . .

EXPOSE 4000

# Push schema to DB (idempotent) then start compiled server
CMD ["sh", "-c", "npx prisma db push --accept-data-loss && npx tsc && node dist/index.js"]
