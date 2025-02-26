import { expect } from "chai";
import { ethers } from "hardhat";
import { Bridge, MockERC20Token } from "../typechain-types";
import {
  generateLockHash,
  generateNonce,
  generateReleaseHash,
} from "../utils/common";
import { ContractTransactionResponse } from "ethers";

describe.only("Bridge Contract", function () {
  let sourceTokenContract: MockERC20Token;
  let targetTokenContract: MockERC20Token;
  let sourceChainBridge: Bridge;
  let targetChainBridge: Bridge;
  let tx: ContractTransactionResponse;
  // Hardhat network chain ID
  const sourceChainId = 31337; // Hardhat network chain ID
  const targetChainId = 31337; // Same chain ID for simplicity

  let owner: any, sender: any, recipient: any;

  before(async function () {
    // Get signers (accounts) from Hardhat
    [owner, sender, recipient] = await ethers.getSigners();

    // Deploy MockERC20Token contracts
    const MockERC20TokenFactory = await ethers.getContractFactory(
      "MockERC20Token"
    );
    sourceTokenContract = (await MockERC20TokenFactory.deploy(
      "Source Token",
      "ST",
      18
    )) as MockERC20Token;
    targetTokenContract = (await MockERC20TokenFactory.deploy(
      "Target Token",
      "TT",
      18
    )) as MockERC20Token;

    // Deploy Bridge contracts
    const BridgeFactory = await ethers.getContractFactory("Bridge");
    sourceChainBridge = (await BridgeFactory.deploy(300)) as Bridge;
    targetChainBridge = (await BridgeFactory.deploy(300)) as Bridge;

    console.log(`Deployed Source Token at ${sourceTokenContract.target}`);
    console.log(`Deployed Target Token at ${targetTokenContract.target}`);
    console.log(`Deployed Source Bridge at ${sourceChainBridge.target}`);
    console.log(`Deployed Target Bridge at ${targetChainBridge.target}`);
  });

  describe("Deployment", function () {
    it("Should set the right owner on source chain", async function () {
      expect(await sourceChainBridge.owner()).to.equal(owner.address);
    });

    it("Should set the right owner on target chain", async function () {
      expect(await targetChainBridge.owner()).to.equal(owner.address);
    });

    it("Should set the initial platform address to the owner on source chain", async function () {
      expect(await sourceChainBridge.platformAddress()).to.equal(owner.address);
    });

    it("Should set the initial platform address to the owner on target chain", async function () {
      expect(await targetChainBridge.platformAddress()).to.equal(owner.address);
    });
  });
  describe("Token Locking", function () {
    it("Should lock native tokens (ETH)", async function () {
      const amount = ethers.parseEther("1");

      // Generate lock hash
      const nonce = await generateNonce(sender.address);
      const sourceChainTxHash = await generateLockHash(
        ethers.ZeroAddress, // Native token (ETH)
        sender.address,
        recipient.address,
        amount.toString(),
        nonce,
        sourceChainId,
        targetChainId
      );

      // Lock native tokens
      await expect(
        sourceChainBridge.connect(sender).lockTokens(
          ethers.ZeroAddress, // Native token (ETH)
          amount,
          recipient.address,
          sourceChainTxHash,
          { value: amount } // Include ETH in the transaction
        )
      )
        .to.emit(sourceChainBridge, "NativeTokenLocked")
        .withArgs(sender.address, recipient.address, amount, sourceChainTxHash);

      // Verify contract balance
      expect(
        await ethers.provider.getBalance(sourceChainBridge.target)
      ).to.equal(amount);
    });

    it("Should lock ERC20 tokens", async function () {
      const amount = ethers.parseEther("100");

      // Mint tokens to sender
      await sourceTokenContract.mint(sender.address, amount);

      // Approve the bridge contract to spend tokens
      await sourceTokenContract
        .connect(sender)
        .approve(sourceChainBridge.target, amount);

      // Verify the allowance
      const allowance = await sourceTokenContract.allowance(
        sender.address,
        sourceChainBridge.target
      );
      expect(allowance).to.equal(amount);
      // verify sender balance
      console.log(
        `Sender balance before lock: ${await sourceTokenContract.balanceOf(
          sender.address
        )}`
      );
      expect(await sourceTokenContract.balanceOf(sender.address)).to.equal(
        amount
      );
      // Generate lock hash
      const nonce = await generateNonce(sender.address);
      const sourceChainTxHash = await generateLockHash(
        sourceTokenContract.target.toString(),
        sender.address,
        recipient.address,
        amount.toString(),
        nonce,
        sourceChainId,
        targetChainId
      );

      // Lock ERC20 tokens
      tx = await sourceChainBridge
        .connect(sender)
        .lockTokens(
          sourceTokenContract.target,
          amount,
          recipient.address,
          sourceChainTxHash
        );
      expect(tx)
        .to.emit(sourceChainBridge, "TokensLocked")
        .withArgs(
          sourceTokenContract.target,
          amount,
          sender.address,
          recipient.address,
          sourceChainTxHash
        );
      console.log(
        `Sender balance after lock: ${await sourceTokenContract.balanceOf(
          sender.address
        )}`
      );
      console.log(
        `Bridge balance after lock: ${await sourceTokenContract.balanceOf(
          sourceChainBridge.target
        )}`
      );
      // Verify contract balance
      expect(
        await sourceTokenContract.balanceOf(sourceChainBridge.target)
      ).to.equal(amount);
    });
  });

  describe("Token Releasing", function () {
    it("Should release tokens and deduct platform fee", async function () {
      const amount = ethers.parseEther("100");
      console.log(`Amount: ${amount}`);

      // Mint tokens to sender
      await sourceTokenContract.mint(sender.address, amount);

      // Approve the bridge contract to spend tokens
      await sourceTokenContract
        .connect(sender)
        .approve(sourceChainBridge.target, amount);

      // Verify the allowance
      const allowance = await sourceTokenContract.allowance(
        sender.address,
        sourceChainBridge.target
      );
      console.log(`Allowance: ${allowance}`);

      expect(allowance).to.equal(amount);

      // Generate lock hash
      const nonce = await generateNonce(sender.address);
      const sourceChainTxHash = await generateLockHash(
        sourceTokenContract.target.toString(),
        sender.address,
        recipient.address,
        amount.toString(),
        nonce,
        sourceChainId,
        targetChainId
      );

      let bridgeBalance = await sourceTokenContract.balanceOf(
        sourceChainBridge.target
      );
      console.log(`Bridge balance  before lock: ${bridgeBalance}`);

      // Lock ERC20 tokens
      //   const tx = await sourceChainBridge
      //     .connect(sender)
      //     .lockTokens(
      //       sourceTokenContract.target.toString(),
      //       amount,
      //       recipient.address,
      //       sourceChainTxHash
      //     );
      //   expect(tx)
      //     .to.emit(sourceChainBridge, "TokensLocked")
      //     .withArgs(
      //       sourceTokenContract.target,
      //       amount,
      //       sender.address,
      //       recipient.address,
      //       sourceChainTxHash
      //     );

      // Verify contract balance
      bridgeBalance = await sourceTokenContract.balanceOf(
        sourceChainBridge.target
      );
      console.log(`Bridge balance after lock: ${bridgeBalance}`);
      expect(bridgeBalance).to.equal(amount);

      const platformFeePercentage =
        await targetChainBridge.platformFeePercentage();
      console.log(`Platform Fee Percentage: ${platformFeePercentage}`);
      const fee = (amount * BigInt(platformFeePercentage)) / BigInt(10000);
      console.log(`Fee: ${fee}`);
      const netAmount = amount - fee;
      console.log(`Net Amount: ${netAmount}`);

      // Ensure platform fee percentage is valid
      expect(platformFeePercentage).to.be.lte(10000);

      // Generate lock hash
      const recipientNonce = await generateNonce(recipient.address);
      console.log(`Recipient Nonce: ${recipientNonce}`);

      const targetChainTxHash = await generateReleaseHash(
        targetTokenContract.target.toString(),
        sender.address,
        recipient.address,
        amount.toString(),
        recipientNonce,
        tx.hash,
        sourceChainId,
        targetChainId
      );

      // Mint tokens to target bridge
      await targetTokenContract.mint(targetChainBridge.target, amount);
      console.log(`Minted tokens: ${amount}`);

      // Funds before lock tokens
      const targetBridgeBalanceBefore = await targetTokenContract.balanceOf(
        targetChainBridge.target
      );
      console.log(`Target bridge balance before: ${targetBridgeBalanceBefore}`);
      const senderBalanceBefore = await targetTokenContract.balanceOf(
        sender.address
      );
      console.log(`Sender balance before: ${senderBalanceBefore}`);
      const recipientBalanceBefore = await targetTokenContract.balanceOf(
        recipient.address
      );
      console.log(`Recipient balance before: ${recipientBalanceBefore}`);

      // Release tokens on target chain
      await expect(
        targetChainBridge
          .connect(owner)
          .releaseTokens(
            targetTokenContract.target,
            amount,
            recipient.address,
            targetChainTxHash
          )
      )
        .to.emit(targetChainBridge, "TokensReleased")
        .withArgs(
          targetTokenContract.target,
          recipient.address,
          netAmount,
          targetChainTxHash
        )
        .and.to.emit(targetChainBridge, "PlatformFeeDeducted")
        .withArgs(targetTokenContract.target, fee);

      // Verify token balances
      console.log("Token balances after release:");
      console.log(
        `Recipient: ${await targetTokenContract.allowance(
          targetChainBridge.target,
          recipient.address
        )}`
      );
      console.log(
        `Target Bridge: ${await targetTokenContract.balanceOf(owner.address)}`
      );
      console.log(`Fee: ${await targetTokenContract.balanceOf(owner.address)}`);
      expect(
        await targetTokenContract.allowance(
          targetChainBridge.target,
          recipient.address
        )
      ).to.equal(netAmount);
      expect(await targetTokenContract.balanceOf(recipient.address)).to.equal(
        netAmount
      );
      expect(await targetTokenContract.balanceOf(owner.address)).to.equal(fee);
    });
  });

  describe("Platform Fee and Address Configuration", function () {
    it("Should allow the owner to set a new platform address", async function () {
      await targetChainBridge.setPlatformAddress(recipient.address);
      expect(await targetChainBridge.platformAddress()).to.equal(
        recipient.address
      );
    });

    it("Should allow the owner to set a new platform fee", async function () {
      await targetChainBridge.setPlatformFee(500); // Set to 5%
      expect(await targetChainBridge.platformFeePercentage()).to.equal(500);
    });

    it("Should revert if non-owner tries to set platform address", async function () {
      await expect(
        targetChainBridge.connect(sender).setPlatformAddress(recipient.address)
      ).to.be.revertedWithCustomError(
        targetChainBridge,
        "OwnableUnauthorizedAccount"
      );
    });
  });

  describe("Token Withdrawal", function () {
    it("Should allow recipients to withdraw locked ERC20 tokens", async function () {
      const amount = ethers.parseEther("100"); // 100 tokens
      const platformFeePercentage =
        await targetChainBridge.platformFeePercentage();
      const fee = (amount * BigInt(platformFeePercentage)) / BigInt(10000);
      const netAmount = amount - fee;

      // Generate lock hash
      const nonce = await generateNonce(sender.address);
      const sourceChainTxHash = await generateLockHash(
        sourceTokenContract.target.toString(),
        sender.address,
        recipient.address,
        amount.toString(),
        nonce,
        sourceChainId,
        targetChainId
      );

      // Mint tokens to sender
      await sourceTokenContract.mint(sender.address, amount);
      // Approve the bridge contract to spend tokens
      await sourceTokenContract
        .connect(sender)
        .approve(sourceChainBridge.target, amount);

      // Verify the allowance
      const allowance = await sourceTokenContract.allowance(
        sender.address,
        sourceChainBridge.target
      );
      expect(allowance).to.equal(amount);

      // Lock tokens on source chain
      const tx = await sourceChainBridge
        .connect(sender)
        .lockTokens(
          sourceTokenContract.target.toString(),
          amount,
          recipient.address,
          sourceChainTxHash
        );

      //Release Tokens on target chain
      
      const recipientNonce = await generateNonce(recipient.address);
      console.log(`Recipient Nonce: ${recipientNonce}`);
      // Generate release hash
      const targetChainTxHash = await generateReleaseHash(
        targetTokenContract.target.toString(),
        sender.address,
        recipient.address,
        amount.toString(),
        recipientNonce,
        tx.hash,
        sourceChainId,
        targetChainId
      );

      // Mint tokens to target bridge
      await targetTokenContract.mint(targetChainBridge.target, amount);
      console.log(`Minted tokens: ${amount}`);

      // Funds before lock tokens
      const targetBridgeBalanceBefore = await targetTokenContract.balanceOf(
        targetChainBridge.target
      );
      console.log(`Target bridge balance before: ${targetBridgeBalanceBefore}`);
      const senderBalanceBefore = await targetTokenContract.balanceOf(
        sender.address
      );
      console.log(`Sender balance before: ${senderBalanceBefore}`);
      const recipientBalanceBefore = await targetTokenContract.balanceOf(
        recipient.address
      );
      console.log(`Recipient balance before: ${recipientBalanceBefore}`);

      // Release tokens on target chain
      await expect(
        targetChainBridge
          .connect(owner)
          .releaseTokens(
            targetTokenContract.target,
            amount,
            recipient.address,
            targetChainTxHash
          )
      )
        .to.emit(targetChainBridge, "TokensReleased")
        .withArgs(
          targetTokenContract.target,
          recipient.address,
          netAmount,
          targetChainTxHash
        )
        .and.to.emit(targetChainBridge, "PlatformFeeDeducted")
        .withArgs(targetTokenContract.target, fee);

      // Verify withdrawable tokens for recipient on source chain
      expect(
        await sourceChainBridge.withdrawableTokens(
          recipient.address,
          targetTokenContract.target.toString()
        )
      ).to.equal(amount);

      // Withdraw tokens as recipient
      await expect(
        sourceChainBridge
          .connect(recipient)
          .withdrawTokens(targetTokenContract.target)
      )
        .to.emit(sourceChainBridge, "TokensWithdrawn")
        .withArgs(targetTokenContract.target, recipient.address, netAmount);

      // Verify token balances
      expect(await targetTokenContract.balanceOf(recipient.address)).to.equal(
        netAmount
      );
      expect(
        await targetTokenContract.balanceOf(sourceChainBridge.target)
      ).to.equal(fee);
    });

    it("Should allow recipients to withdraw native ETH", async function () {
      const amount = ethers.parseEther("1"); // 1 ETH

      // Generate lock hash
      const nonce = await generateNonce(sender.address);
      const sourceChainTxHash = await generateLockHash(
        ethers.ZeroAddress, // Native token (ETH)
        sender.address,
        recipient.address,
        amount.toString(),
        nonce,
        sourceChainId,
        targetChainId
      );

      // Lock native ETH on source chain
      const lock_tx = await sourceChainBridge.connect(sender).lockTokens(
        ethers.ZeroAddress, // Native token (ETH)
        amount,
        recipient.address,
        sourceChainTxHash,
        { value: amount } // Include ETH in the transaction
      );

      //Release Tokens on target chain
      const recipientNonce = await generateNonce(recipient.address);
      console.log(`Recipient Nonce: ${recipientNonce}`);
      // Generate release hash
      const targetChainTxHash = await generateReleaseHash(
        targetTokenContract.target.toString(),
        sender.address,
        recipient.address,
        amount.toString(),
        recipientNonce,
        lock_tx.hash,
        sourceChainId,
        targetChainId
      );
      const platformFeePercentage =
        await targetChainBridge.platformFeePercentage();
      const fee = (amount * BigInt(platformFeePercentage)) / BigInt(10000);
      const netAmount = amount - fee;

      // Mint tokens to target bridge
      await targetTokenContract.mint(targetChainBridge.target, amount);
      console.log(`Minted tokens: ${amount}`);

      // Funds before lock tokens
      const targetBridgeBalanceBefore = await targetTokenContract.balanceOf(
        targetChainBridge.target
      );
      console.log(`Target bridge balance before: ${targetBridgeBalanceBefore}`);
      const senderBalanceBefore = await targetTokenContract.balanceOf(
        sender.address
      );
      console.log(`Sender balance before: ${senderBalanceBefore}`);
      const recipientBalanceBefore = await targetTokenContract.balanceOf(
        recipient.address
      );
      console.log(`Recipient balance before: ${recipientBalanceBefore}`);

      // Release tokens on target chain
      await expect(
        targetChainBridge
          .connect(owner)
          .releaseTokens(
            targetTokenContract.target,
            amount,
            recipient.address,
            targetChainTxHash
          )
      )
        .to.emit(targetChainBridge, "TokensReleased")
        .withArgs(
          targetTokenContract.target,
          recipient.address,
          netAmount,
          targetChainTxHash
        )
        .and.to.emit(targetChainBridge, "PlatformFeeDeducted")
        .withArgs(targetTokenContract.target, fee);

      // Verify withdrawable tokens for recipient
      expect(
        await sourceChainBridge.withdrawableTokens(
          recipient.address,
          ethers.ZeroAddress
        )
      ).to.equal(amount);

      // Withdraw native ETH as recipient
      const initialRecipientBalance = await ethers.provider.getBalance(
        recipient.address
      );

      // Call withdrawTokens with the correct arguments
      await expect(
        sourceChainBridge.connect(recipient).withdrawTokens(ethers.ZeroAddress)
      )
        .to.emit(sourceChainBridge, "TokensWithdrawn")
        .withArgs(ethers.ZeroAddress, recipient.address, amount); // No fee for simplicity

      // Verify recipient's ETH balance
      const finalRecipientBalance = await ethers.provider.getBalance(
        recipient.address
      );
      expect(finalRecipientBalance).to.be.gt(initialRecipientBalance);
    });
  });
});
