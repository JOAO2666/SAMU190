FROM node:24-bookworm-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

ENV NODE_ENV=production
ENV PORT=7860

RUN npm run build

EXPOSE 7860

CMD ["npm", "run", "start"]
