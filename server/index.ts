import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import fs from "fs";
import path from "path";
import { Pool } from "pg";
import { passport } from "./auth";
import { registerRoutes } from "./routes";
import { log } from "./logger";
import { serveStatic } from "./static-serve";
import { externalReviewerDenyList } from "./external-reviewer";

async function ensureSchema(): Promise<void> {
  const candidates = [
    path.resolve(import.meta.dirname ?? __dirname, "prod-migrate.sql"),
    path.resolve(process.cwd(), "server/prod-migrate.sql"),
    path.resolve(process.cwd(), "dist/prod-migrate.sql"),
  ];
  const sqlPath = candidates.find(p => { try { return fs.existsSync(p); } catch { return false; } });
  if (!sqlPath) {
    console.warn("[startup] prod-migrate.sql not found; skipping ensureSchema");
    return;
  }
  const sql = fs.readFileSync(sqlPath, "utf8");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await pool.query(sql);
    console.log(`[startup] ensureSchema OK (${sqlPath})`);
  } catch (err: any) {
    console.error("[startup] ensureSchema error:", err?.message ?? err);
  } finally {
    await pool.end().catch(() => {});
  }
}

const PgSession = connectPgSimple(session);

const app = express();

// Trust the reverse proxy so secure session cookies work over HTTPS in production
app.set("trust proxy", 1);

declare module 'http' {
  interface IncomingMessage {
    rawBody: unknown
  }
}

app.use(express.json({
  limit: "15mb",
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: false, limit: "15mb" }));

// Session middleware
app.use(
  session({
    store: new PgSession({
      conString: process.env.DATABASE_URL,
      tableName: "session",
      createTableIfMissing: true,
    }),
    secret: process.env.SESSION_SECRET || "fallback-dev-secret-change-in-prod",
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      maxAge: 30 * 60 * 1000,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "lax" : false,
    },
  })
);

app.use(passport.initialize());
app.use(passport.session());

// External-reviewer (chart-review-only) deny-list. Mounted after auth/session
// init so req.user is populated. Allow-listed paths pass through; everything
// else returns 403 + audit row when the active membership is external_reviewer.
app.use(externalReviewerDenyList());

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  try {
    console.log("[startup] running ensureSchema…");
    await ensureSchema();
    console.log("[startup] registering routes…");
    const server = await registerRoutes(app);

    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";
      res.status(status).json({ message });
      throw err;
    });

    if (process.env.NODE_ENV === "development") {
      // new Function prevents esbuild from statically analyzing this import,
      // so server/vite.ts and its "import from 'vite'" are never bundled into
      // dist/index.js — vite stays a dev-only dependency.
      const importDynamic = new Function("m", "return import(m)");
      const { setupVite } = await importDynamic("./vite.js");
      await setupVite(app, server);
    } else {
      console.log("[startup] serving static files…");
      serveStatic(app);
    }

    const port = parseInt(process.env.PORT || '5000', 10);
    console.log(`[startup] binding to 0.0.0.0:${port}…`);

    // Attach an error handler BEFORE calling listen so any bind error is caught
    server.on("error", (err: NodeJS.ErrnoException) => {
      console.error(`[startup] server listen error: ${err.code} — ${err.message}`);
      process.exit(1);
    });

    server.listen(port, "0.0.0.0", () => {
      log(`serving on port ${port}`);
      // Start the in-process Vitals Monitoring sweep (15-min interval).
      // Idempotent — safe across restarts.
      import("./vitals-monitoring-sweep")
        .then(({ startVitalsMonitoringSweepLoop }) => startVitalsMonitoringSweepLoop())
        .catch((err) => console.warn("[startup] failed to start vitals-monitoring sweep:", err));
    });
  } catch (err) {
    console.error("[startup] fatal error during startup:", err);
    process.exit(1);
  }
})();
