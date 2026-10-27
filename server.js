
const express = require("express");
const path = require("node:path");

const { generateStudyPlan } = require("./src/scheduler");
const { client, connectRedis } = require("./src/redis");

const app = express();
const PORT = Number(process.env.PORT) || 8080;

// Middleware
app.use(express.json());

// Serve frontend
app.use(express.static(path.join(__dirname, "src", "public")));

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    app: process.env.APP_NAME || "Planora"
  });
});

// Application configuration
app.get("/api/config", (req, res) => {
  res.json({
    appName: process.env.APP_NAME || "Planora",
    defaultDailyHours: 3
  });
});

// Generate study schedule - Original HW-1 feature
app.post("/api/plan", (req, res) => {
  try {
    const { topics, deadline, dailyHours } = req.body || {};

    const plan = generateStudyPlan(
      topics,
      deadline,
      dailyHours
    );

    res.json(plan);
  } catch (error) {
    res.status(400).json({
      error: error.message
    });
  }
});

// Save a study plan in Redis
app.post("/api/saved-plans", async (req, res) => {
  try {
    const { title, dailyHours } = req.body || {};

    if (
      typeof title !== "string" ||
      title.trim() === "" ||
      !Number.isFinite(dailyHours) ||
      dailyHours <= 0
    ) {
      return res.status(400).json({
        error: "Valid title and dailyHours are required"
      });
    }

    const id = await client.incr("planora:next-id");

    const savedPlan = {
      id,
      title: title.trim(),
      dailyHours,
      createdAt: new Date().toISOString()
    };

    await client.rPush(
      "planora:plans",
      JSON.stringify(savedPlan)
    );

    res.status(201).json(savedPlan);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: "Failed to save plan"
    });
  }
});

// Get saved study plans from Redis
app.get("/api/saved-plans", async (req, res) => {
  try {
    const data = await client.lRange("planora:plans", 0, -1);

    res.json(data.map(JSON.parse));
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: "Failed to get plans"
    });
  }
});

// Start server after connecting to Redis
async function startServer() {
  try {
    await connectRedis();

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Planora running at http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Startup error:", error);
    process.exit(1);
  }
}

startServer();
