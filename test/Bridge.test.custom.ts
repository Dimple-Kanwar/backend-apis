import { expect } from "chai";
import { ethers } from "hardhat";
import { Bridge, MockERC20Token } from "../typechain-types";
import {
  generateLockHash,
  generateNonce,
  generateReleaseHash,
} from "../utils/common";
import { JsonRpcProvider, Wallet } from "ethers";

describe.only("Bridge Contract Test", function () {
  let sourceTokenContract: MockERC20Token;
  let targetTokenContract: MockERC20Token;
  let sourceChainBridge: Bridge;
  let targetChainBridge: Bridge;

  // Hardhat network chain ID
  const sourceChainId = 84532; // Hardhat network chain ID
  const targetChainId = 11155111; // Same chain ID for simplicity
  const sourceToken = "0x62060727308449B9347f5649Ea7495C061009615";
  const targetToken = "0x22DD04E98a65396714b64a712678A2D27737Bb77";
  let owner: Wallet, sender: Wallet, recipient: Wallet;
  let sourceProvider: JsonRpcProvider;
  let targetProvider: JsonRpcProvider;

  before(async function () {
    sourceProvider = new ethers.JsonRpcProvider(process.env.BASE_SEPOLIA_RPC!);
    targetProvider = new ethers.JsonRpcProvider(
      process.env.SEPOLIA_TESTNET_RPC!
    );
    sender = new Wallet(process.env.USER1_PK!, sourceProvider);
    recipient = new Wallet(process.env.USER2_PK!, targetProvider);
    owner = new Wallet(process.env.ADMIN_ACCOUNT_PK!);
    // console.log({ owner, sender, recipient });
    // Deploy MockERC20Token contracts
    const MockERC20TokenFactory = await ethers.getContractFactory(
      "MockERC20Token"
    );
    // sourceTokenContract = (await MockERC20TokenFactory.deploy("Source Token", "ST", 18)) as MockERC20Token;
    sourceTokenContract = MockERC20TokenFactory.attach(sourceToken).connect(
      sender
    ) as MockERC20Token;
    // targetTokenContract = (await MockERC20TokenFactory.deploy("Target Token", "TT", 18)) as MockERC20Token;
    targetTokenContract = MockERC20TokenFactory.attach(targetToken).connect(
      owner
    ) as MockERC20Token;
    // Deploy Bridge contracts
    const BridgeFactory = await ethers.getContractFactory("Bridge");
    sourceChainBridge = BridgeFactory.attach(
      process.env.BASE_BRIDGE_ADDRESS!
    ).connect(sourceProvider) as Bridge; // 3% platform fee
    targetChainBridge = BridgeFactory.attach(
      process.env.SEPOLIA_BRIDGE_ADDRESS!
    ).connect(targetProvider) as Bridge; // 3% platform fee

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
      const amount = ethers.parseEther("0.0000001");

      // send some ether to sender account
      await owner.connect(sourceProvider).sendTransaction({
        to: sender.address,
        value: amount,
      });

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

      const beforeBal = await sourceProvider.getBalance(sourceChainBridge.target);
      console.log(`Before balance: ${beforeBal}`);
      // Lock native tokens
      await expect(
        (await sourceChainBridge.connect(sender).lockTokens(
          ethers.ZeroAddress,
          ethers.ZeroAddress, // Native token (ETH)
          amount,
          recipient.address,
          sourceChainId,
          targetChainId,
          sourceChainTxHash,
          { value: amount } // Include ETH in the transaction
        )).wait()
      )
        .to.emit(sourceChainBridge, "TokensLocked")
        .withArgs(
          ethers.ZeroAddress,
          ethers.ZeroAddress,
          amount,
          sender.address,
          recipient.address,
          sourceChainId,
          targetChainId,
          sourceChainTxHash
        );

        const currentBal = await sourceProvider.getBalance(sourceChainBridge.target);
      console.log(`Before balance: ${currentBal}`);
      // Verify contract balance
      expect(
        currentBal-beforeBal
      ).to.equal(amount);
    });

    it("Should lock ERC20 tokens", async function () {
      const amount = ethers.parseEther("0.00001");

      // Mint tokens to sender
      // const mintTx = await sourceTokenContract.connect(owner).mint(sender.address, ethers.parseEther("100"));
      // await mintTx.wait();  
      console.log(`Minted ${amount} tokens to sender`);
      const balance = await sourceTokenContract.balanceOf(sender.address);
      console.log("Token balance:", balance);

      const allowance = await sourceTokenContract.allowance(
        sender,
        sourceChainBridge.target
      );
      if (allowance < amount) {
        console.log("Approving tokens...");
        const approveTx = await sourceTokenContract
          .connect(sender)
          .approve(sourceChainBridge.target, amount);
        await approveTx.wait();
        console.log("Token approval successful");
      }

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

      const beforeBal = await sourceTokenContract.balanceOf(sourceChainBridge.target)
      console.log(`Before balance: ${beforeBal}`);
      // Lock ERC20 tokens
      await expect(
        (await sourceChainBridge
          .connect(sender)
          .lockTokens(
            sourceTokenContract.target,
            targetTokenContract.target,
            amount,
            recipient.address,
            sourceChainId,
            targetChainId,
            sourceChainTxHash
          )).wait()
      )
        .to.emit(sourceChainBridge, "TokensLocked")
        .withArgs(
          sourceTokenContract.target,
          targetTokenContract.target,
          amount,
          sender.address,
          recipient.address,
          sourceChainId,
          targetChainId,
          sourceChainTxHash
        );

      // Verify contract balance
      const currentBal = await sourceTokenContract.balanceOf(sourceChainBridge.target)
      console.log(`Before balance: ${currentBal}`);
      expect(
        currentBal - beforeBal
      ).to.equal(amount);
    });
  });

  describe("Token Releasing", function () {
    it("Should release tokens and deduct platform fee", async function () {
      const amount = ethers.parseEther("100"); // 100 tokens

      // Mint tokens to sender
      await sourceTokenContract.mint(sender.address, amount);
      const balance = await sourceTokenContract.balanceOf(sender.address);
      console.log("Token balance:", balance);

      const allowance = await sourceTokenContract.allowance(
        sender,
        sourceChainBridge.target
      );
      if (allowance < amount) {
        console.log("Approving tokens...");
        const approveTx = await sourceTokenContract
          .connect(sender)
          .approve(sourceChainBridge.target, amount);
        await approveTx.wait();
        console.log("Token approval successful");
      }

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
      const lockTx = await sourceChainBridge
        .connect(sender)
        .lockTokens(
          sourceTokenContract.target,
          targetTokenContract.target,
          amount,
          recipient.address,
          sourceChainId,
          targetChainId,
          sourceChainTxHash
        );

      // Calculate platform fee and net amount
      const platformFeePercentage =
        await targetChainBridge.platformFeePercentage();
      const fee = (amount * BigInt(platformFeePercentage)) / BigInt(10000);
      const netAmount = amount - fee;
      console.log(`Amount: ${amount}, Fee: ${fee}, Net Amount: ${netAmount}`);

      // Generate release hash
      const recipientNonce = await generateNonce(recipient.address);
      const targetChainTxHash = await generateReleaseHash(
        targetTokenContract.target.toString(),
        sender.address,
        recipient.address,
        amount.toString(),
        recipientNonce,
        lockTx.hash,
        sourceChainId,
        targetChainId
      );

      // Mint tokens to target bridge
      await targetTokenContract.mint(targetChainBridge.target, amount);
      console.log(`Minted ${amount} tokens to target bridge`);

      // check target bridge balance for target token
      let targetBridgeBalance = await targetTokenContract.balanceOf(
        await targetChainBridge.platformAddress()
      );
      console.log(
        `Target bridge balance before release: ${targetBridgeBalance}`
      );

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
      expect(
        await targetTokenContract.allowance(
          targetChainBridge.target,
          recipient.address
        )
      ).to.equal(netAmount);
      targetBridgeBalance = await targetTokenContract.balanceOf(
        targetChainBridge.target
      );
      console.log(
        `Target bridge balance after release: ${targetBridgeBalance}`
      );
      expect(
        await targetTokenContract.balanceOf(
          await targetChainBridge.platformAddress()
        )
      ).to.equal(fee);
    });
  });

  describe("Token Withdrawal", function () {
    it("Should allow recipients to withdraw locked ERC20 tokens", async function () {
      const amount = ethers.parseEther("100"); // 100 tokens

      // Mint tokens to sender
      await sourceTokenContract.mint(sender.address, amount);
      const balance = await sourceTokenContract.balanceOf(sender.address);
      console.log("Token balance:", balance);

      const allowance = await sourceTokenContract.allowance(
        sender,
        sourceChainBridge.target
      );
      if (allowance < amount) {
        console.log("Approving tokens...");
        const approveTx = await sourceTokenContract
          .connect(sender)
          .approve(sourceChainBridge.target, amount);
        await approveTx.wait();
        console.log("Token approval successful");
      }
      // Approve the bridge contract to spend tokens
      // await sourceTokenContract.connect(sender).approve(sourceChainBridge.target, amount);

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
      const lockTx = await sourceChainBridge
        .connect(sender)
        .lockTokens(
          sourceTokenContract.target,
          targetTokenContract.target,
          amount,
          recipient.address,
          sourceChainId,
          targetChainId,
          sourceChainTxHash
        );

      // Calculate platform fee and net amount
      const platformFeePercentage =
        await targetChainBridge.platformFeePercentage();
      const fee = (amount * BigInt(platformFeePercentage)) / BigInt(10000);
      const netAmount = amount - fee;
      console.log(`Platform fee: ${fee}, Net amount: ${netAmount}`);
      // Generate release hash
      const recipientNonce = await generateNonce(recipient.address);
      const targetChainTxHash = await generateReleaseHash(
        targetTokenContract.target.toString(),
        sender.address,
        recipient.address,
        amount.toString(),
        recipientNonce,
        lockTx.hash, // Use the lock transaction hash
        sourceChainId,
        targetChainId
      );

      // Mint tokens to target bridge
      await targetTokenContract.mint(targetChainBridge.target, amount);

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
        await targetChainBridge.withdrawableTokens(
          recipient.address,
          targetTokenContract.target
        )
      ).to.equal(netAmount);

      // Withdraw tokens as recipient
      await expect(
        targetChainBridge
          .connect(recipient)
          .withdrawTokens(targetTokenContract.target)
      )
        .to.emit(targetChainBridge, "TokensWithdrawn")
        .withArgs(targetTokenContract.target, recipient.address, netAmount);

      // Verify token balances
      expect(await targetTokenContract.balanceOf(recipient.address)).to.equal(
        netAmount
      );
      expect(
        await targetTokenContract.balanceOf(
          await targetChainBridge.platformAddress()
        )
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

      // Lock native ETH
      const lockTx = await sourceChainBridge.connect(sender).lockTokens(
        ethers.ZeroAddress, // Native token (ETH)
        ethers.ZeroAddress, // Native token (ETH)
        amount,
        recipient.address,
        sourceChainId,
        targetChainId,
        sourceChainTxHash,
        { value: amount } // Include ETH in the transaction
      );

      // Calculate platform fee and net amount
      const platformFeePercentage =
        await targetChainBridge.platformFeePercentage();
      const fee = (amount * BigInt(platformFeePercentage)) / BigInt(10000);
      const netAmount = amount - fee;

      // Generate release hash
      const recipientNonce = await generateNonce(recipient.address);
      const targetChainTxHash = await generateReleaseHash(
        ethers.ZeroAddress, // Native token (ETH)
        sender.address,
        recipient.address,
        amount.toString(),
        recipientNonce,
        lockTx.hash, // Use the lock transaction hash
        sourceChainId,
        targetChainId
      );

      // Mint ETH to target bridge (simulate minting for native tokens)
      await owner.sendTransaction({
        to: targetChainBridge.target,
        value: amount,
      });

      // Release tokens on target chain
      await expect(
        targetChainBridge.connect(owner).releaseTokens(
          ethers.ZeroAddress, // Native token (ETH)
          amount,
          recipient.address,
          targetChainTxHash
        )
      )
        .to.emit(targetChainBridge, "TokensReleased")
        .withArgs(
          targetChainBridge.target,
          recipient.address,
          netAmount,
          targetChainTxHash
        )
        .and.to.emit(targetChainBridge, "PlatformFeeDeducted")
        .withArgs(ethers.ZeroAddress, fee);

      // Verify withdrawable tokens for recipient
      expect(
        await targetChainBridge.withdrawableTokens(
          recipient.address,
          ethers.ZeroAddress
        )
      ).to.equal(netAmount);

      // Withdraw native ETH as recipient
      const initialRecipientBalance = await sourceProvider.getBalance(
        recipient.address
      );

      await expect(
        targetChainBridge.connect(recipient).withdrawTokens(ethers.ZeroAddress)
      )
        .to.emit(targetChainBridge, "TokensWithdrawn")
        .withArgs(ethers.ZeroAddress, recipient.address, netAmount);

      // Verify recipient's ETH balance
      const finalRecipientBalance = await targetProvider.getBalance(
        recipient.address
      );
      expect(finalRecipientBalance).to.be.gt(initialRecipientBalance);
    });
  });
});
