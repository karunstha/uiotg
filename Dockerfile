# syntax=docker/dockerfile:1

# ---- build: compile TypeScript to dist/ ----
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

# ---- runtime ----
FROM node:24-bookworm-slim
ENV NODE_ENV=production \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    UIOTG_HTTP=1 \
    PORT=8080
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Headless Chromium (matching the installed Playwright version) plus its system
# libraries, and an emoji font. Set INSTALL_CJK_FONTS=1 to add Chinese/Japanese/Korean glyphs (~90 MB).
ARG INSTALL_CJK_FONTS=0
RUN npx playwright install --with-deps chromium-headless-shell \
 && apt-get update \
 && apt-get install -y --no-install-recommends fonts-noto-color-emoji \
 && if [ "$INSTALL_CJK_FONTS" = "1" ]; then apt-get install -y --no-install-recommends fonts-noto-cjk; fi \
 && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/dist ./dist
# Owned by the runtime user so a mounted volume here is writable.
RUN mkdir -p /tmp/uiotg-images /data/themes && chown node:node /tmp/uiotg-images /data/themes

USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["node", "dist/cli.js"]
# HTTP by default (UIOTG_HTTP=1). For stdio: docker run -i --rm -e UIOTG_HTTP=0 uiotg
CMD ["serve"]
