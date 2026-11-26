# Pillows Blast

Oishi-branded Tetris. Vite + TypeScript, Canvas board, zero runtime dependencies besides the pixel font.

    npm install && npm run dev      # local
    docker compose up --build       # container (nginx, port 80)

**Dokploy:** create a Docker Compose app from this repo, then in Domains point your domain to service `web`, port `80`.

**Controls:** ← → move · ↓ soft drop (faster fall) · ↑ / X rotate · Z rotate back · Space hard drop · C / Shift hold · P / Enter pause.
**Touch pad:** ◀ ▶ move, ▼ soft drop, ⇊ hard drop · ↻ rotate · ↶ rotate back · H hold · Ⅱ pause.

Art lives in `public/art/` (swap the PNGs to re-skin).
