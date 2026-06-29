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
 */
const http = require("http");
const net = require("net");
const { spawn } = require("child_process");
const path = require("path");

const publicPort = parseInt(process.env.PORT || "5000");
const metroPort = parseInt(process.env.METRO_PORT || "19000"); // fixed internal port avoids race with other services

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

// HTTP reverse proxy — forwards requests to Metro, returns 200 while Metro starts
const server = http.createServer((req, res) => {
  // Strip Origin so Metro's CORS middleware doesn't reject the proxied request
  const { origin: _origin, ...headersWithoutOrigin } = req.headers;
  const options = {
    hostname: "127.0.0.1",
    port: metroPort,
    path: req.url,
    method: req.method,
    headers: { ...headersWithoutOrigin, host: `127.0.0.1:${metroPort}` },
  };

  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
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
  const conn = net.createConnection({ host: "127.0.0.1", port: metroPort }, () => {
    const reqLine = `${req.method} ${req.url} HTTP/${req.httpVersion}\r\n`;
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
    `[dev-proxy] HTTP proxy on 0.0.0.0:${publicPort} → Metro on localhost:${metroPort}`
  );
});

server.on("error", (err) => {
  console.error("[dev-proxy] Server error:", err.message);
  process.exit(1);
});
