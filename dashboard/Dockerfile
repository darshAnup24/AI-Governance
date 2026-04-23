FROM node:20-alpine as build

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .

# Dev stage: just run the dev server
FROM node:20-alpine as dev
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev"]
