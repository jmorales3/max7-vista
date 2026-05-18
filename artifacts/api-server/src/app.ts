import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import session from "express-session";
import connectPg from "connect-pg-simple";
import router from "./routes";
import { logger } from "./lib/logger";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const IS_ELECTRON = process.env["ELECTRON_MODE"] === "true";

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
      if (IS_ELECTRON) return callback(null, true);
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

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

if (IS_ELECTRON) {
  app.use(
    session({
      name: "max7.sid",
      secret: process.env["SESSION_SECRET"] || "max7-vista-dev-secret-change-in-prod",
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: "lax",
        maxAge: 8 * 60 * 60 * 1000,
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
      }),
      name: "max7.sid",
      secret: process.env["SESSION_SECRET"] || "max7-vista-dev-secret-change-in-prod",
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: "lax",
        maxAge: 8 * 60 * 60 * 1000,
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
