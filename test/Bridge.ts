import { ApolloServer } from '@apollo/server';
import { loadSchema } from '../schema/schema';
// import { Transaction } from './models/Transaction';
import { expect } from 'chai';
import { CHAIN_CONFIGS } from '../config/chains';
import { ethers } from 'hardhat';
import { Contract, ContractTransactionResponse, Wallet } from 'ethers';
import { Bridge, BridgeValidator, MockERC20Token } from '../typechain-types';
import { abi } from "../artifacts/contracts/MockERC20Token.sol/MockERC20Token.json";

const schema = loadSchema();
const testServer = new ApolloServer({
    schema
});

describe.only('Bridge API', () => {
    let sourceChainBridge: Bridge & { deploymentTransaction(): ContractTransactionResponse; }
    let targetChainBridge: Bridge & { deploymentTransaction(): ContractTransactionResponse; }
    let sourceValidatorContract: BridgeValidator & { deploymentTransaction(): ContractTransactionResponse; };
    let targetValidatorContract: BridgeValidator & { deploymentTransaction(): ContractTransactionResponse; };
    let sourceTokenContract;
    let targetTokenContract;

    const sourceChainId = 84532;
    const targetChainId = 421614;
    const sourceChainRPC = process.env.BASE_TESTNET_RPC;
    const targetChainRPC = process.env.ROOTSTOCK_TESTNET_RPC;
    const owner = process.env.ADMIN_ACCOUNT_PK;
    let sourceToken: string;
    let targetToken;
    const OPERATOR_ROLE = ethers.keccak256(ethers.toUtf8Bytes("OPERATOR_ROLE"));
    const sender = new Wallet(process.env.USER1_PK!);
    const recipient = new Wallet(process.env.USER2_PK!);
    const validator = new Wallet(process.env.VALIDATOR_ACCOUNT_PK!);
    const amount = "1"; // 1 USDT
    const formattedAmount = ethers.formatUnits("1", 6); // 1 USDT

    before(async function () {

        // Get signers for both the chains
        const sourceProvider = new ethers.JsonRpcProvider(sourceChainRPC);
        const sourceAdmin = new Wallet(owner!, sourceProvider);
        const targetProvider = new ethers.JsonRpcProvider(targetChainRPC);
        const targetAdmin = new Wallet(owner!, targetProvider);
        const sourceValidator = validator.connect(sourceProvider);
        const targetValidator = validator.connect(targetProvider);

        // deploy mock ERC20 token on source chain
        // const MockERC20SourceToken = (await ethers.getContractFactory("MockERC20Token")).connect(sourceAdmin);
        const sourceTokenContract = new Contract('0xab52AeDE8579C847cD20865d2f81a782EF646Cc5', abi, sourceAdmin);
        // sourceTokenContract = await MockERC20SourceToken.deploy("USD Token", "USDT", 6)
        sourceToken = await sourceTokenContract.getAddress();
        // sourceTokenContract.connect()
        // console.log({sourceToken});
        // deploy mock ERC20 token on target chain
        // const MockERC20TargetToken = (await ethers.getContractFactory("MockERC20Token")).connect(targetAdmin);
        const targetTokenContract = new Contract('0xd43e27C9A7573707484F905bbCE6595ac4cfc319', abi, targetAdmin);
        // targetTokenContract = await MockERC20TargetToken.deploy("USD Token", "USDT", 6);
        targetToken = await targetTokenContract.getAddress();
        // console.log({targetToken});
        

        // Mint tokens to users
        const mintTxS = await sourceTokenContract.mint(sender, ethers.parseEther("1000"));
        const receipt1 = await mintTxS.wait();
        console.log({receipt1});
        const mintTxT = await targetTokenContract.mint(recipient, ethers.parseEther("1000"));
        const receipt2 = await mintTxT.wait();
        console.log({receipt2});
        // // Deploy validator on source chain
        // const BridgeValidator = await ethers.getContractFactory("BridgeValidator");
        // sourceValidatorContract = await BridgeValidator.deploy(sourceValidator.address);
        // await sourceValidatorContract.waitForDeployment();
        // const sourceValidatorContractAddress = await sourceValidatorContract.getAddress();
        // console.log({sourceValidatorContractAddress});

        // // Deploy validator on target chain
        // targetValidatorContract = await BridgeValidator.deploy(targetValidator.address);
        // await targetValidatorContract.waitForDeployment();
        // const targetValidatorContractAddress = await targetValidatorContract.getAddress();
        // console.log({targetValidatorContractAddress});
        
        // // Deploy bridge
        // const Bridge = await ethers.getContractFactory("Bridge");
        // sourceChainBridge = await Bridge.deploy(sourceValidatorContractAddress, sourceChainId);
        // const sourceChainBridgeAddress = await sourceChainBridge.getAddress();
        // console.log({sourceChainBridgeAddress});

        // targetChainBridge = await Bridge.deploy(targetValidatorContractAddress, targetChainId);
        // const targetChainBridgeAddress = await targetChainBridge.getAddress();
        // console.log({targetChainBridgeAddress});


        // Grant operator role
        // await sourceChainBridge.grantRole(OPERATOR_ROLE, process.env.ADMIN_ACCOUNT_PK!);
        // await targetChainBridge.grantRole(OPERATOR_ROLE, process.env.ADMIN_ACCOUNT_PK!);

        // sender approves decimal account to spend amount of token on source chain
        // await sourceTokenContract.connect(sender).approve(owner!, formattedAmount);
        // recipient approves decimal account to spend amount of token on target chain
        // await targetTokenContract.connect(recipient).approve(owner!, formattedAmount);
    });


    it('should lock tokens', async () => {
        const bridgeRequest = {
            sourceChainId,
            targetChainId,
            token: sourceToken,
            amount,
            sender: sender.address,
            recipient: recipient.address
        }
        const response = await testServer.executeOperation({
            query: `
                mutation {
                    bridgeToken(token: ${bridgeRequest.token}, sourceChainId: ${bridgeRequest.sourceChainId}, targetChainId: ${bridgeRequest.targetChainId}, amount: ${bridgeRequest.amount}, sender: ${bridgeRequest.sender}, recipient: ${bridgeRequest.recipient}) {
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