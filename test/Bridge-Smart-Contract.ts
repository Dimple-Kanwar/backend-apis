import { BaseContract, Contract, ContractRunner, ContractTransactionResponse, JsonRpcProvider, Provider, Signer, Wallet } from "ethers";
import { abi as tokenAbi } from "../artifacts/contracts/MockERC20Token.sol/MockERC20Token.json";
import { abi as bridgeAbi } from "../artifacts/contracts/Bridge.sol/Bridge.json";
import { expect } from "chai";
import { ethers } from "hardhat";
import { Bridge, BridgeValidator, MockERC20 } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { generateLockHash, generateNonce, generateReleaseHash } from "../utils/common";
import { send } from "process";
import { GasService } from "../services/gas.service";

describe.only("Bridge Contract Tests", function () {
    let sourceChainBridge: Bridge;
    let targetChainBridge: Bridge;
    const sourceBridgeAddress = process.env.BASE_BRIDGE_ADDRESS!;
    const targetBridgeAddress = process.env.ARBITRUM_BRIDGE_ADDRESS!;

    let sourceTokenContract: MockERC20;
    let targetTokenContract: MockERC20;

    const sourceChainId = 84532;
    const targetChainId = 421614;
    const sourceChainRPC = process.env.BASE_TESTNET_RPC;
    const targetChainRPC = process.env.ARBITRUM_TESTNET_RPC;
    const owner = new Wallet(process.env.ADMIN_ACCOUNT_PK!);
    const sender = new Wallet(process.env.USER1_PK!);
    let senderProvider: Wallet | ContractRunner | null | undefined;
    let recipientProvider: Wallet | ContractRunner | null | undefined;
    const recipient = new Wallet(process.env.USER2_PK!);
    const validator = new Wallet(process.env.VALIDATOR_ACCOUNT_PK!);
    const amount = "1"; // 1 USDT
    const sourceToken = process.env.B10_TOKEN_BASE!;
    const targetToken = process.env.B10_TOKEN_ARBITRUM!;
    const formattedAmount = ethers.parseEther(amount); // 1 USDT
    let sourceProvider: Provider | JsonRpcProvider | null;
    let targetProvider: Provider | JsonRpcProvider | null;

    before(async function () {
        // Get signers for both the chains
        sourceProvider = new ethers.JsonRpcProvider(sourceChainRPC);
        const sourceAdmin = owner.connect(sourceProvider);
        targetProvider = new ethers.JsonRpcProvider(targetChainRPC);
        const targetAdmin = owner.connect(targetProvider);
        const sourceValidator = validator.connect(sourceProvider);
        const targetValidator = validator.connect(targetProvider);
        senderProvider = sender.connect(sourceProvider);
        recipientProvider = recipient.connect(targetProvider);
        // Connect to bridge contracts
        sourceChainBridge = new Contract(sourceBridgeAddress, bridgeAbi, sourceAdmin) as unknown as Bridge;
        targetChainBridge = new Contract(targetBridgeAddress, bridgeAbi, targetAdmin) as unknown as Bridge;

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
            expect(isValidator).to.equal(true);
        });

        it("Should set owner as the correct validator address in target chain", async function () {
            const isValidator = await targetChainBridge.validators(owner);
            expect(isValidator).to.equal(true);
        });


        it("Should have sufficient balance in sender account", async function () {
            expect(await sourceTokenContract.balanceOf(sender)).to.greaterThanOrEqual(amount);
        });

        it("Should have sufficient balance in recipient account", async function () {
            expect(await targetTokenContract.balanceOf(recipient)).to.greaterThanOrEqual(amount);
        });

        it("Should have only 1 validator", async function () {
            expect(Number(await sourceChainBridge.validatorCount())).to.eq(1);
        });
    });

    describe("Token Locking", function () {

        // it("Sender Should have sufficient funds to run approval", async function () {
        //     const balance = await senderProvider?.provider?.getBalance(sender.address);
        //     console.log({ balance });
        //     const gasService = new GasService(senderProvider?.provider!);
        //     const estimateGas = gasService.estimateGasLimit(sourceToken, "approve", [sourceBridgeAddress, formattedAmount] )
        //     console.log({ estimateGas });
        //     expect(estimateGas).to.greaterThanOrEqual(balance);
        // });

        it("Sender Should have sufficient tokens to bridge", async function () {
            const balance = await sourceTokenContract.connect(senderProvider).balanceOf(sender.address);
            console.log({ balance });
            expect(balance).to.greaterThanOrEqual(formattedAmount);
        });

        it("Sender should approve the amount to bridge", async function () {
            const approvalTx = await sourceTokenContract.connect(senderProvider).approve(sourceBridgeAddress, formattedAmount);
            await approvalTx.wait();
            await expect(approvalTx).to.emit(sourceTokenContract, "Approval")
                .withArgs(sender.address, sourceBridgeAddress, formattedAmount);
        });

        it("Should lock tokens successfully", async function () {
            const nonce = await generateNonce(sender.address);
            const targetChainTxHash = await generateLockHash(sourceToken, sender.address, recipient.address, formattedAmount, nonce, sourceChainId, targetChainId);
            const tx = await sourceChainBridge.connect(owner.connect(sourceProvider)).executeTokenOperation(
                sourceToken,
                formattedAmount,
                sender.address,
                targetChainTxHash,
                true
            );
            await tx.wait();
            console.log({lockHash: tx.hash});
            await expect(tx).to.emit(sourceChainBridge, "TokensLocked")
                .withArgs(sourceToken, sender.address, formattedAmount, targetChainTxHash);
        });

        it("Source Bridge should have the token balance", async function () {
            expect(await sourceTokenContract.balanceOf(await sourceChainBridge.getAddress())).to.greaterThanOrEqual(formattedAmount);
        });
    });

    describe("Token Release", function () {

        // it("Sender Should have sufficient funds to run approval", async function () {
        //     const gasLimit = await targetTokenContract.connect(recipientProvider).approve.estimateGas(targetBridgeAddress, formattedAmount);
        //     expect(gasLimit).to.greaterThanOrEqual(formattedAmount);
        // });

        it("Provide liquidity to target bridge", async function () {
            const balance = await targetTokenContract.connect(recipientProvider).balanceOf(recipient.address);
            console.log({ balance });
            const approvalTx = await targetTokenContract.connect(recipientProvider).approve(targetBridgeAddress, formattedAmount);
            console.log({ approvalTx });
            await approvalTx.wait();
            await expect(approvalTx).to.emit(targetTokenContract, "Approval")
                .withArgs(recipient.address, targetBridgeAddress, formattedAmount);
            expect(await targetTokenContract.transferFrom(recipient.address, targetBridgeAddress, formattedAmount)).to.emit(targetTokenContract, "Transfer").withArgs(recipient.address, targetBridgeAddress, formattedAmount);
        });

        it("Target Bridge should have sufficient liquidity", async function () {
            expect(await targetTokenContract.balanceOf(targetBridgeAddress)).to.greaterThanOrEqual(formattedAmount);
        })

        it("Should release tokens successfully", async function () {
            const nonce = await generateNonce(sender.address);
            const lockTxHash = '0x257ce98a6084ad193d86308d3ee32c18ab200a9c4871d345e55a525a160437aa';
            const sourceChainTxHash = await generateReleaseHash(targetToken, sender.address, recipient.address, formattedAmount, nonce, lockTxHash, sourceChainId, targetChainId);
            const tx = await targetChainBridge.executeTokenOperation(
                targetToken,
                formattedAmount,
                recipient.address,
                sourceChainTxHash,
                false
            );
            await tx.wait();
            console.log({releaseHash: tx.hash});
            await expect(tx).to.emit(targetChainBridge, "TokensReleased")
                .withArgs(targetToken, recipient.address, formattedAmount, sourceChainTxHash);
            expect(await targetTokenContract.balanceOf(recipient.address)).to.greaterThanOrEqual(formattedAmount);
        });
    });
});