FROM node:20-alpine AS builder
WORKDIR /app/demo-ui
COPY demo-ui/package.json ./
COPY shared-ui/package.json ../shared-ui/package.json
RUN npm install && ln -sf /app/demo-ui/node_modules /app/node_modules
COPY demo-ui/ .
COPY shared-ui/ ../shared-ui/
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/demo-ui/dist /usr/share/nginx/html
COPY --from=builder /app/demo-ui/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 3001
CMD ["nginx", "-g", "daemon off;"]
