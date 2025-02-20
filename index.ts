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

const createBridgeService = () => new BridgeService();

app.use(cors(corsOptions));
app.use(express.json());

async function startServer() {
  try {
    const schema = loadSchema();
    const server = new ApolloServer({
      schema,
      introspection: true,
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

          if (query.includes("mutation") && query.includes("generateApiKey")) {
            return {
              bridgeService: createBridgeService(),
              isAuthenticated: true,
            };
          }

          if (
            query.includes("IntrospectionQuery") ||
            query.includes("__schema") ||
            query.includes("__type")
          ) {
            return {
              bridgeService: createBridgeService(),
              isAuthenticated: true,
            };
          }

          const apiKey = req.headers["x-api-key"] as string;
          if (!apiKey || !(await ApiKeyService.validateApiKey(apiKey))) {
            throw new Error(
              "Unauthorized: Invalid API key or rate limit exceeded"
            );
          }

          return {
            bridgeService: createBridgeService(),
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
