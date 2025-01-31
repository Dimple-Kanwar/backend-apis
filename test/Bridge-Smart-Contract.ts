// import { BaseContract, Contract, ContractRunner, ContractTransactionResponse, Signer } from "ethers";

// import { expect } from "chai";
// import { ethers } from "hardhat";
// import { Bridge, BridgeValidator, MockERC20 } from "../typechain-types";
// import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

// describe("Bridge Contract Tests", function () {
//     let bridge: Bridge & { deploymentTransaction(): ContractTransactionResponse; }
//     let validator: BridgeValidator & { deploymentTransaction(): ContractTransactionResponse; };
//     let token: MockERC20 & { deploymentTransaction(): ContractTransactionResponse; };
//     let owner: HardhatEthersSigner;
//     let operator: HardhatEthersSigner;
//     let user1: HardhatEthersSigner;
//     let user2: HardhatEthersSigner;
//     let validatorSigner: HardhatEthersSigner;

//     const sourceChainId = 1;
//     const destChainId = 2;
//     const OPERATOR_ROLE = ethers.keccak256(ethers.toUtf8Bytes("OPERATOR_ROLE"));

//     beforeEach(async function () {
//         // Get signers
//         [owner, operator, user1, user2, validatorSigner] = await ethers.getSigners();

//         // Deploy mock ERC20 token
//         const MockToken = await ethers.getContractFactory("MockERC20");
//         token = await MockToken.deploy("Mock Token", "MTK");
//         // await token.getAddress();

//         // Deploy validator
//         const BridgeValidator = await ethers.getContractFactory("BridgeValidator");
//         validator = await BridgeValidator.deploy(validatorSigner.address);
//         // await validator.deployed();

//         // Deploy bridge
//         const Bridge = await ethers.getContractFactory("Bridge");
//         bridge = await Bridge.deploy(await validator.getAddress(), sourceChainId);
//         // await bridge.deployed();

//         // Grant operator role
//         await bridge.grantRole(OPERATOR_ROLE, operator.address);

//         // Mint tokens to users
//         await token.mint(user1.address, ethers.parseEther("1000"));
//         await token.mint(user2.address, ethers.parseEther("1000"));
//     });

//     describe("Deployment", function () {
//         it("Should set the correct validator address", async function () {
//             expect(await bridge.validator()).to.equal(await validator.getAddress());
//         });

//         it("Should set the correct chain ID", async function () {
//             expect(await bridge.chainId()).to.equal(sourceChainId);
//         });

//         it("Should assign the admin role to deployer", async function () {
//             const adminRole = await bridge.DEFAULT_ADMIN_ROLE();
//             expect(await bridge.hasRole(adminRole, owner.address)).to.be.true;
//         });
//     });

//     describe("Token Locking", function () {
//         const lockAmount = ethers.parseEther("100");

//         beforeEach(async function () {
//             await token.connect(user1).approve(await bridge.getAddress(), lockAmount);
//         });

//         it("Should lock tokens successfully", async function () {
//             await expect(bridge.connect(user1).lockTokens(
//                 await token.getAddress(),
//                 lockAmount,
//                 destChainId,
//                 user2.address
//             )).to.emit(bridge, "TokensLocked")
//                 .withArgs(await token.getAddress(), user1.address, lockAmount);

//             expect(await token.balanceOf(await bridge.getAddress())).to.equal(lockAmount);
//         });

//         it("Should fail when locking 0 tokens", async function () {
//             await expect(bridge.connect(user1).lockTokens(
//                 await token.getAddress(),
//                 0,
//                 destChainId,
//                 user2.address
//             )).to.be.revertedWith("Amount must be greater than 0");
//         });

//         it("Should fail when recipient is zero address", async function () {
//             await expect(bridge.connect(user1).lockTokens(
//                 await token.getAddress(),
//                 lockAmount,
//                 destChainId,
//                 ethers.ZeroAddress
//             )).to.be.revertedWith("Invalid recipient");
//         });

//         it("Should fail when destination chain is same as source", async function () {
//             await expect(bridge.connect(user1).lockTokens(
//                 await token.getAddress(),
//                 lockAmount,
//                 sourceChainId,
//                 user2.address
//             )).to.be.revertedWith("Invalid destination chain");
//         });

//         it("Should fail when contract is paused", async function () {
//             await bridge.pause();
//             await expect(bridge.connect(user1).lockTokens(
//                 await token.getAddress(),
//                 lockAmount,
//                 destChainId,
//                 user2.address
//             )).to.be.revertedWith("Pausable: paused");
//         });
//     });

//     describe("Token Release", function () {
//         const releaseAmount = ethers.parseEther("100");
//         let signature: any;

//         beforeEach(async function () {
//             // Lock tokens first
//             await token.connect(user1).approve(await bridge.getAddress(), releaseAmount);
//             await bridge.connect(user1).lockTokens(
//                 await token.getAddress(),
//                 releaseAmount,
//                 destChainId,
//                 user2.address
//             );

