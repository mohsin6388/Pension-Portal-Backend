require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const { initDatabase } = require("./src/config/database");

// ── Routes ────────────────────────────────────────────────────────────────────
const authRoutes           = require("./src/routes/auth");
const pensionerRoutes      = require("./src/routes/pensioners");
const pensionActionRoutes  = require("./src/routes/pensionActions");
const userRoutes           = require("./src/routes/users");
const documentRoutes       = require("./src/routes/documents");

const app = express();
const PORT = process.env.PORT || 5000;

// ── Security & Parsing ────────────────────────────────────────────────────────
app.use(helmet());
// app.use(cors({
//   origin: (process.env.CORS_ORIGINS || "http://localhost:5173").split(","),
//   credentials: true,
// }));
app.use(cors({
  origin: "*",
  credentials: true,
}));

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan("dev"));

// Global rate limiter
app.use(rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  message: { success: false, message: "Too many requests, slow down." },
}));

// ── Routes ────────────────────────────────────────────────────────────────────
app.use("/api/auth",            authRoutes);
app.use("/api/pensioners",      pensionerRoutes);
app.use("/api/pension-actions", pensionActionRoutes);
app.use("/api/users",           userRoutes);
app.use("/api/documents",       documentRoutes);

// Health check
app.get("/api/health", (req, res) => {
  res.json({ success: true, message: "KMC Pensioner Portal API is running", timestamp: new Date().toISOString() });
});

// 404
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.method} ${req.path} not found` });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ success: false, message: "Internal server error" });
});

// ── Bootstrap ─────────────────────────────────────────────────────────────────
// initDatabase()
//   .then(() => {
    app.listen(PORT, () => {
      console.log(`\n🟢 KMC Pensioner Portal API`);
      console.log(`   Running on  : http://localhost:${PORT}`);
      console.log(`   Environment : ${process.env.NODE_ENV || "development"}`);
      console.log(`\n   Default credentials:`);
      console.log(`   admin  / Admin@1234  (role: admin)`);
      console.log(`   cfo    / Cfo@1234    (role: cfo)`);
      console.log(`   clerk  / Clerk@1234  (role: clerk)\n`);
    });
  // })
  // .catch((err) => {
  //   console.error("Failed to initialize database:", err);
  //   process.exit(1);
  // });

module.exports = app;
