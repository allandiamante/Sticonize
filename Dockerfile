# syntax=docker/dockerfile:1

FROM node:22-alpine AS build
WORKDIR /app
# Lockfile before the code: npm ci only re-runs when the dependencies change.
COPY package.json package-lock.json ./
# --include=dev: vite is a devDependency and Coolify can inject NODE_ENV=production into the build.
RUN npm ci --include=dev
COPY . .
RUN npm run build

# Unprivileged image: already runs as UID 101, no extra config needed.
FROM nginxinc/nginx-unprivileged:alpine
# 3000 is the port Coolify's proxy assumes by default. The base image's 8080 would
# need the port set by hand in the UI, so nginx is moved here instead.
EXPOSE 3000
COPY --from=build /app/dist /usr/share/nginx/html
COPY <<'EOF' /etc/nginx/conf.d/default.conf
server {
  listen 3000;
  root /usr/share/nginx/html;

  gzip on;
  gzip_min_length 1024;
  gzip_types text/css application/javascript image/svg+xml application/xml;

  # The app routes /vectorize itself, so a deep link or a refresh has to reach index.html
  # instead of 404ing on a file that was never built.
  location / { try_files $uri $uri/ /index.html; }

  # frame-ancestors is the only CSP directive <meta> ignores — it only works as a header.
  # The rest of the policy stays in index.html.
  add_header Content-Security-Policy "frame-ancestors 'none'" always;
  add_header X-Content-Type-Options nosniff always;

  # Vite assets have a hash in the name. index.html and friends stay on the default (no cache).
  # ponytail: `expires` only — an add_header here would cancel the two above by inheritance.
  location /assets/ { expires 1y; }
}
EOF
