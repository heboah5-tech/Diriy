import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";

const app = express();
// Required so req.ip resolves to the real client IP behind Replit's proxy.
app.set("trust proxy", true);
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

// Prevent unhandled EPIPE / ECONNRESET errors from crashing the Node process
process.stdout.on("error", (err: any) => {
  if (err?.code === "EPIPE") return;
});
process.stderr.on("error", (err: any) => {
  if (err?.code === "EPIPE") return;
});
process.on("uncaughtException", (err: any) => {
  if (err?.code === "EPIPE" || (err?.message && err.message.includes("EPIPE")) || err?.code === "ECONNRESET") {
    return;
  }
  console.error("Uncaught exception:", err);
});
process.on("unhandledRejection", (reason: any) => {
  if (reason?.code === "EPIPE" || (reason?.message && reason.message.includes("EPIPE")) || reason?.code === "ECONNRESET") {
    return;
  }
  console.error("Unhandled rejection:", reason);
});

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  try {
    console.log(`${formattedTime} [${source}] ${message}`);
  } catch (err: any) {
    if (err?.code === "EPIPE") return;
  }
}

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

      log(logLine);
    }
  });

  next();
});

(async () => {
  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on port 3000 as required by the AI Studio environment.
  // Note: in containerized environments (like Cloud Run), PORT may be preset to 8080 for Nginx,
  // while Nginx proxies requests to the internal app on port 3000.
  const port = process.env.PORT && process.env.PORT !== "8080" ? parseInt(process.env.PORT, 10) : 3000;
  httpServer.on("clientError", (err: any, socket) => {
    if (err?.code === "ECONNRESET" || err?.code === "EPIPE") {
      return;
    }
    if (!socket.destroyed) {
      socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
    }
  });

  httpServer.listen(
    port,
    "0.0.0.0",
    () => {
      log(`serving on port ${port}`);
    },
  );
})();
