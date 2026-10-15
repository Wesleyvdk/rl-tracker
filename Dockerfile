ARG BASE_IMAGE=oven/bun:1.3.8
FROM ${BASE_IMAGE}

WORKDIR /app

# Install Chromium + runtime libraries required by Puppeteer.
RUN if ! command -v chromium >/dev/null; then apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libexpat1 \
    libgbm1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxshmfence1 \
    libxss1 \
    libxtst6 \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*; fi

ENV NODE_ENV=production
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

RUN find /app -mindepth 1 -maxdepth 1 -exec rm -rf {} +
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

COPY . .

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s CMD ["bun", "run", "scripts/health.ts"]
CMD ["bun", "run", "start"]
