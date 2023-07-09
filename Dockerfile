# Dockerfile
FROM node:18-alpine

WORKDIR /

COPY . .

RUN npm install

ENV MONGODB_URL=
ENV API_URL=
ENV API_KEY=
ENV SOLUN_ADMIN_PASSWORD=

CMD node index.js