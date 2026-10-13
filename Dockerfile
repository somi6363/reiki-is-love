# Production image for Reiki is Love.
#
# Two stages: build the Nuxt/Nitro app with devDependencies, then copy only
# the self-contained .output plus the seed scripts into a slim runtime image.
# The seeds stay because a fresh container has no database: the entrypoint
# creates and seeds one on first boot (SQLite file, WAL).

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci --legacy-peer-deps
COPY . .
RUN npm run build

FROM node:22-alpine
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8080 \
    DATABASE_PATH=/app/data/app.db
WORKDIR /app
COPY --from=build /app/.output ./.output
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/server/db/schema.sql ./server/db/schema.sql
COPY docker-entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh
EXPOSE 8080
ENTRYPOINT ["entrypoint.sh"]
