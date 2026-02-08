# Stage 1: Build client
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
COPY client/package.json client/
COPY server/package.json server/
RUN npm install
COPY . .
RUN npm run build -w client
RUN npm run build -w server

# Stage 2: Production
FROM node:20-alpine
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/server/package.json server/
COPY --from=build /app/server/dist server/dist/
COPY --from=build /app/client/dist client/dist/
COPY --from=build /app/node_modules node_modules/
COPY --from=build /app/server/node_modules server/node_modules/

ENV NODE_ENV=production
ENV PORT=3002
EXPOSE 3002

CMD ["node", "server/dist/index.js"]
