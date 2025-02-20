import { AddressLike, AddressLike, BaseContract, Contract, ContractRunner, ContractTransactionResponse, JsonRpcProvider, Provider, Signer, Typed, Typed, Wallet } from "ethers";
import { abi as tokenAbi } from "../artifacts/contracts/MockERC20Token.sol/MockERC20Token.json";
import { abi as bridgeAbi } from "../artifacts/contracts/Bridge.sol/Bridge.json";
import { expect } from "chai";
import { ethers } from "hardhat";
import { Bridge, BridgeValidator, MockERC20 } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { generateLockHash, generateNonce, generateReleaseHash } from "../utils/common";
import { send } from "process";
import { GasService } from "../services/gas.service";

describe("Bridge Contract Tests", function () {
    let sourceChainBridge: Bridge;
    let targetChainBridge: Bridge;
    let sourceBridgeAddress: string;
    let targetBridgeAddress: string;

    let sourceTokenContract: MockERC20;
    let targetTokenContract: MockERC20;

    const sourceChainId = 11155111; // Sepolia
    const targetChainId = 84532; // Base Sepolia
    const sourceToken: AddressLike | Typed = process.env.B10_TOKEN_SEPOLIA!;
    const targetToken: AddressLike | Typed = process.env.B10_TOKEN_BASE!;
    let owner: Wallet;
    let sender: Wallet;
    let recipient: Wallet;
    let validator: Wallet;
    const amount = "1"; // 1 USDT
    const formattedAmount = ethers.parseEther(amount);
    let sourceProvider: JsonRpcProvider;
    let targetProvider: JsonRpcProvider;

    before(async function () {
        // Get signers
        [owner, sender, recipient, validator] = await ethers.getSigners() as unknown as Wallet[];
        sourceProvider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
        targetProvider = new ethers.JsonRpcProvider(process.env.BASE_SEPOLIA_RPC_URL);

        // Deploy mock Pyth contract
        const MockPythFactory = await ethers.getContractFactory("MockPyth", owner);
        const mockPyth = await MockPythFactory.deploy();

        // Deploy Bridge contracts
        const BridgeFactory = await ethers.getContractFactory("Bridge", owner);
        sourceChainBridge = await BridgeFactory.deploy(
            await mockPyth.getAddress(), // Mock Pyth contract
            3600, // Price feed max age (1 hour)
            3600, // Admin delay (1 hour)
            3600, // Rate limit duration (1 hour)
            ethers.parseEther("1000000"), // 1M max transfer per hour
            1, // Required signatures
            10 // Max validators
        ) as Bridge;
        targetChainBridge = await BridgeFactory.deploy(
            await mockPyth.getAddress(),
            3600,
            3600,
            3600,
            ethers.parseEther("1000000"),
            1,
            10
        ) as Bridge;


        sourceBridgeAddress = await sourceChainBridge.getAddress();
        targetBridgeAddress = await targetChainBridge.getAddress();

        // Deploy mock ERC20 tokens
        const TokenFactory = await ethers.getContractFactory("MockERC20", owner);
        sourceTokenContract = await TokenFactory.deploy("Source Token", "SRC") as MockERC20;
        targetTokenContract = await TokenFactory.deploy("Target Token", "TGT") as MockERC20;

        // Mint tokens to users
        await sourceTokenContract.mint(sender.address, ethers.parseEther("1000"));
        await targetTokenContract.mint(recipient.address, ethers.parseEther("1000"));


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
            expect(await sourceChainBridge.owner()).to.equal(owner.address);
        });

        it("Should set owner as the correct admin address", async function () {
            expect(await sourceChainBridge.admin()).to.equal(owner.address);
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
            expect(await sourceTokenContract.balanceOf(sender.address)).to.greaterThanOrEqual(formattedAmount);
        });

        it("Should have sufficient balance in recipient account", async function () {
            expect(await targetTokenContract.balanceOf(recipient.address)).to.greaterThanOrEqual(formattedAmount);
        });

        it("Should have only 1 validator", async function () {
            expect(Number(await sourceChainBridge.validatorCount())).to.eq(1);
        });
    });

    describe("Token Operations", function () {
        let userSignature: string;
        let nonce: bigint;
        let deadline: number;

        beforeEach(async function () {
            // Get current nonce
            nonce = await sourceChainBridge.userNonces(sender.address);
            // Set deadline to 1 hour from now
            deadline = Math.floor(Date.now() / 1000) + 3600;
        });

        describe("Token Locking", function () {
            beforeEach(async function () {
                // Approve tokens
                await sourceTokenContract.connect(sourceProvider!).approve(sourceBridgeAddress, formattedAmount);
                
                // Generate signature
                const messageHash = await sourceChainBridge.getMessageHash(
                    sourceToken,
                    sender.address,
                    formattedAmount,
                    ethers.ZeroHash,
                    true,  // isLock
                    nonce,
                    deadline
                );
                userSignature = await sender.signMessage(ethers.getBytes(messageHash));
            });

            it("Should lock tokens with valid signature", async function () {
                const tx = await sourceChainBridge.connect(owner).executeTokenOperation(
                    sourceToken,
                    sender.address,
                    formattedAmount,
                    ethers.ZeroHash,
                    true,  // isLock
                    userSignature,
                    deadline,
                    nonce
                );
                await tx.wait();

                // Verify token lock
                const bridgeBalance = await sourceTokenContract.balanceOf(sourceBridgeAddress);
                expect(bridgeBalance).to.equal(formattedAmount);
            });

            it("Should fail with invalid signature", async function () {
                const invalidSignature = await recipient.signMessage(ethers.getBytes(ethers.ZeroHash));
                await expect(
                    sourceChainBridge.connect(owner).executeTokenOperation(
                        sourceToken,
                        sender.address,
                        formattedAmount,
                        ethers.ZeroHash,
                        true,
                        invalidSignature,
                        deadline,
                        nonce
                    )
                ).to.be.revertedWithCustomError(sourceChainBridge, "InvalidSignature");
            });

            it("Should fail with expired deadline", async function () {
                const expiredDeadline = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
                await expect(
                    sourceChainBridge.connect(owner).executeTokenOperation(
                        sourceToken,
                        sender.address,
                        formattedAmount,
                        ethers.ZeroHash,
                        true,
                        userSignature,
                        expiredDeadline,
                        nonce
                    )
                ).to.be.revertedWithCustomError(sourceChainBridge, "SignatureExpired");
            });

            it("Should fail with invalid nonce", async function () {
                const invalidNonce = nonce + 1n;
                await expect(
                    sourceChainBridge.connect(owner).executeTokenOperation(
                        sourceToken,
                        sender.address,
                        formattedAmount,
                        ethers.ZeroHash,
                        true,
                        userSignature,
                        deadline,
                        invalidNonce
                    )
                ).to.be.revertedWithCustomError(sourceChainBridge, "InvalidInput");
            });
        });

        describe("Token Releasing", function () {
            beforeEach(async function () {
                // Generate signature for release
                const messageHash = await targetChainBridge.getMessageHash(
                    targetToken,
                    recipient.address,
                    formattedAmount,
                    ethers.ZeroHash,
                    false,  // isLock
                    nonce,
                    deadline
                );
                userSignature = await recipient.signMessage(ethers.getBytes(messageHash));
            });

            it("Should release tokens with valid signature", async function () {
                const initialBalance = await targetTokenContract.balanceOf(recipient.address);
                
                const tx = await targetChainBridge.connect(owner).executeTokenOperation(
                    targetToken,
                    recipient.address,
                    formattedAmount,
                    ethers.ZeroHash,
                    false,  // isLock
                    userSignature,
                    deadline,
                    nonce
                );
                await tx.wait();

                const finalBalance = await targetTokenContract.balanceOf(recipient.address);
                expect(finalBalance - initialBalance).to.equal(formattedAmount);
            });
        });

        describe("Native Token Operations", function () {
            const nativeAmount = ethers.parseEther("0.1");

            it("Should lock native tokens", async function () {
                const messageHash = await sourceChainBridge.getMessageHash(
                    ethers.ZeroAddress,
                    sender.address,
                    nativeAmount,
                    ethers.ZeroHash,
                    true,
                    nonce,
                    deadline
                );
                userSignature = await sender.signMessage(ethers.getBytes(messageHash));

                const initialBalance = await sourceProvider!.getBalance(sourceBridgeAddress);
                
                const tx = await sourceChainBridge.connect(owner).executeTokenOperation(
                    ethers.ZeroAddress,  // token
                    sender.address,       // account
                    nativeAmount,         // amount
                    ethers.ZeroHash,      // txHash
                    true,                 // isLock
                    userSignature,        // userSignature
                    deadline,             // deadline
                    nonce,                // nonce
                    { value: nativeAmount } // overrides
                );
                await tx.wait();

                const finalBalance = await sourceProvider!.getBalance(sourceBridgeAddress);
                expect(finalBalance - initialBalance).to.equal(nativeAmount);
            });

            it("Should release native tokens", async function () {
                const initialBalance = await targetProvider!.getBalance(recipient.address);
                
                const messageHash = await targetChainBridge.getMessageHash(
                    ethers.ZeroAddress,
                    recipient.address,
                    nativeAmount,
                    ethers.ZeroHash,
                    false,
                    nonce,
                    deadline
                );
                userSignature = await recipient.signMessage(ethers.getBytes(messageHash));

                const tx = await targetChainBridge.connect(owner).executeTokenOperation(
                    ethers.ZeroAddress,  // token
                    recipient.address,    // account
                    nativeAmount,         // amount
                    ethers.ZeroHash,      // txHash
                    false,                // isLock
                    userSignature,        // userSignature
                    deadline,             // deadline
                    nonce                 // nonce
                );
                await tx.wait();

                const finalBalance = await targetProvider!.getBalance(recipient.address);
                expect(finalBalance - initialBalance).to.equal(nativeAmount);
            });
        });
    });

    describe("Security Features", function () {
        describe("Account Blacklisting", function () {
            it("Should blacklist and unblacklist account", async function () {
                await sourceChainBridge.connect(owner).blacklistAccount(sender.address);
                expect(await sourceChainBridge.blacklistedAccounts(sender.address)).to.be.true;

                await sourceChainBridge.connect(owner).unblacklistAccount(sender.address);
                expect(await sourceChainBridge.blacklistedAccounts(sender.address)).to.be.false;
            });

            it("Should prevent operations from blacklisted account", async function () {
                await sourceChainBridge.connect(owner).blacklistAccount(sender.address);

                const nonce = await sourceChainBridge.userNonces(sender.address);
                const deadline = Math.floor(Date.now() / 1000) + 3600;
                const messageHash = await sourceChainBridge.getMessageHash(
                    sourceToken,
                    sender.address,
                    formattedAmount,
                    ethers.ZeroHash,
                    true,
                    nonce,
                    deadline
                );
                const signature = await sender.signMessage(ethers.getBytes(messageHash));

                await expect(
                    sourceChainBridge.connect(owner).executeTokenOperation(
                        sourceToken,
                        sender.address,
                        formattedAmount,
                        ethers.ZeroHash,
                        true,
                        signature,
                        deadline,
                        nonce
                    )
                ).to.be.revertedWithCustomError(sourceChainBridge, "AccountBlacklisted");

                // Cleanup
                await sourceChainBridge.connect(owner).unblacklistAccount(sender.address);
            });
        });

        describe("Daily Limits", function () {
            it("Should enforce daily operation limits", async function () {
                const largeAmount = ethers.parseEther("1000000"); // Very large amount
                const nonce = await sourceChainBridge.userNonces(sender.address);
                const deadline = Math.floor(Date.now() / 1000) + 3600;
                
                const messageHash = await sourceChainBridge.getMessageHash(
                    sourceToken,
                    sender.address,
                    largeAmount,
                    ethers.ZeroHash,
                    true,
                    nonce,
                    deadline
                );
                const signature = await sender.signMessage(ethers.getBytes(messageHash));

                await expect(
                    sourceChainBridge.connect(owner).executeTokenOperation(
                        sourceToken,
                        sender.address,
                        largeAmount,
                        ethers.ZeroHash,
                        true,
                        signature,
                        deadline,
                        nonce
                    )
                ).to.be.revertedWithCustomError(sourceChainBridge, "DailyLimitExceeded");
            });
        });

        describe("Account Recovery", function () {
            it("Should recover blacklisted account", async function () {
                const newAccount = ethers.Wallet.createRandom();
                
                // First blacklist the account
                await sourceChainBridge.connect(owner).blacklistAccount(sender.address);

                // Initiate recovery (need 3 validators)
                await sourceChainBridge.connect(owner).initiateAccountRecovery(sender.address, newAccount.address);
                
                // Add two more validators and have them sign
                const validator2 = ethers.Wallet.createRandom();
                const validator3 = ethers.Wallet.createRandom();
                
                await sourceChainBridge.connect(owner).addValidator(validator2.address);
                await sourceChainBridge.connect(owner).addValidator(validator3.address);

                await sourceChainBridge.connect(validator2).initiateAccountRecovery(sender.address, newAccount.address);
                await sourceChainBridge.connect(validator3).initiateAccountRecovery(sender.address, newAccount.address);

                // Verify recovery
                expect(await sourceChainBridge.blacklistedAccounts(sender.address)).to.be.false;
                expect(await sourceChainBridge.userNonces(newAccount.address)).to.equal(
                    await sourceChainBridge.userNonces(sender.address)
                );
            });
        });
    });

    describe("Token Lock and Release", function () {
        describe("Token Lock", function () {
            it("Should have sufficient tokens to bridge", async function () {
                const balance = await sourceTokenContract.balanceOf(sender.address);
                expect(balance).to.greaterThanOrEqual(formattedAmount);
            });

            it("Should approve bridge contract", async function () {
                const approvalTx = await sourceTokenContract.connect(senderProvider).approve(sourceBridgeAddress, formattedAmount);
                await approvalTx.wait();
                await expect(approvalTx).to.emit(sourceTokenContract, "Approval")
                    .withArgs(sender.address, sourceBridgeAddress, formattedAmount);
            });

            it("Should lock tokens successfully", async function () {
                const nonce = await sourceChainBridge.userNonces(sender.address);
                const deadline = Math.floor(Date.now() / 1000) + 3600;
                const messageHash = await sourceChainBridge.getMessageHash(
                    sourceToken,
                    sender.address,
                    formattedAmount,
                    ethers.ZeroHash,
                    true,
                    nonce,
                    deadline
                );
                const userSignature = await sender.signMessage(ethers.getBytes(messageHash));

                const tx = await sourceChainBridge.connect(owner).executeTokenOperation(
                    sourceToken,
                    sender.address,
                    formattedAmount,
                    ethers.ZeroHash,
                    true,
                    userSignature,
                    deadline,
                    nonce
                );
                await tx.wait();

                const bridgeBalance = await sourceTokenContract.balanceOf(sourceBridgeAddress);
                expect(bridgeBalance).to.equal(formattedAmount);
            });
        });

        describe("Token Release", function () {
            beforeEach(async function () {
                // Provide liquidity to target bridge
                await targetTokenContract.connect(recipientProvider).approve(targetBridgeAddress, formattedAmount);
                await targetTokenContract.connect(recipientProvider).transfer(targetBridgeAddress, formattedAmount);
            });

            it("Should have sufficient liquidity", async function () {
                const bridgeBalance = await targetTokenContract.balanceOf(targetBridgeAddress);
                expect(bridgeBalance).to.greaterThanOrEqual(formattedAmount);
            });

            it("Should release tokens successfully", async function () {
                const nonce = await targetChainBridge.userNonces(recipient.address);
                const deadline = Math.floor(Date.now() / 1000) + 3600;
                const messageHash = await targetChainBridge.getMessageHash(
                    targetToken,
                    recipient.address,
                    formattedAmount,
                    ethers.ZeroHash,
                    false,
                    nonce,
                    deadline
                );
                const userSignature = await recipient.signMessage(ethers.getBytes(messageHash));

                const initialBalance = await targetTokenContract.balanceOf(recipient.address);
                
                const tx = await targetChainBridge.connect(owner).executeTokenOperation(
                    targetToken,
                    recipient.address,
                    formattedAmount,
                    ethers.ZeroHash,
                    false,
                    userSignature,
                    deadline,
                    nonce
                );
                await tx.wait();

                const finalBalance = await targetTokenContract.balanceOf(recipient.address);
                expect(finalBalance - initialBalance).to.equal(formattedAmount);
            });
        });
    });
});