import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import session from "express-session";
import connectPg from "connect-pg-simple";
import { SqliteSessionStore } from "./lib/sqliteSessionStore";
import router from "./routes";
import { logger } from "./lib/logger";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// IS_SQLITE is true for the Electron desktop app AND for standalone self-host
// mode (SELF_HOST_SQLITE=true).  Both use SqliteSessionStore + better-sqlite3
// instead of PostgreSQL, and the esbuild step resolves @workspace/db to
// lib/db/src/sqlite-compat.ts via the ELECTRON_BUILD=true alias.
const IS_SQLITE =
  process.env["ELECTRON_MODE"] === "true" ||
  process.env["SELF_HOST_SQLITE"] === "true";

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

app.use(
  cors({
    credentials: true,
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (IS_SQLITE) return callback(null, true);
      const rawAllowedOrigins = process.env.CORS_ALLOWED_ORIGINS;
      const replitDevDomain = process.env.REPLIT_DEV_DOMAIN
        ? `https://${process.env.REPLIT_DEV_DOMAIN}`
        : undefined;
      const replitExpoDevDomain = process.env.REPLIT_EXPO_DEV_DOMAIN
        ? `https://${process.env.REPLIT_EXPO_DEV_DOMAIN}`
        : undefined;
      const defaultOrigins = [replitDevDomain, replitExpoDevDomain].filter(Boolean) as string[];
      const allowedOrigins: string[] = rawAllowedOrigins
        ? rawAllowedOrigins.split(",").map((o) => o.trim()).filter(Boolean)
        : defaultOrigins;
      if (allowedOrigins.includes(origin)) return callback(null, true);
      if (
        process.env.NODE_ENV !== "production" &&
        /^https?:\/\/localhost(:\d+)?$/.test(origin)
      ) {
        return callback(null, true);
      }
      callback(new Error(`CORS: origin '${origin}' is not allowed`));
    },
  }),
);

app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true, limit: "20mb" }));

// Authentication note: this server uses express-session with a custom
// username/password flow (see routes/auth.ts and middlewares/requireAuth.ts).
// Clerk JWT middleware is NOT active in the request pipeline — clerkMiddleware
// from @clerk/express is fully stateless and requires no server-side store, but
// it is unused here. Sessions are managed entirely by express-session below.
//
// Secret rotation: express-session accepts an array of secrets. New cookies
// are always signed with the FIRST entry; verification is tried against every
// entry in the array. This lets an admin rotate SESSION_SECRET without
// forcibly logging everyone out — set SESSION_SECRET to the new value and
// move the old value into SESSION_SECRET_PREVIOUS (comma-separated list
// supported for more than one grace-period secret). Once all old sessions
// have naturally expired (30 min idle / rolling), drop SESSION_SECRET_PREVIOUS.
function getSessionSecrets(): string[] {
  const current = process.env["SESSION_SECRET"] || "max7-vista-dev-secret-change-in-prod";
  const previous = (process.env["SESSION_SECRET_PREVIOUS"] || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return [current, ...previous];
}

const sessionSecrets = getSessionSecrets();

if (IS_SQLITE) {
  app.use(
    session({
      store: new SqliteSessionStore(),
      name: "max7.sid",
      secret: sessionSecrets,
      resave: false,
      saveUninitialized: false,
      rolling: true,
      cookie: {
        httpOnly: true,
        sameSite: "lax",
        maxAge: 30 * 60 * 1000,
      },
    }),
  );
} else {
  const PgSession = connectPg(session);
  app.use(
    session({
      store: new PgSession({
        conString: process.env["DATABASE_URL"],
        tableName: "sessions",
        createTableIfMissing: false,
      }),
      name: "max7.sid",
      secret: sessionSecrets,
      resave: false,
      saveUninitialized: false,
      rolling: true,
      cookie: {
        httpOnly: true,
        sameSite: "lax",
        maxAge: 30 * 60 * 1000,
      },
    }),
  );
}

// Bearer-token auth for mobile clients: load session from store when an
// Authorization: Bearer <sessionId> header is present and no cookie session
// has already been established.
app.use((req, _res, next) => {
  if (req.session?.userId) return next();
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return next();
  const token = auth.slice(7).trim();
  if (!token) return next();
  req.sessionStore.get(token, (err, sessionData) => {
    if (!err && sessionData?.userId) {
      req.session.userId = sessionData.userId;
      req.session.username = sessionData.username;
      req.session.role = sessionData.role;
      req.session.tenantId = sessionData.tenantId;
    }
    next();
  });
});

app.use("/api", router);

const frontendDist = path.join(__dirname, "dist-frontend");
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(frontendDist, "index.html"));
  });
}

export default app;
