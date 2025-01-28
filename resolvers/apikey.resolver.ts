// resolvers/apiKey.resolver.ts
import { ApiKeyService } from "../services/apikey.service";

export const apiKeyResolvers = {
  Query: {
    getApiKeyInfo: async (_: any, { key }: { key: string }) => {
      return await ApiKeyService.getKeyInfo(key);
    },
  },
  Mutation: {
    generateApiKey: async (
      _: any,
      { input }: { input: { clientName: string; rateLimit: number } }
    ) => {
      try {
        return await ApiKeyService.createApiKey(
          input.clientName,
          input.rateLimit
        );
      } catch (error) {
        console.error("Error generating API key:", error);
        throw error;
      }
    },

    resetApiKey: async (_: any, { key }: { key: string }) => {
      const newKey = await ApiKeyService.resetApiKey(key);
      if (!newKey) {
        throw new Error("Invalid or inactive API key");
      }
      return newKey;
    },
    deactivateApiKey: async (_: any, { key }: { key: string }) => {
      return await ApiKeyService.deactivateKey(key);
    },
    updateRateLimit: async (
      _: any,
      { key, newLimit }: { key: string; newLimit: number }
    ) => {
      return await ApiKeyService.updateRateLimit(key, newLimit);
    },
  },
};
