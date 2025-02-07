// schema/schema.ts
import { makeExecutableSchema } from "@graphql-tools/schema";
import fs from "fs";
import path from "path";
import { bridgeResolvers } from "../resolvers/bridge.resolver";
import { apiKeyResolvers } from "../resolvers/apikey.resolver";

export const loadSchema = () => {
  try {
    const schemaFile = path.join(__dirname, "schema.graphql");
    const typeDefs = fs.readFileSync(schemaFile, "utf8");

    return makeExecutableSchema({
      typeDefs,
      resolvers: {
        Query: {
          ...apiKeyResolvers.Query,
        },
        Mutation: {
          ...bridgeResolvers.Mutation,
          ...apiKeyResolvers.Mutation,
        },
      },
    });
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred";
    throw new Error(`Failed to load schema: ${errorMessage}`);
  }
};
