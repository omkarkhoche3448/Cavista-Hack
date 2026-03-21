FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json /app/
RUN npm ci

COPY index.html vite.config.js eslint.config.js components.json jsconfig.json /app/
COPY public /app/public
COPY src /app/src

RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
