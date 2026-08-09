# syntax=docker/dockerfile:1

FROM node:22-alpine AS build
WORKDIR /app
# lockfile antes do código: npm ci só refaz quando as dependências mudam.
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Imagem unprivileged: já roda como UID 101 e escuta em 8080, sem config extra.
FROM nginxinc/nginx-unprivileged:alpine
# Explicit so the reverse proxy autodetects the port instead of assuming 3000.
EXPOSE 8080
COPY --from=build /app/dist /usr/share/nginx/html
COPY <<'EOF' /etc/nginx/conf.d/default.conf
server {
  listen 8080;
  root /usr/share/nginx/html;

  gzip on;
  gzip_min_length 1024;
  gzip_types text/css application/javascript image/svg+xml application/xml;

  # frame-ancestors é a única diretiva de CSP que <meta> ignora — só vale por header.
  # O resto da política continua no index.html.
  add_header Content-Security-Policy "frame-ancestors 'none'" always;
  add_header X-Content-Type-Options nosniff always;

  # Assets do Vite têm hash no nome. index.html e afins ficam no default (sem cache).
  # ponytail: só `expires` — um add_header aqui cancelaria os dois de cima por herança.
  location /assets/ { expires 1y; }
}
EOF
