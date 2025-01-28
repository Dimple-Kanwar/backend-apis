import { ApolloServer } from '@apollo/server';
import { loadSchema } from '../schema/schema';
// import { Transaction } from './models/Transaction';
import { expect } from 'chai';
import { CHAIN_CONFIGS } from '../config/chains';

const schema = loadSchema();
const testServer = new ApolloServer({
    schema
});

describe.only('Bridge API', () => {
    it('should lock tokens', async () => {
        const bridgeRequest = {
            token: "0xToken",
            sourceChainId: 421614,
            targetChainId: 84532,
            amount: "1",
            sender: "0x865639b103B5cb25Db1C8703a02a64449dA4d038",
            recipient: "0x0500DE79c6Aa801936cA05D798C9E7468b6739C6"
        }
        const response = await testServer.executeOperation({
            query: `
                mutation {
                    bridgeToken(${bridgeRequest}) {
                        id
                        sender
                        token
                        amount
                        targetChainTxHash
                        status
                    }
                }
            `,
        });
        console.log({res: JSON.stringify(response)});
        // expect(response.body?.lockTokens).toHaveProperty('id');
        // expect(response.data?.lockTokens.sender).toBe('0xSender');
        // expect(response.data?.lockTokens.token).toBe('0xToken');
        // expect(response.data?.lockTokens.amount).toBe('100');
        // expect(response.data?.lockTokens.targetChainTxHash).toBe('0xTargetHash');
        // expect(response.data?.lockTokens.status).toBe('locked');
    });

    // it('should unlock tokens', async () => {
    //     const response = await testServer.executeOperation({
    //         query: `
    //             mutation {
    //                 unlockTokens(recipient: "0xRecipient", token: "0xToken", amount: "100", sourceChainTxHash: "0xSourceHash") {
    //                     id
    //                     recipient
    //                     token
    //                     amount
    //                     sourceChainTxHash
    //                     status
    //                 }
    //             }
    //         `,
    //     });

    //     expect(response.data?.unlockTokens).toHaveProperty('id');
    //     expect(response.data?.unlockTokens.recipient).toBe('0xRecipient');
    //     expect(response.data?.unlockTokens.token).toBe('0xToken');
    //     expect(response.data?.unlockTokens.amount).toBe('100');
    //     expect(response.data?.unlockTokens.sourceChainTxHash).toBe('0xSourceHash');
    //     expect(response.data?.unlockTokens.status).toBe('unlocked');
    // });

    // it('should get transaction by id', async () => {
    //     const transaction = new Transaction({
    //         sender: '0xSender',
    //         token: '0xToken',
    //         amount: '100',
    //         targetChainTxHash: '0xTargetHash',
    //         status: 'locked',
    //     });
    //     await transaction.save();

    //     const response = await testServer.executeOperation({
    //         query: `
    //             query {
    //                 getTransaction(id: "${transaction.id}") {
    //                     id
    //                     sender
    //                     token
    //                     amount
    //                     targetChainTxHash
    //                     status
    //                 }
    //             }
    //         `,
    //     });

    //     expect(response.data?.getTransaction.id).toBe(transaction.id);
    //     expect(response.data?.getTransaction.sender).toBe('0xSender');
    //     expect(response.data?.getTransaction.token).toBe('0xToken');
    //     expect(response.data?.getTransaction.amount).toBe('100');
    //     expect(response.data?.getTransaction.targetChainTxHash).toBe('0xTargetHash');
    //     expect(response.data?.getTransaction.status).toBe('locked');
    // });
});