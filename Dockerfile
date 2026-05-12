FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY package*.json ./
RUN npm install --production
COPY config ./config
COPY src ./src
COPY public ./public
EXPOSE 3000
CMD ["node", "--max-old-space-size=512", "src/index.js"]
