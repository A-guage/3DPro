// Express HTTP app — serves frontend requests via gateway proxy

import express from "express";
import routes from "./routes/index.js";

const app = express();

app.use(express.json({ limit: "10mb" }));

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "scene3d-mcp-server" });
});

// All scene3d API routes
app.use("/api/scene3d", routes);

export default app;
