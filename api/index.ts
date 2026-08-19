// Vercel serverless entry point. Wraps the Express API routes from
// `server/routes.ts` so endpoints like /api/visitor-ip work in production.
//
// In Replit dev we use `server/index.ts` (long-running Express + Vite). On
// Vercel we use this file: a stateless handler. Static assets and the SPA
// fallback are configured in `vercel.json`.

import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { createServer } from "http";
import { registerRoutes } from "../server/routes";

const app = express();
app.set("trust proxy", true);

app.use(
  express.json({
    verify: (req, _res, buf) => {
      (req as any).rawBody = buf;
    },
  }),
);
app.use(express.urlencoded({ extended: false }));

let registered: Promise<void> | null = null;
const ensureRoutes = () => {
  if (!registered) {
    const server = createServer(app);
    registered = registerRoutes(server, app).then(() => {
      app.use(
        (err: any, _req: Request, res: Response, next: NextFunction) => {
          if (res.headersSent) return next(err);
          const status = err?.status || err?.statusCode || 500;
          res.status(status).json({
            message: err?.message || "Internal Server Error",
          });
        },
      );
    });
  }
  return registered;
};

export default async function handler(req: Request, res: Response) {
  await ensureRoutes();
  return app(req, res);
}
