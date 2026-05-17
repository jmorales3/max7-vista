import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import router from "./routes";
import { logger } from "./lib/logger";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// Serve bundled frontend static assets (used by the Electron desktop shell in
// production, where Electron loads http://localhost:<PORT> from this server).
// The frontend build output lives at dist-frontend/ alongside this bundle.
// In packaged Electron: __dirname = resources/api-server/ and electron-builder
// copies the frontend dist into resources/api-server/dist-frontend/ via extraResources.
// In development: place the frontend build at artifacts/api-server/dist/dist-frontend/.
const frontendDist = path.join(__dirname, "dist-frontend");
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  // SPA fallback: any non-API route returns index.html so client-side routing works
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(frontendDist, "index.html"));
  });
}

export default app;
