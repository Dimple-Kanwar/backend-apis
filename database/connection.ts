// database/connection.ts
import mongoose from "mongoose";
import { DATABASE_CONFIG } from "../config/database";

const env = (process.env.NODE_ENV || "development") as
  | "development"
  | "production"
  | "test";
const config = DATABASE_CONFIG[env];

export async function connectDB() {
  try {
    await mongoose.connect(config.url);
    console.log("🗄️  MongoDB Connected Successfully");

    mongoose.connection.on("error", (err) => {
      console.error("MongoDB connection error:", err);
    });

    mongoose.connection.on("disconnected", () => {
      console.warn("MongoDB disconnected. Attempting to reconnect...");
    });

    process.on("SIGINT", async () => {
      try {
        await mongoose.connection.close();
        console.log("MongoDB connection closed through app termination");
        process.exit(0);
      } catch (err) {
        console.error("Error closing MongoDB connection:", err);
        process.exit(1);
      }
    });
  } catch (error) {
    console.error("Failed to connect to MongoDB:", error);
    process.exit(1);
  }
}
