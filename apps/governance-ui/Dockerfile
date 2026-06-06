FROM node:20-alpine AS builder
WORKDIR /app/governance-ui
COPY governance-ui/package.json ./
COPY shared-ui/package.json ../shared-ui/package.json
RUN npm install && ln -sf /app/governance-ui/node_modules /app/node_modules
COPY governance-ui/ .
COPY shared-ui/ ../shared-ui/
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/governance-ui/dist /usr/share/nginx/html
COPY --from=builder /app/governance-ui/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 3000
CMD ["nginx", "-g", "daemon off;"]
