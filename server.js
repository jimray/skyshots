// Minimal zero-dependency static file server + same-origin image proxy.
//
// Why a proxy at all: cdn.bsky.app serves avatar/banner/post images without an
// Access-Control-Allow-Origin header. Loading them straight into an <img> works
// fine for *display*, but the moment that image is drawn into a <canvas> the
// canvas becomes "tainted" and toBlob()/toDataURL() throw a SecurityError - so
// exporting the generated screenshot as a PNG would be impossible. Proxying the
// bytes through this same-origin server sidesteps that: the browser sees the
// image as same-origin and never taints the canvas.
import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, "public");
const PORT = process.env.PORT || 8080;

// Only ever proxy bytes from Bluesky's own image/video CDN hosts. This is a
// public server-side fetch relay, so an allowlist keeps it from being usable
// as an open proxy for arbitrary URLs.
const ALLOWED_IMAGE_HOSTS = new Set(["cdn.bsky.app", "video.bsky.app"]);

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

async function serveStatic(req, res) {
  const requestPath = decodeURIComponent(req.url.split("?")[0]);
  let filePath = path.join(PUBLIC_DIR, requestPath === "/" ? "/index.html" : requestPath);

  // Prevent path traversal outside of PUBLIC_DIR.
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403).end("Forbidden");
    return;
  }

  try {
    const info = await stat(filePath);
    if (info.isDirectory()) {
      filePath = path.join(filePath, "index.html");
    }
    const body = await readFile(filePath);
    const ext = path.extname(filePath);
    res.writeHead(200, {
      "content-type": MIME_TYPES[ext] || "application/octet-stream",
      "cache-control": ext === ".html" ? "no-cache" : "public, max-age=3600",
    });
    res.end(body);
  } catch {
    res.writeHead(404).end("Not found");
  }
}

async function proxyImage(req, res, targetUrl) {
  let parsed;
  try {
    parsed = new URL(targetUrl);
  } catch {
    res.writeHead(400).end("Invalid url parameter");
    return;
  }

  if (parsed.protocol !== "https:" || !ALLOWED_IMAGE_HOSTS.has(parsed.hostname)) {
    res.writeHead(400).end("Host not allowed");
    return;
  }

  try {
    const upstream = await fetch(parsed, {
      headers: { accept: "image/*" },
      signal: AbortSignal.timeout(15_000),
    });

    if (!upstream.ok) {
      res.writeHead(upstream.status).end("Upstream error");
      return;
    }

    const contentType = upstream.headers.get("content-type") || "application/octet-stream";
    res.writeHead(200, {
      "content-type": contentType,
      "cache-control": "public, max-age=86400",
    });
    res.end(Buffer.from(await upstream.arrayBuffer()));
  } catch (err) {
    res.writeHead(502).end(`Proxy fetch failed: ${err.message}`);
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === "/api/image") {
    const target = url.searchParams.get("url");
    if (!target) {
      res.writeHead(400).end("Missing url parameter");
      return;
    }
    await proxyImage(req, res, target);
    return;
  }

  await serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`Bluesky post screenshots app running at http://localhost:${PORT}`);
});
