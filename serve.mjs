// Tiny local server for the Pathfinder prototype. No dependencies; needs Node 18+.
//
//   node serve.mjs            -> http://localhost:4173
//
// It serves pathfinder.html and forwards /yoma-api/* to the public Yoma API. The forwarding is
// needed because api.yoma.world only accepts browser requests from https://yoma.world (CORS),
// so a page opened from a file or from localhost cannot call it directly.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PORT = Number(process.env.PORT) || 4173;
const UPSTREAM = (process.env.YOMA_UPSTREAM || "https://api.yoma.world/api/v3").replace(/\/$/, "");
const HTML = join(dirname(fileURLToPath(import.meta.url)), "pathfinder.html");
// Only the read-only public endpoints Pathfinder uses are forwarded.
const ALLOWED = [/^\/opportunity\/search(\/filter\/[a-z]+)?$/i, /^\/opportunity\/[0-9a-f-]{36}\/info$/i, /^\/analytics\/platform\/metrics\/info$/i];

createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  try {
    if (url.pathname.startsWith("/yoma-api/")) {
      const path = url.pathname.slice("/yoma-api".length);
      if (!ALLOWED.some((re) => re.test(path)) || !["GET", "POST"].includes(req.method)) {
        res.writeHead(404).end("Not proxied");
        return;
      }
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const upstream = await fetch(UPSTREAM + path + url.search, {
        method: req.method,
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: req.method === "POST" ? Buffer.concat(chunks) : undefined,
      });
      res.writeHead(upstream.status, { "Content-Type": upstream.headers.get("content-type") || "application/json" });
      res.end(Buffer.from(await upstream.arrayBuffer()));
      return;
    }
    if (url.pathname === "/" || url.pathname === "/pathfinder.html") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(await readFile(HTML));
      return;
    }
    res.writeHead(404).end("Not found");
  } catch (e) {
    res.writeHead(502, { "Content-Type": "text/plain" }).end("Could not reach Yoma: " + e.message);
  }
}).listen(PORT, () => console.log(`Pathfinder running at http://localhost:${PORT} (Yoma API: ${UPSTREAM})`));
