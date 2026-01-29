import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import mongoose from "mongoose";
import { createServer } from "node:http";
import { connectToSocket } from "./controllers/socketManager.js";
import userRoutes from "./routes/users.routes.js";

// Load environment variables from .env file (local dev only)
dotenv.config();

// Validate required environment variables
const validateEnv = () => {
  const required = ["MONGODB_URI"];
  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    console.error(
      `❌ Missing required environment variables: ${missing.join(", ")}`,
    );
    console.error(
      "📌 Make sure these are set in Render dashboard: Settings → Environment",
    );
    // In production, don't exit - let app try to connect anyway
    if (process.env.NODE_ENV !== "production") {
      process.exit(1);
    }
  }
};

validateEnv();

const app = express();
const server = createServer(app);
const io = connectToSocket(server);

app.set("port", process.env.PORT || 8001);
app.use(cors());
app.use(express.json({ limit: "50kb" }));
app.use(express.urlencoded({ extended: true, limit: "50kb" }));
app.use("/api/v1/user", userRoutes);

// MongoDB Connection with Production Optimizations
const connectDB = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI;

    if (!mongoUri) {
      throw new Error(
        "MONGODB_URI is undefined. Ensure it's set in Render environment variables.",
      );
    }

    const connectionOptions = {
      maxPoolSize: 10,
      minPoolSize: 2,
      socketTimeoutMS: 45000,
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 10000,
      retryWrites: true,
      w: "majority",
      family: 4, // Use IPv4, skip IPv6 if not available
    };

    console.log("🔄 Attempting MongoDB connection...");
    console.log(
      `📍 MongoDB URI: ${mongoUri.split("@")[1]?.substring(0, 30)}...`,
    ); // Log masked URI

    await mongoose.connect(mongoUri, connectionOptions);
    console.log("✅ MongoDB connected successfully");
    return true;
  } catch (error) {
    console.error("❌ MongoDB connection error:", error.message);
    console.error("🔧 Troubleshooting:");
    console.error("   1. Check Render environment variables are set");
    console.error("   2. Verify MongoDB Atlas IP whitelist includes 0.0.0.0/0");
    console.error("   3. Test connection string locally");
    return false;
  }
};

// Health check endpoint with detailed diagnostics
app.get("/health", (req, res) => {
  const dbStatus =
    mongoose.connection.readyState === 1 ? "connected" : "disconnected";
  const dbReadyState = {
    0: "disconnected",
    1: "connected",
    2: "connecting",
    3: "disconnecting",
  };

  res.json({
    status: "ok",
    database: dbStatus,
    dbReadyStateCode: mongoose.connection.readyState,
    dbReadyStateText: dbReadyState[mongoose.connection.readyState],
    environment: process.env.NODE_ENV || "development",
    timestamp: new Date().toISOString(),
    mongoUriConfigured: !!process.env.MONGODB_URI,
  });
});

// Connection retry logic
let connectionAttempts = 0;
const maxRetries = 10;
const retryDelay = 5000; // 5 seconds

const retryConnect = async () => {
  connectionAttempts++;

  if (connectionAttempts > maxRetries) {
    console.error(`❌ Failed to connect after ${maxRetries} attempts`);
    return false;
  }

  console.log(
    `🔄 MongoDB connection attempt ${connectionAttempts}/${maxRetries}...`,
  );

  const connected = await connectDB();

  if (!connected) {
    setTimeout(() => {
      retryConnect();
    }, retryDelay);
  }

  return connected;
};

const start = async () => {
  console.log("🚀 Starting server...");
  console.log(`📍 Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(`📍 Port: ${app.get("port")}`);

  // Start server immediately (don't wait for DB)
  server.listen(app.get("port"), () => {
    console.log(`✅ Server listening on port ${app.get("port")}`);
  });

  // Connect to MongoDB in background with retries
  const dbConnected = await retryConnect();

  if (!dbConnected) {
    console.warn(
      "⚠️ Server running but MongoDB not connected yet. Will retry periodically.",
    );
    console.warn("📌 Check Render logs for connection errors");
  } else {
    console.log("✅ MongoDB connected and ready");
  }
};

start();

export default app;
