# ---------- build ----------
FROM node:22-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund || npm install --no-audit --no-fund

COPY . .
RUN npm run build

# ---------- runtime ----------
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# yt-dlp cần python; ffmpeg để dành cho các tác vụ remux sau này
RUN apk add --no-cache python3 ffmpeg ca-certificates \
    && ln -sf /usr/bin/python3 /usr/bin/python

# Bản build sẵn, không cần pip
ADD https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux /usr/local/bin/yt-dlp
RUN chmod +x /usr/local/bin/yt-dlp && yt-dlp --version

COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/public ./public

ENV YTDLP_PATH=/usr/local/bin/yt-dlp
ENV PORT=3000
EXPOSE 3000

CMD ["npm", "start"]