//             // Create and sign message
//             const message = ethers.solidityPackedKeccak256(
//                 ["uint256", "uint256", "address", "uint256", "address"],
//                 [sourceChainId, destChainId, await token.getAddress(), releaseAmount, user2.address]
//             );
//             const messageHashBytes = ethers.getBytes(message);
//             signature = await validatorSigner.signMessage(messageHashBytes);
//         });

//         it("Should release tokens successfully", async function () {
//             await expect(bridge.connect(operator).releaseToken(
//                 sourceChainId,
//                 await token.getAddress(),
//                 releaseAmount,
//                 user2.address,
//                 signature
//             )).to.emit(bridge, "TokensReleased")
//                 .withArgs(await token.getAddress(), user2.address, releaseAmount);

//             expect(await token.balanceOf(user2.address)).to.equal(releaseAmount);
//         });

//         it("Should fail with invalid signature", async function () {
//             const invalidSig = await user1.signMessage(
//                 ethers.getBytes(ethers.randomBytes(32))
//             );

//             await expect(bridge.connect(operator).releaseToken(
//                 sourceChainId,
//                 await token.getAddress(),
//                 releaseAmount,
//                 user2.address,
//                 invalidSig
//             )).to.be.revertedWith("Invalid transaction signature");
//         });

//         it("Should fail when called by non-operator", async function () {
//             await expect(bridge.connect(user1).releaseToken(
//                 sourceChainId,
//                 await token.getAddress(),
//                 releaseAmount,
//                 user2.address,
//                 signature
//             )).to.be.revertedWith(
//                 `AccessControl: account ${user1.address.toLowerCase()} is missing role ${OPERATOR_ROLE}`
//             );
//         });

//         it("Should fail when processing same transaction twice", async function () {
//             await bridge.connect(operator).releaseToken(
//                 sourceChainId,
//                 await token.getAddress(),
//                 releaseAmount,
//                 user2.address,
//                 signature
//             );

//             await expect(bridge.connect(operator).releaseToken(
//                 sourceChainId,
//                 await token.getAddress(),
//                 releaseAmount,
//                 user2.address,
//                 signature
//             )).to.be.revertedWith("Transaction already processed");
//         });
//     });

//     describe("Access Control", function () {
//         it("Should allow admin to pause/unpause", async function () {
//             await expect(bridge.pause())
//                 .to.emit(bridge, "Paused")
//                 .withArgs(owner.address);

//             await expect(bridge.unpause())
//                 .to.emit(bridge, "Unpaused")
//                 .withArgs(owner.address);
//         });

//         it("Should not allow non-admin to pause/unpause", async function () {
//             await expect(bridge.connect(user1).pause())
//                 .to.be.reverted;

//             await expect(bridge.connect(user1).unpause())
//                 .to.be.reverted;
//         });

//         it("Should allow admin to grant operator role", async function () {
//             await expect(bridge.grantRole(OPERATOR_ROLE, user1.address))
//                 .to.emit(bridge, "RoleGranted")
//                 .withArgs(OPERATOR_ROLE, user1.address, owner.address);
//         });
//     });

//     describe("Reentrancy Protection", function () {
//         it("Should prevent reentrant calls during lock", async function () {
//             const ReentrancyAttacker = await ethers.getContractFactory("ReentrancyAttacker");
//             const attacker = await ReentrancyAttacker.deploy(await bridge.getAddress(), await token.getAddress());
//             const attacker_address = await attacker.getAddress();
//             await token.mint(attacker_address, ethers.parseEther("100"));
//             await expect(attacker.attack()).to.be.reverted;
//         });
//     });

//     describe("Edge Cases", function () {
//         it("Should handle very large token amounts", async function () {
//             const largeAmount = ethers.parseEther("1000000000"); // 1 billion tokens
//             await token.mint(user1.address, largeAmount);
//             await token.connect(user1).approve(await bridge.getAddress(), largeAmount);

//             await expect(bridge.connect(user1).lockTokens(
//                 await token.getAddress(),
//                 largeAmount,
//                 destChainId,
//                 user2.address
//             )).to.not.be.reverted;
//         });

//         it("Should handle token contracts with non-standard decimals", async function () {
//             const NonStandardToken = await ethers.getContractFactory("MockERC20");
//             const token6Dec = await NonStandardToken.deploy("6 Decimals Token", "SDT");

//             const amount = ethers.parseUnits("100", 6);
//             await token6Dec.mint(user1.address, amount);
//             await token6Dec.connect(user1).approve(await bridge.getAddress(), amount);

//             await expect(bridge.connect(user1).lockTokens(
//                 await token6Dec.getAddress(),
//                 amount,
//                 destChainId,
//                 user2.address
//             )).to.not.be.reverted;
//         });
//     });
// });