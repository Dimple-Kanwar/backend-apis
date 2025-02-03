import { BaseContract, Contract, ContractRunner, ContractTransactionResponse, Signer, Wallet } from "ethers";
import { abi as tokenAbi } from "../artifacts/contracts/MockERC20Token.sol/MockERC20Token.json";
import { abi as bridgeAbi } from "../artifacts/contracts/Bridge.sol/Bridge.json";
import { expect } from "chai";
import { ethers } from "hardhat";
import { Bridge, BridgeValidator, MockERC20 } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("Bridge Contract Tests", function () {
    let sourceChainBridge: Bridge;
    let targetChainBridge: Bridge;
    let sourceTokenContract: MockERC20;
    let targetTokenContract: MockERC20;

    const sourceChainId = 84532;
    const targetChainId = 421614;
    const sourceChainRPC = process.env.BASE_TESTNET_RPC;
    const targetChainRPC = process.env.ARBITRUM_TESTNET_RPC;
    const owner = new Wallet(process.env.ADMIN_ACCOUNT_PK!);
    const sender = new Wallet(process.env.USER1_PK!);
    const recipient = new Wallet(process.env.USER2_PK!);
    const validator = new Wallet(process.env.VALIDATOR_ACCOUNT_PK!);
    const amount = "1"; // 1 USDT
    const formattedAmount = ethers.formatUnits("1", 6); // 1 USDT
    console.log({formattedAmount});
    before(async function () {
        // Get signers for both the chains
        const sourceProvider = new ethers.JsonRpcProvider(sourceChainRPC);
        const sourceAdmin = owner.connect(sourceProvider);
        const targetProvider = new ethers.JsonRpcProvider(targetChainRPC);
        const targetAdmin = owner.connect(targetProvider);
        const sourceValidator = validator.connect(sourceProvider);
        const targetValidator = validator.connect(targetProvider);

        // Connect to bridge contracts
        sourceChainBridge = new Contract(process.env.BASE_BRIDGE_ADDRESS!, bridgeAbi, sourceAdmin) as unknown as Bridge;
        targetChainBridge = new Contract(process.env.ARBITRUM_BRIDGE_ADDRESS!, bridgeAbi, sourceAdmin) as unknown as Bridge;

        // deploy mock ERC20 token on source chain
        sourceTokenContract = new Contract(process.env.B10_TOKEN_BASE!, tokenAbi, sourceAdmin) as unknown as MockERC20;
        targetTokenContract = new Contract(process.env.B10_TOKEN_ARBITRUM!, tokenAbi, targetAdmin) as unknown as MockERC20;


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
            console.log({isValidator});
            expect(isValidator).to.equal(true);
        });

        it("Should set owner as the correct validator address in target chain", async function () {
            const isValidator = await targetChainBridge.validators(owner);
            console.log({isValidator});
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

    // describe("Token Locking", function () {
    //     const lockAmount = ethers.parseEther("100");

    //     beforeEach(async function () {
    //         await token.connect(user1).approve(await bridge.getAddress(), lockAmount);
    //     });

    //     it("Should lock tokens successfully", async function () {
    //         await expect(bridge.connect(user1).lockTokens(
    //             await token.getAddress(),
    //             lockAmount,
    //             destChainId,
    //             user2.address
    //         )).to.emit(bridge, "TokensLocked")
    //             .withArgs(await token.getAddress(), user1.address, lockAmount);

    //         expect(await token.balanceOf(await bridge.getAddress())).to.equal(lockAmount);
    //     });

    //     it("Should fail when locking 0 tokens", async function () {
    //         await expect(bridge.connect(user1).lockTokens(
    //             await token.getAddress(),
    //             0,
    //             destChainId,
    //             user2.address
    //         )).to.be.revertedWith("Amount must be greater than 0");
    //     });

    //     it("Should fail when recipient is zero address", async function () {
    //         await expect(bridge.connect(user1).lockTokens(
    //             await token.getAddress(),
    //             lockAmount,
    //             destChainId,
    //             ethers.ZeroAddress
    //         )).to.be.revertedWith("Invalid recipient");
    //     });

    //     it("Should fail when destination chain is same as source", async function () {
    //         await expect(bridge.connect(user1).lockTokens(
    //             await token.getAddress(),
    //             lockAmount,
    //             sourceChainId,
    //             user2.address
    //         )).to.be.revertedWith("Invalid destination chain");
    //     });

    //     it("Should fail when contract is paused", async function () {
    //         await bridge.pause();
    //         await expect(bridge.connect(user1).lockTokens(
    //             await token.getAddress(),
    //             lockAmount,
    //             destChainId,
    //             user2.address
    //         )).to.be.revertedWith("Pausable: paused");
    //     });
    // });

    // describe("Token Release", function () {
    //     const releaseAmount = ethers.parseEther("100");
    //     let signature: any;

    //     beforeEach(async function () {
    //         // Lock tokens first
    //         await token.connect(user1).approve(await bridge.getAddress(), releaseAmount);
    //         await bridge.connect(user1).lockTokens(
    //             await token.getAddress(),
    //             releaseAmount,
    //             destChainId,
    //             user2.address
    //         );

    //         // Create and sign message
    //         const message = ethers.solidityPackedKeccak256(
    //             ["uint256", "uint256", "address", "uint256", "address"],
    //             [sourceChainId, destChainId, await token.getAddress(), releaseAmount, user2.address]
    //         );
    //         const messageHashBytes = ethers.getBytes(message);
    //         signature = await validatorSigner.signMessage(messageHashBytes);
    //     });

    //     it("Should release tokens successfully", async function () {
    //         await expect(bridge.connect(operator).releaseToken(
    //             sourceChainId,
    //             await token.getAddress(),
    //             releaseAmount,
    //             user2.address,
    //             signature
    //         )).to.emit(bridge, "TokensReleased")
    //             .withArgs(await token.getAddress(), user2.address, releaseAmount);

    //         expect(await token.balanceOf(user2.address)).to.equal(releaseAmount);
    //     });

    //     it("Should fail with invalid signature", async function () {
    //         const invalidSig = await user1.signMessage(
    //             ethers.getBytes(ethers.randomBytes(32))
    //         );

    //         await expect(bridge.connect(operator).releaseToken(
    //             sourceChainId,
    //             await token.getAddress(),
    //             releaseAmount,
    //             user2.address,
    //             invalidSig
    //         )).to.be.revertedWith("Invalid transaction signature");
    //     });

    //     it("Should fail when called by non-operator", async function () {
    //         await expect(bridge.connect(user1).releaseToken(
    //             sourceChainId,
    //             await token.getAddress(),
    //             releaseAmount,
    //             user2.address,
    //             signature
    //         )).to.be.revertedWith(
    //             `AccessControl: account ${user1.address.toLowerCase()} is missing role ${OPERATOR_ROLE}`
    //         );
    //     });

    //     it("Should fail when processing same transaction twice", async function () {
    //         await bridge.connect(operator).releaseToken(
    //             sourceChainId,
    //             await token.getAddress(),
    //             releaseAmount,
    //             user2.address,
    //             signature
    //         );

    //         await expect(bridge.connect(operator).releaseToken(
    //             sourceChainId,
    //             await token.getAddress(),
    //             releaseAmount,
    //             user2.address,
    //             signature
    //         )).to.be.revertedWith("Transaction already processed");
    //     });
    // });

    // describe("Access Control", function () {
    //     it("Should allow admin to pause/unpause", async function () {
    //         await expect(bridge.pause())
    //             .to.emit(bridge, "Paused")
    //             .withArgs(owner.address);

    //         await expect(bridge.unpause())
    //             .to.emit(bridge, "Unpaused")
    //             .withArgs(owner.address);
    //     });

    //     it("Should not allow non-admin to pause/unpause", async function () {
    //         await expect(bridge.connect(user1).pause())
    //             .to.be.reverted;

    //         await expect(bridge.connect(user1).unpause())
    //             .to.be.reverted;
    //     });

    //     it("Should allow admin to grant operator role", async function () {
    //         await expect(bridge.grantRole(OPERATOR_ROLE, user1.address))
    //             .to.emit(bridge, "RoleGranted")
    //             .withArgs(OPERATOR_ROLE, user1.address, owner.address);
    //     });
    // });

    // describe("Reentrancy Protection", function () {
    //     it("Should prevent reentrant calls during lock", async function () {
    //         const ReentrancyAttacker = await ethers.getContractFactory("ReentrancyAttacker");
    //         const attacker = await ReentrancyAttacker.deploy(await bridge.getAddress(), await token.getAddress());
    //         const attacker_address = await attacker.getAddress();
    //         await token.mint(attacker_address, ethers.parseEther("100"));
    //         await expect(attacker.attack()).to.be.reverted;
    //     });
    // });

    // describe("Edge Cases", function () {
    //     it("Should handle very large token amounts", async function () {
    //         const largeAmount = ethers.parseEther("1000000000"); // 1 billion tokens
    //         await token.mint(user1.address, largeAmount);
    //         await token.connect(user1).approve(await bridge.getAddress(), largeAmount);

    //         await expect(bridge.connect(user1).lockTokens(
    //             await token.getAddress(),
    //             largeAmount,
    //             destChainId,
    //             user2.address
    //         )).to.not.be.reverted;
    //     });

    //     it("Should handle token contracts with non-standard decimals", async function () {
    //         const NonStandardToken = await ethers.getContractFactory("MockERC20");
    //         const token6Dec = await NonStandardToken.deploy("6 Decimals Token", "SDT");

    //         const amount = ethers.parseUnits("100", 6);
    //         await token6Dec.mint(user1.address, amount);
    //         await token6Dec.connect(user1).approve(await bridge.getAddress(), amount);

    //         await expect(bridge.connect(user1).lockTokens(
    //             await token6Dec.getAddress(),
    //             amount,
    //             destChainId,
    //             user2.address
    //         )).to.not.be.reverted;
    //     });
    // });
});