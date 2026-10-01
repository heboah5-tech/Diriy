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
  console.error("Uncaught Exception:", err);
});

import "./server/index";

