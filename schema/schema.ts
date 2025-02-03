// schema/schema.ts
import { makeExecutableSchema } from "@graphql-tools/schema";
import fs from "fs";
import path from "path";
import { bridgeResolvers } from "../resolvers/bridge.resolver"; // Changed from BridgeResolvers to bridgeResolvers
import { apiKeyResolvers } from "../resolvers/apikey.resolver";

export function loadSchema() {
  // Load schema from .graphql file
  const schemaFile = path.join(__dirname, "schema.graphql");
  const typeDefs = fs.readFileSync(schemaFile, "utf8");

  // Create executable schema
  return makeExecutableSchema({
    typeDefs,
    resolvers: {
      Query: {
        // ...bridgeResolvers.Query,
        ...apiKeyResolvers.Query,
      },
      Mutation: {
        ...bridgeResolvers.Mutation,
        ...apiKeyResolvers.Mutation,
      },
    },
  });
}
