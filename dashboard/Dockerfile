FROM node:20-alpine AS builder

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install

COPY . .

# Accept build-time env vars so Vite bakes the correct API URLs into the bundle
ARG VITE_API_URL=http://localhost:8000
ARG VITE_GOVERNANCE_URL=http://localhost:4000
ARG VITE_DEMO_MODE=true
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_GOVERNANCE_URL=$VITE_GOVERNANCE_URL
ENV VITE_DEMO_MODE=$VITE_DEMO_MODE

# Build the production bundle
RUN npm run build

# Serve with a lightweight static server (no file-watchers, no EMFILE issues)
FROM node:20-alpine AS runner
WORKDIR /app
RUN npm install -g serve
COPY --from=builder /app/dist ./dist

EXPOSE 3000
CMD ["serve", "-s", "dist", "-l", "3000"]
