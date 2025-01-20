import { makeExecutableSchema } from '@graphql-tools/schema';
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer';
import {
    ApolloServerPluginLandingPageLocalDefault,
    ApolloServerPluginLandingPageProductionDefault,
} from '@apollo/server/plugin/landingPage/default';
import express, { Request } from 'express';
import { execute, subscribe } from 'graphql';
import { createServer } from 'http';
import fs from 'fs';
import { SubscriptionServer } from 'subscriptions-transport-ws';
import { mutation } from './resolvers/mutations';
import { query } from './resolvers/query';
import cors from 'cors';
import path from 'path';
import { ChainService } from './services/chain.service';
import { Validator } from './services/validator.service';
import { Relayer } from './services/relayer.service';
import { CHAIN_CONFIGS } from './config/chains';
import { EventListener } from './services/events.service';
import { BridgeService } from './services/bridge.service';
import { connectDB } from './database/connection';
const schemaFile = path.join(__dirname + "/schema/", 'schema.graphql');
const typeDefs = fs.readFileSync(schemaFile, 'utf8');


async function startServer() {
    const app = express();
    const httpServer = createServer(app);

    // Load GraphQL schema
    const schema = makeExecutableSchema({
        typeDefs, resolvers: {
            ...mutation,
            ...query
        }
    });

    // CORS configuration
    const corsOptions = {
        origin: ["*"],
        methods: ["GET", "POST", "OPTIONS"],
        credentials: true
    };


    const server = new ApolloServer({
        schema,
        plugins: [
            process.env.NODE_ENV === 'production'
                ? ApolloServerPluginLandingPageProductionDefault()
                : ApolloServerPluginLandingPageLocalDefault({ embed: false }),
            ApolloServerPluginDrainHttpServer({ httpServer })]
    });

    // Set up our Express middleware to handle CORS, body parsing,
    // and our expressMiddleware function.
    app.use(
        '/',
        cors<cors.CorsRequest>(corsOptions),
        express.json(),
        // expressMiddleware accepts the same arguments:
        // an Apollo Server instance and optional configuration options
        expressMiddleware(server, {
            context: async ({ req }) => ({
                BridgeService
                // Add authentication context here
            }),
        }),
    );

    await server.start();

    SubscriptionServer.create(
        { schema, execute, subscribe },
        { server: httpServer, path: "/graphql" }
    );

    await connectDB();

    const PORT = process.env.PORT || 4000;
    httpServer.listen(PORT, () => {
        console.log(`🚀 Server running at http://localhost:${PORT}/graphql`);
        console.log(`🚀 Subscriptions ready at ws://localhost:${PORT}/graphql`);
    });
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