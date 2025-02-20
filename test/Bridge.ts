import { ApolloServer } from '@apollo/server';
import { loadSchema } from '../schema/schema';
// import { Transaction } from './models/Transaction';
import { expect } from 'chai';
import { CHAIN_CONFIGS } from '../config/chains';
import { ethers } from 'hardhat';
import { Contract, ContractTransactionResponse, Wallet } from 'ethers';
import { Bridge, BridgeValidator, MockERC20, MockERC20Token } from '../typechain-types';
import { abi as tokenAbi } from "../artifacts/contracts/MockERC20Token.sol/MockERC20Token.json";
import { abi as bridgeAbi } from "../artifacts/contracts/Bridge.sol/Bridge.json";

const schema = loadSchema();
const testServer = new ApolloServer({
    schema
});

describe('Bridge API', () => {
    let sourceChainBridge: Bridge;
    let targetChainBridge: Bridge;
    let sourceTokenContract: MockERC20;
    let targetTokenContract: MockERC20;
    const sourceBridgeAddress = process.env.BASE_BRIDGE_ADDRESS!;
    const targetBridgeAddress = process.env.ARBITRUM_BRIDGE_ADDRESS!;
    const sourceChainId = 84532;
    const targetChainId = 421614;
    const sourceChainRPC = process.env.BASE_SEPOLIA_RPC;
    const targetChainRPC = process.env.ARBITRUM_TESTNET_RPC;
    const owner = new Wallet(process.env.ADMIN_ACCOUNT_PK!);
    const sender = new Wallet(process.env.USER1_PK!);
    const recipient = new Wallet(process.env.USER2_PK!);
    const validator = new Wallet(process.env.VALIDATOR_ACCOUNT_PK!);
    const amount = "1"; // 1 USDT
    const sourceToken = process.env.B10_TOKEN_BASE!;
    const targetToken = process.env.B10_TOKEN_ARBITRUM!;
    const formattedAmount = ethers.parseEther(amount); // 1 USDT
    console.log({ formattedAmount });

    before(async function () {
        // Get signers for both the chains
        const sourceProvider = new ethers.JsonRpcProvider(sourceChainRPC);
        const sourceAdmin = owner.connect(sourceProvider);
        const targetProvider = new ethers.JsonRpcProvider(targetChainRPC);
        const targetAdmin = owner.connect(targetProvider);
        const sourceValidator = validator.connect(sourceProvider);
        const targetValidator = validator.connect(targetProvider);

        // Connect to bridge contracts
        sourceChainBridge = new Contract(sourceBridgeAddress, bridgeAbi, sourceAdmin) as unknown as Bridge;
        targetChainBridge = new Contract(targetBridgeAddress, bridgeAbi, sourceAdmin) as unknown as Bridge;

        // deploy mock ERC20 token on source chain
        sourceTokenContract = new Contract(sourceToken, tokenAbi, sourceAdmin) as unknown as MockERC20;
        targetTokenContract = new Contract(targetToken, tokenAbi, targetAdmin) as unknown as MockERC20;


        // Mint tokens to users
        // const mintTxS = await sourceTokenContract.mint(sender, ethers.parseEther("1000"))
        // const receipt1 = await mintTxS.wait();
        // console.log({ receipt1 });
        // const mintTxT = await targetTokenContract.mint(recipient, ethers.parseEther("1000"));
        // const receipt2 = await mintTxT.wait();
        // console.log({ receipt2 });
    });

    describe("Deployment", function () {
        it("Should set the correct owner address", async function () {
            expect(await sourceChainBridge.owner()).to.equal(owner);
        });

        it("Should set owner as the correct admin address", async function () {
            expect(await sourceChainBridge.admin()).to.equal(owner);
        });

        it("Should set owner as the correct validator address in source chain", async function () {
            const isValidator = await sourceChainBridge.validators(owner);
            console.log({ isValidator });
            expect(isValidator).to.equal(true);
        });

        it("Should set owner as the correct validator address in target chain", async function () {
            const isValidator = await targetChainBridge.validators(owner);
            console.log({ isValidator });
            expect(isValidator).to.equal(true);
        });


        it("Should have sufficient balance in sender account", async function () {
            expect(await sourceTokenContract.balanceOf(sender)).to.greaterThanOrEqual(amount);
        });

        it("Should have sufficient balance in recipient account", async function () {
            expect(await targetTokenContract.balanceOf(recipient)).to.greaterThanOrEqual(amount);
        });

        it("Should have only 1 validator", async function () {
            expect(await sourceChainBridge.validatorCount()).to.length(1);
        });
    });

    it('should lock tokens', async () => {
        const bridgeRequest = {
            sourceChainId,
            targetChainId,
            sourceToken,
            amount: formattedAmount,
            sender: sender.address,
            recipient: recipient.address
        }
        const response = await testServer.executeOperation({
            query: `
                mutation {
                    bridgeToken(token: ${bridgeRequest.sourceToken}, sourceChainId: ${bridgeRequest.sourceChainId}, targetChainId: ${bridgeRequest.targetChainId}, amount: ${bridgeRequest.amount}, sender: ${bridgeRequest.sender}, recipient: ${bridgeRequest.recipient}) {
                        id
                        error
                        transactionHash
                        status
                    }
                }
            `,
        });
        console.log({ res: JSON.stringify(response) });
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