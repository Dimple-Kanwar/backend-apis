import fs from 'fs';
import path from 'path';
import { GraphQLSchema } from 'graphql';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { BridgeResolvers } from '../resolvers/bridge.resolver';

// Combine resolvers
const resolvers = {
    Query: {
        ...BridgeResolvers.Query
    },
    Mutation: {
        ...BridgeResolvers.Mutation
    }
};

export function loadSchema(): GraphQLSchema {

    // Load schema from .graphql file
    const schemaFile = path.join(__dirname, 'schema.graphql');
    console.log({ schemaFile })
    const typeDefs = fs.readFileSync(schemaFile, 'utf8');

    // Create executable schema
    return makeExecutableSchema({
        typeDefs,
        resolvers
    });
}