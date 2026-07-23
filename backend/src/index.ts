import "dotenv/config"; // load .env before anything reads process.env
import express from "express";
import cors from "cors";
import { loadRoutes } from "./routes/registry";

// Safety net: a rejected promise that escapes a handler (e.g. an SMS provider
// 5xx in a fire-and-forget path) must never take the whole server down.
process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection]", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[uncaughtException]", err);
});

const app = express();
const PORT = process.env.PORT ?? 4000;

const allowedOrigins = (process.env.FRONTEND_URL ?? "http://localhost:3000").split(",");
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
      cb(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials: true,
  })
);

app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => res.json({ ok: true, service: "kaunta-hr-backend" }));

// Auto-mount every src/routes/**/*.route.ts module ({ basePath, router }).
const mounted = loadRoutes(app);
console.log(`[routes] mounted ${mounted.length}:`, mounted.join(", "));

// Central error handler — never leak stack traces to clients.
app.use(
  (err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error("[error]", err);
    if (res.headersSent) return;
    res.status(500).json({ error: "internal_error" });
  }
);

app.listen(PORT, () => console.log(`[kaunta-hr-backend] listening on ${PORT}`));

export default app;
