---
name: Replit proxy drops multipart POST bodies
description: Replit's deployment proxy silently drops multipart/form-data POST request bodies; JSON POSTs work fine.
---

## Rule
Never use `multipart/form-data` (multer) for file uploads in the deployed (published) Replit app. Use JSON + base64 instead.

**Why:** In the Replit autoscale deployment, GET requests to `/api/*` and JSON POST requests reach the Express API server normally. But `multipart/form-data` POST bodies are silently dropped by the proxy — the request never appears in the API server's pino-http logs. The hang is at the proxy/network layer before Express. JSON POSTs (e.g. login with credentials) work perfectly.

**How to apply:**
- Server: add a route accepting `{ fileBase64: string, fileName: string, mimeType: string, ...rest }`. Decode with `Buffer.from(base64Data, "base64")` and process identically to the multer route. Increase `express.json({ limit: "20mb" })` to handle base64 overhead (~33% larger than binary).
- Client: use `FileReader.readAsDataURL(file)` to get a base64 data-URL, then `fetch("/api/.../upload", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({...}) })`.
- Keep `AbortSignal.timeout(60_000)` on the fetch as a safety net.
- The multer route (`POST /api/images`) can remain for backward compatibility (e.g. Expo mobile), but the web app should always use the base64 route.
