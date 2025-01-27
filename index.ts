import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { createServer } from 'http';
import express from 'express';
import cors from 'cors';
import { loadSchema } from './schema/schema';
import { connectDB } from './database/connection';
import { BridgeService } from './services/bridge.service';


const app = express();
const httpServer = createServer(app);

// CORS configuration
const corsOptions = {
    origin: ["http://localhost:5173", "http://localhost:5174"],
    methods: ["GET", "POST", "OPTIONS"],
    credentials: true
};

app.use(cors(corsOptions));
app.use(express.json());

async function startServer() {
    try {
        // Load GraphQL schema
        const schema = loadSchema();
        console.log({schema});
        // Set up Apollo Server
        const server = new ApolloServer({
            schema,
            formatError: (error) => {
                console.error('GraphQL Error:', error);
                return error;
            },
        });

        // Start Apollo Server
        await server.start();

        // Apply Apollo middleware to Express
        app.use(
            '/graphql',
            cors<cors.CorsRequest>(corsOptions),
            express.json(),
            expressMiddleware(server, {
                context: async ({ req }) => ({
                    BridgeService
                    // Add authentication context here
                }),
            })
        );

        // Health check endpoint
        app.get('/health', (req, res) => {
            res.json({
                status: 'healthy',
                timestamp: new Date(),
                // socketConnections: io.engine.clientsCount
            });
        });

        // Start server
        const PORT = process.env.PORT || 4000;
        await connectDB();
        httpServer.listen(PORT, () => {
            console.log(`🚀 Server ready at http://localhost:${PORT}/graphql`);
            // console.log(`🔌 Socket.IO is listening on port ${PORT}`);
        });

    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

// Error handling for the process
process.on('unhandledRejection', (error) => {
    console.error('Unhandled Rejection:', error);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});

// Start the server
startServer().catch(console.error);
