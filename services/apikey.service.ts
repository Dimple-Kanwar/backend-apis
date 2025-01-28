import mongoose from "mongoose";
import crypto from "crypto";

if (!process.env.API_KEY_SALT) {
  throw new Error("API_KEY_SALT must be defined in environment variables");
}

const apiKeySchema = new mongoose.Schema({
  hashedKey: {
    type: String,
    required: true,
    unique: true,
  },
  clientName: {
    type: String,
    required: true,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  lastUsed: {
    type: Date,
  },
  usageCount: {
    type: Number,
    default: 0,
  },
  rateLimit: {
    type: Number,
    default: 1000,
  },
  dailyUsage: {
    type: Number,
    default: 0,
  },
  lastResetDate: {
    type: Date,
    default: Date.now,
  },
});

const ApiKeyModel = mongoose.model("ApiKey", apiKeySchema);

export class ApiKeyService {
  private static hashKey(key: string): string {
    // Create a HMAC using the salt
    const hmac = crypto.createHmac("sha256", process.env.API_KEY_SALT!);
    // Update HMAC with the key
    hmac.update(key);
    // Get the final hash
    return hmac.digest("hex");
  }

  private static generateKey(): string {
    // Generate random bytes for the key
    const randomBytes = crypto.randomBytes(32);
    // Create a timestamp component
    const timestamp = Date.now().toString();
    // Combine and hash them
    const combinedKey = Buffer.concat([randomBytes, Buffer.from(timestamp)]);
    // Return base64 encoded string
    return combinedKey.toString("base64");
  }

  static async createApiKey(
    clientName: string,
    rateLimit: number = 1000
  ): Promise<string> {
    try {
      const key = this.generateKey();
      const hashedKey = this.hashKey(key);

      await ApiKeyModel.create({
        hashedKey,
        clientName,
        rateLimit,
        lastResetDate: new Date(),
      });

      return key; // Return unhashed key
    } catch (error) {
      console.error("Error creating API key:", error);
      throw new Error("Failed to create API key");
    }
  }

  static async validateApiKey(key: string): Promise<boolean> {
    try {
      const hashedKey = this.hashKey(key);
      const apiKey = await ApiKeyModel.findOne({ hashedKey, isActive: true });

      if (!apiKey) return false;

      const today = new Date();
      const startOfDay = new Date(today.setHours(0, 0, 0, 0));

      // Reset daily usage if it's a new day
      if (apiKey.lastResetDate < startOfDay) {
        await ApiKeyModel.updateOne(
          { _id: apiKey._id },
          {
            dailyUsage: 1,
            lastResetDate: today,
            lastUsed: today,
            $inc: { usageCount: 1 },
          }
        );
        return true;
      }

      // Check rate limit
      if (apiKey.dailyUsage >= apiKey.rateLimit) {
        return false;
      }

      // Update usage
      await ApiKeyModel.updateOne(
        { _id: apiKey._id },
        {
          $inc: { usageCount: 1, dailyUsage: 1 },
          lastUsed: today,
        }
      );

      return true;
    } catch (error) {
      console.error("Error validating API key:", error);
      return false;
    }
  }

  static async resetApiKey(oldKey: string): Promise<string | null> {
    try {
      const hashedOldKey = this.hashKey(oldKey);
      const apiKey = await ApiKeyModel.findOne({
        hashedKey: hashedOldKey,
        isActive: true,
      });

      if (!apiKey) {
        return null;
      }

      // Generate new key
      const newKey = this.generateKey();
      const hashedNewKey = this.hashKey(newKey);

      // Update with new hashed key
      await ApiKeyModel.updateOne(
        { _id: apiKey._id },
        {
          hashedKey: hashedNewKey,
          dailyUsage: 0,
          lastResetDate: new Date(),
          lastUsed: new Date(),
        }
      );

      return newKey;
    } catch (error) {
      console.error("Error resetting API key:", error);
      throw new Error("Failed to reset API key");
    }
  }

  static async deactivateKey(key: string): Promise<boolean> {
    try {
      const hashedKey = this.hashKey(key);
      const result = await ApiKeyModel.updateOne(
        { hashedKey },
        { isActive: false }
      );
      return result.modifiedCount > 0;
    } catch (error) {
      console.error("Error deactivating API key:", error);
      throw new Error("Failed to deactivate API key");
    }
  }

  static async updateRateLimit(
    key: string,
    newLimit: number
  ): Promise<boolean> {
    try {
      const hashedKey = this.hashKey(key);
      const result = await ApiKeyModel.updateOne(
        { hashedKey },
        { rateLimit: newLimit }
      );
      return result.modifiedCount > 0;
    } catch (error) {
      console.error("Error updating rate limit:", error);
      throw new Error("Failed to update rate limit");
    }
  }

  static async getKeyInfo(key: string) {
    try {
      const hashedKey = this.hashKey(key);
      return await ApiKeyModel.findOne(
        { hashedKey },
        { hashedKey: 0, _id: 0, __v: 0 }
      );
    } catch (error) {
      console.error("Error fetching API key info:", error);
      throw new Error("Failed to fetch API key info");
    }
  }
}
