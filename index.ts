import * as dotenv from "dotenv";
dotenv.config();
import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@apollo/server/express4";
import { createServer } from "http";
import express from "express";
import cors from "cors";
import { loadSchema } from "./schema/schema";
import { connectDB } from "./database/connection";
import { BridgeService } from "./services/bridge.service";
import { ApiKeyService } from "./services/apikey.service";

const app = express();
const httpServer = createServer(app);

const corsOptions = {
  origin: ["*"],
  methods: ["GET", "POST", "OPTIONS"],
  credentials: true,
};

app.use(cors(corsOptions));
app.use(express.json());

async function startServer() {
  try {
    // Load GraphQL schema
    const schema = loadSchema();
    // Set up Apollo Server
    const server = new ApolloServer({
      schema,
      formatError: (error) => {
        console.error("GraphQL Error:", error);
        return error;
      },
    });

    await server.start();

    app.use(
      "/graphql",
      cors<cors.CorsRequest>(corsOptions),
      express.json(),
      expressMiddleware(server, {
        context: async ({ req }) => {
          const query = req.body.query || "";

          // Allow API key generation without authentication
          if (query.includes("mutation") && query.includes("generateApiKey")) {
            console.log("1");
            return {
              bridgeService: new BridgeService(),
              isAuthenticated: true,
            };
          }

          // Allow introspection queries
          if (
            query.includes("IntrospectionQuery") ||
            query.includes("__schema") ||
            query.includes("__type")
          ) {
            console.log("2");
            return {
              bridgeService: new BridgeService(),
              isAuthenticated: true,
            };
          }

          // Validate API key for all other operations
          const apiKey = req.headers["x-api-key"] as string;
          if (!apiKey || !(await ApiKeyService.validateApiKey(apiKey))) {
            throw new Error(
              "Unauthorized: Invalid API key or rate limit exceeded"
            );
          }
          console.log("3");
          return {
            bridgeService: new BridgeService(),
            isAuthenticated: true,
            apiKey,
          };
        },
      })
    );

    const PORT = process.env.PORT || 4000;
    await connectDB();
    httpServer.listen(PORT, () => {
      console.log(`🚀 Server ready at http://localhost:${PORT}/graphql`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

process.on("unhandledRejection", (error) => {
  console.error("Unhandled Rejection:", error);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
});

startServer().catch(console.error);
