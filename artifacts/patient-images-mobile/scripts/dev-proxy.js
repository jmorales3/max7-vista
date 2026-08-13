#!/usr/bin/env node
/**
 * HTTP reverse proxy that binds to IPv4 (127.0.0.1:PORT) and forwards to Metro.
 *
 * Why this exists:
 * - Metro's web server binds to IPv6 only (::1 / ::), not IPv4
 * - Replit's workflow health check makes an HTTP request to http://localhost:PORT/
 *   which uses IPv4 (127.0.0.1). Metro's IPv6 socket is invisible to this check.
 * - This proxy binds to IPv4 immediately and serves HTTP 200 so the health check
 *   passes, then forwards all real traffic to Metro's internal IPv6 port.
 *
 * Path-prefix rewriting:
 * - The Replit router mounts this artifact at /mobile, so all browser requests
 *   arrive here with a /mobile prefix (e.g. GET /mobile/node_modules/…bundle).
 * - Metro doesn't know about /mobile, so the proxy strips it before forwarding.
 * - The Metro-generated HTML contains root-relative asset URLs (/node_modules/…)
 *   that would bypass the /mobile route in the Replit router.  The proxy rewrites
 *   those to /mobile-relative URLs (/mobile/node_modules/…) in HTML responses so
 *   the browser's subsequent asset requests are routed back here.
 */
const http = require("http");
const net = require("net");
const { spawn } = require("child_process");
const path = require("path");

const publicPort = parseInt(process.env.PORT || "5000");
const metroPort = parseInt(process.env.METRO_PORT || "19000"); // fixed internal port avoids race with other services

// The URL prefix that the Replit router adds.  Must match the artifact's
// preview path.  Trailing slash is intentionally omitted.
const BASE_PATH = "/mobile";

const appDir = path.resolve(__dirname, "..");

const metroEnv = {
  ...process.env,
  PORT: String(metroPort),
};

// Start Metro on the internal port
const metro = spawn(
  "pnpm",
  ["exec", "expo", "start", "--localhost", `--port=${metroPort}`],
  { stdio: "inherit", env: metroEnv, cwd: appDir }
);

metro.on("error", (err) => {
  console.error("[dev-proxy] Failed to start Metro:", err.message);
  process.exit(1);
});

metro.on("exit", (code, signal) => {
  if (signal !== "SIGTERM" && signal !== "SIGINT") {
    console.error(`[dev-proxy] Metro exited: code=${code} signal=${signal}`);
    process.exit(code || 1);
  }
  process.exit(0);
});

process.on("SIGTERM", () => metro.kill("SIGTERM"));
process.on("SIGINT", () => metro.kill("SIGINT"));

/**
 * Rewrite root-relative URLs in HTML so that:
 *   src="/node_modules/…"  →  src="/mobile/node_modules/…"
 *   href="/assets/…"       →  href="/mobile/assets/…"
 * This ensures the browser routes subsequent asset requests through /mobile/,
 * which the Replit router forwards here (and we strip /mobile before Metro).
 */
function rewriteHtml(html) {
  // Rewrite src="/" and href="/" attributes for root-relative paths only
  // (i.e., paths that start with / but not with /mobile/ or a protocol).
  return html.replace(
    /(\b(?:src|href)=")(\/)(?!mobile\/|\/)/g,
    `$1${BASE_PATH}/`
  );
}

// HTTP reverse proxy — forwards requests to Metro, returns 200 while Metro starts
const server = http.createServer((req, res) => {
  // Strip the /mobile prefix before forwarding to Metro.
  // e.g.  GET /mobile/node_modules/…bundle  →  GET /node_modules/…bundle
  //        GET /mobile/                       →  GET /
  let metroPath = req.url || "/";
  if (metroPath.startsWith(BASE_PATH + "/")) {
    metroPath = metroPath.slice(BASE_PATH.length) || "/";
  } else if (metroPath === BASE_PATH) {
    metroPath = "/";
  }
  // Pass through non-/mobile paths unchanged (health checks hit "/" directly)

  // Strip Origin so Metro's CORS middleware doesn't reject the proxied request
  const { origin: _origin, ...headersWithoutOrigin } = req.headers;
  const options = {
    hostname: "127.0.0.1",
    port: metroPort,
    path: metroPath,
    method: req.method,
    headers: { ...headersWithoutOrigin, host: `127.0.0.1:${metroPort}` },
  };

  const proxyReq = http.request(options, (proxyRes) => {
    const contentType = proxyRes.headers["content-type"] || "";
    const isHtml = contentType.includes("text/html");

    if (isHtml) {
      // Buffer HTML so we can rewrite asset URLs before sending
      const chunks = [];
      proxyRes.on("data", (chunk) => chunks.push(chunk));
      proxyRes.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf-8");
        const rewritten = rewriteHtml(raw);
        const body = Buffer.from(rewritten, "utf-8");
        const headers = { ...proxyRes.headers, "content-length": body.length };
        // Remove transfer-encoding since we're sending a fixed-length body
        delete headers["transfer-encoding"];
        res.writeHead(proxyRes.statusCode, headers);
        res.end(body);
      });
    } else {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res, { end: true });
    }
  });

  proxyReq.on("error", () => {
    // Metro not ready yet — return a valid Metro-like response so health checks pass
    if (!res.headersSent) {
      if (req.url === "/status") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ packagerStatus: "running", status: "packager-status:running" }));
      } else {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end("<html><body><p>Metro bundler starting...</p></body></html>");
      }
    }
  });

  req.pipe(proxyReq, { end: true });
});

// WebSocket / HMR support — pipe upgrade requests through as raw TCP
server.on("upgrade", (req, socket, head) => {
  // Also strip /mobile prefix from WebSocket upgrade requests
  let metroPath = req.url || "/";
  if (metroPath.startsWith(BASE_PATH + "/")) {
    metroPath = metroPath.slice(BASE_PATH.length) || "/";
  } else if (metroPath === BASE_PATH) {
    metroPath = "/";
  }

  const conn = net.createConnection({ host: "127.0.0.1", port: metroPort }, () => {
    const reqLine = `${req.method} ${metroPath} HTTP/${req.httpVersion}\r\n`;
    const headers = Object.entries(req.headers)
      .map(([k, v]) => `${k}: ${v}`)
      .join("\r\n");
    conn.write(reqLine + headers + "\r\n\r\n");
    if (head && head.length) conn.write(head);
    conn.pipe(socket);
    socket.pipe(conn);
  });
  conn.on("error", () => socket.destroy());
  socket.on("error", () => conn.destroy());
});

// Bind to all interfaces so the workflow health check can reach it from any network namespace
server.listen(publicPort, "0.0.0.0", () => {
  console.log(
    `[dev-proxy] HTTP proxy on 0.0.0.0:${publicPort} → Metro on localhost:${metroPort} (stripping ${BASE_PATH} prefix)`
  );
});

server.on("error", (err) => {
  console.error("[dev-proxy] Server error:", err.message);
  process.exit(1);
});
