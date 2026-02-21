require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");

const { errorHandler } = require("./middleware/errorHandler");

const reposRoutes = require("./routes/repos.routes");
const prsRoutes = require("./routes/prs.routes");
const dashboardRoutes = require("./routes/dashboard.routes");
const webhooksRoutes = require("./routes/webhooks.routes");
const cliRoutes = require("./routes/cli.routes");

const app = express();
const PORT = process.env.PORT || 5002;

app.use(helmet());
app.use(cors());
app.use(morgan("dev"));
app.use(express.json());

app.use(reposRoutes);
app.use(prsRoutes);
app.use(dashboardRoutes);
app.use(webhooksRoutes);
app.use(cliRoutes);

app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", service: "core-backend", uptime: process.uptime() });
});

app.use("/api/*", (_req, res) => {
    res.status(404).json({ error: "Not found" });
});

app.use(errorHandler);

app.listen(PORT, () => {
    console.log(`\n  Core Backend running on http://localhost:${PORT}`);
    console.log(`  GITHUB_TOKEN: ${process.env.GITHUB_TOKEN ? "set" : "NOT SET (60 req/hr)"}\n`);
});
