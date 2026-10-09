# Hosting uiotg

uiotg runs as a remote MCP server over **Streamable HTTP** at `POST /mcp`. It is stateless, so any container host works, and you can run several replicas behind a load balancer without sticky sessions.

| Endpoint | |
|---|---|
| `POST /mcp` | MCP (JSON responses). Requires `Authorization: Bearer $UIOTG_AUTH_TOKEN` when the token is set. |
| `GET /healthz` | Liveness: `{"ok":true,...}` |
| `GET /images/<file>` | Rendered images, when `UIOTG_PUBLIC_URL` is set. Names carry 96 random bits, and images expire after `UIOTG_IMAGE_TTL_HOURS` (default 24). |

**Sizing:** about 260 MB of memory when idle and warm. Each concurrent render adds roughly 50–150 MB, so give it 1–1.5 GB. Renders take about 100 ms warm, and the first one after start takes about 0.5 s.

## 1. Run it locally with Docker

```sh
cp .env.example .env
echo "UIOTG_AUTH_TOKEN=$(openssl rand -hex 32)" >> .env      # or edit .env by hand
docker compose up -d --build
curl localhost:8080/healthz
```

For stdio inside Docker (local MCP clients only), run `docker run -i --rm -e UIOTG_HTTP=0 uiotg:latest`.

## 2. Host it on a VPS with HTTPS (Docker Compose + Caddy)

On any Linux VPS with Docker (1 vCPU / 2 GB RAM is plenty):

1. Point a DNS record, e.g. `uiotg.example.com`, at the server.
2. Copy the repo to the server and create `.env`:
   ```sh
   UIOTG_AUTH_TOKEN=<openssl rand -hex 32>
   UIOTG_PUBLIC_URL=https://uiotg.example.com
   ```
3. Add a `Caddyfile` next to `docker-compose.yml`:
   ```
   uiotg.example.com {
       reverse_proxy uiotg:8080
   }
   ```
4. Add a `docker-compose.override.yml`. Caddy obtains TLS certificates automatically, and uiotg is no longer published directly:
   ```yaml
   services:
     uiotg:
       ports: !reset []
     caddy:
       image: caddy:2
       restart: unless-stopped
       ports: ["80:80", "443:443"]
       volumes:
         - ./Caddyfile:/etc/caddy/Caddyfile:ro
         - caddy-data:/data
   volumes:
     caddy-data:
   ```
5. Run `docker compose up -d --build`, then `curl https://uiotg.example.com/healthz`.

## 3. Or use a managed container platform

Build and push the image once:
```sh
docker build -t <registry>/uiotg:0.1.0 .
docker push <registry>/uiotg:0.1.0
```

- **Google Cloud Run:**
  ```sh
  gcloud run deploy uiotg --image <registry>/uiotg:0.1.0 --port 8080 --memory 2Gi --cpu 1 \
    --concurrency 8 --set-env-vars UIOTG_AUTH_TOKEN=<token> --allow-unauthenticated
  ```
  Cloud Run's own IAM is off, so the bearer token is the gate. Served image files live on the instance's disk and don't survive scale-to-zero, so either set `--min-instances 1` or rely on the inline image only.
- **Fly.io:** run `fly launch --no-deploy` (it detects the Dockerfile and internal port 8080), then:
  ```sh
  fly secrets set UIOTG_AUTH_TOKEN=<token> UIOTG_PUBLIC_URL=https://<app>.fly.dev
  fly scale memory 2048
  fly deploy
  ```
- **Railway / Render / Koyeb:** deploy from the repo (Dockerfile). Set `PORT` if the platform injects one, plus `UIOTG_AUTH_TOKEN` and `UIOTG_PUBLIC_URL`, and the health check path `/healthz`.

## 4. Connect clients

**Hermes Agent** (`~/.hermes/config.yaml`). The tools appear as `mcp_uiotg_render`, `mcp_uiotg_get_template` and `mcp_uiotg_list_templates`:
```yaml
mcp_servers:
  uiotg:
    url: "https://uiotg.example.com/mcp"
    headers:
      Authorization: "Bearer <token>"
    timeout: 120
```

**Claude Code:**
```sh
claude mcp add --transport http uiotg https://uiotg.example.com/mcp --header "Authorization: Bearer <token>"
```

**Clients that can't send headers:** use `https://uiotg.example.com/mcp?token=<token>`. Query strings can end up in proxy logs, so prefer the header when the client supports it.

## Configuration

| Variable | Default | |
|---|---|---|
| `UIOTG_AUTH_TOKEN` | unset | Bearer token for `/mcp`. **Always set it on a public host.** |
| `UIOTG_PUBLIC_URL` | unset | Enables `/images/…` and adds `URL: …` to every render result |
| `UIOTG_IMAGE_DIR` / `UIOTG_IMAGE_TTL_HOURS` | `/tmp/uiotg-images` / `24` | Image storage and expiry |
| `PORT` / `UIOTG_HOST` | `8080` / `0.0.0.0` | Listen address |
| `UIOTG_TOOLS` | `single` | `per-template` adds one typed tool per template |
| `UIOTG_THEME`, `UIOTG_SCALE`, `UIOTG_FORMAT` | `light`, `2`, `png` | Render defaults |
| `UIOTG_OFFLINE` | `0` | `1` blocks remote images, which then fall back to placeholders |

## Security notes

- Pages render with JavaScript disabled. The only network requests allowed are http(s) images, which means the server will fetch any image URL a caller passes. If it runs inside a private network, put it somewhere that can't reach internal services, or set `UIOTG_OFFLINE=1`.
- Image URLs are unguessable but not authenticated. Anyone you share a link with can view that image until it expires.
- The container runs as the unprivileged `node` user.
