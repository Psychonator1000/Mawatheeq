# Builds the Mawatheeq web app for this server (served from the site root) and serves it with Caddy,
# which also routes the API and PDF requests to the other services.
FROM node:22-alpine AS build
WORKDIR /app
RUN npm install -g pnpm@11.25.0 --no-fund --no-audit
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY scripts/copy-ocr-assets.mjs scripts/
RUN pnpm install --frozen-lockfile
COPY . .
ENV PAGES_BASE_PATH=/
RUN node scripts/build-pages.mjs

FROM caddy:2.8.4-alpine
COPY office-server/web/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist-pages /srv/app
COPY office-server/web/app-config.json /srv/app/app-config.json
