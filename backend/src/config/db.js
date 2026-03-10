/**
 * MongoDB Connection — Production-grade with retry logic.
 */
import mongoose from "mongoose";
import config from "./index.js";

const MAX_RETRIES = 10;
const RETRY_DELAY = 5000;
let retryCount = 0;

export const connectDB = async () => {
  const uri = config.mongoUri;
  if (!uri) {
    console.error("FATAL: MONGODB_URI is not set.");
    if (config.isProd) process.exit(1);
    return false;
  }

  const options = {
    maxPoolSize: 10,
    minPoolSize: 2,
    socketTimeoutMS: 45000,
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 10000,
    retryWrites: true,
    w: "majority",
    family: 4,
  };

  const attemptConnect = async () => {
    retryCount += 1;
    try {
      console.log(`MongoDB connection attempt ${retryCount}/${MAX_RETRIES}...`);
      await mongoose.connect(uri, options);
      console.log("MongoDB connected successfully");
      retryCount = 0;
      return true;
    } catch (err) {
      console.error(`MongoDB connection failed: ${err.message}`);
      if (retryCount < MAX_RETRIES) {
        console.log(`Retrying in ${RETRY_DELAY / 1000}s...`);
        await new Promise((r) => setTimeout(r, RETRY_DELAY));
        return attemptConnect();
      }
      console.error(`Failed to connect after ${MAX_RETRIES} attempts.`);
      return false;
    }
  };

  // Graceful reconnection on drop
  mongoose.connection.on("disconnected", () => {
    console.warn("MongoDB disconnected. Attempting reconnect...");
    if (retryCount === 0) attemptConnect();
  });

  mongoose.connection.on("error", (err) => {
    console.error("MongoDB error:", err.message);
  });

  return attemptConnect();
};

export const getDBStatus = () => {
  const states = {
    0: "disconnected",
    1: "connected",
    2: "connecting",
    3: "disconnecting",
  };
  return {
    status: states[mongoose.connection.readyState] || "unknown",
    readyState: mongoose.connection.readyState,
    isConnected: mongoose.connection.readyState === 1,
  };
};
