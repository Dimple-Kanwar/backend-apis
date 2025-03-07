import { expect } from "chai";
import { ethers } from "hardhat";
import { Bridge, MockERC20Token } from "../typechain-types";
import {
  generateLockHash,
  generateNonce,
  generateReleaseHash,
} from "../utils/common";
import { Contract, JsonRpcProvider, Wallet } from "ethers";
import { CHAIN_CONFIGS } from "../config/chains";

describe.only("Bridge Contract Test", function () {
  // network chain configurations
  const sourceChainId = 84532;
  const targetChainId = 11155111;

  // token configurations
  const sourceToken = "0x62060727308449B9347f5649Ea7495C061009615";
  const targetToken = "0x22DD04E98a65396714b64a712678A2D27737Bb77";
  const sourceBridgeAddress = CHAIN_CONFIGS[sourceChainId].bridgeAddress;
  const targetBridgeAddress = CHAIN_CONFIGS[targetChainId].bridgeAddress;

  const amount = ethers.parseEther("0.0000001");
  console.log(`Amount: ${amount}`);
  const nativeToken = ethers.ZeroAddress;

  let sender: Wallet, recipient: Wallet;
  let sourceTokenContract: MockERC20Token;
  let targetTokenContract: MockERC20Token;
  let sourceChainBridge: Bridge;
  let targetChainBridge: Bridge;
  let sourceProvider: JsonRpcProvider;
  let targetProvider: JsonRpcProvider;

  before(async function () {
    // Initialize providers
    sourceProvider = new ethers.JsonRpcProvider(
      CHAIN_CONFIGS[sourceChainId].rpcUrl
    );
    targetProvider = new ethers.JsonRpcProvider(
      CHAIN_CONFIGS[targetChainId].rpcUrl
    );

    sender = new Wallet(process.env.USER1_PK!, sourceProvider);
    recipient = new Wallet(process.env.USER2_PK!, targetProvider);

    // Connect to deployed contracts
    const MockERC20TokenFactory = await ethers.getContractFactory(
      "MockERC20Token"
    );
    sourceTokenContract = MockERC20TokenFactory.attach(sourceToken).connect(
      sender
    ) as MockERC20Token;
    targetTokenContract = MockERC20TokenFactory.attach(targetToken).connect(
      recipient
    ) as MockERC20Token;

    const BridgeFactory = await ethers.getContractFactory("Bridge");
    sourceChainBridge = BridgeFactory.attach(sourceBridgeAddress).connect(
      sourceProvider
    ) as Bridge;
    targetChainBridge = BridgeFactory.attach(targetBridgeAddress).connect(
      targetProvider
    ) as Bridge;
  });
  const simulateLockTokens = async (
    _sourceToken: string,
    _targetToken: string
  ) => {
    // Get initial balances
    const initialSenderBalance =
      _sourceToken === nativeToken
        ? await sourceProvider.getBalance(sender.address)
        : await sourceTokenContract.balanceOf(sender.address);
    console.log(`Initial sender balance: ${initialSenderBalance}`);

    const initialBridgeBalance =
      _sourceToken === nativeToken
        ? await sourceProvider.getBalance(sourceChainBridge.target)
        : await sourceTokenContract.balanceOf(sourceChainBridge.target);
    console.log(`initial Bridge Balance: ${initialBridgeBalance}`);

    // Check if source token is ERC20 (not native)
    if (_sourceToken !== nativeToken) {
      const allowance = await sourceTokenContract.allowance(
        sender.address,
        sourceBridgeAddress
      );

      if (allowance < amount) {
        console.log("Approving tokens...");
        const approveTx = await sourceTokenContract
          .connect(sender)
          .approve(sourceBridgeAddress, amount);
        await approveTx.wait();
        console.log("Token approval successful");
      }
    }
    console.log({amount});
    // Generate lock hash 
    const nonce = await generateNonce(sender.address);
    const sourceChainTxHash = await generateLockHash(
      _sourceToken,
      _targetToken,
      sender.address,
      recipient.address,
      amount.toString(),
      nonce,
      sourceChainId,
      targetChainId
    );
    const lockTx = await (
      await sourceChainBridge.connect(sender).lockTokens(
        _sourceToken,
        _targetToken,
        amount,
        recipient.address,
        sourceChainId,
        targetChainId,
        sourceChainTxHash,
        _sourceToken === nativeToken ? { value: amount }: {} 
      )
    ).wait();
    console.log(`Lock Tx: ${lockTx?.hash}`);

    // Lock tokens
    expect(lockTx)
      .to.emit(sourceChainBridge, "TokensLocked")
      .withArgs(
        _sourceToken,
        _targetToken,
        amount,
        sender.address,
        recipient.address,
        sourceChainId,
        targetChainId,
        sourceChainTxHash
      );

    const currentBridgeBalance =
      _sourceToken === nativeToken
        ? await sourceProvider.getBalance(sourceChainBridge.target)
        : await sourceTokenContract.balanceOf(sourceChainBridge.target);
    console.log(`current Bridge Balance: ${currentBridgeBalance}`);

    const currentSenderBalance =
      _sourceToken === nativeToken
        ? await sourceProvider.getBalance(sender.address)
        : await sourceTokenContract.balanceOf(sender.address);
    console.log(`Current sender balance: ${currentSenderBalance}`);
    // if (_sourceToken === nativeToken) {
    //   if (lockTx) {
    //     const gasCost = lockTx.gasUsed * lockTx.gasPrice;
    //     expect(currentSenderBalance).to.equal(initialSenderBalance - amount - gasCost);
    //   }
    // } else {
    //   expect(currentSenderBalance).to.equal(initialSenderBalance - amount);
    // }
    // Verify contract balance
    expect(currentBridgeBalance-initialBridgeBalance).to.equal(amount);
  };

  describe("Token Locking", function () {
    it("Should lock native tokens (ETH)", async function () {
      await simulateLockTokens(nativeToken, nativeToken);
    });

    it("Should lock ERC20 tokens", async function () {
      await simulateLockTokens(sourceToken, targetToken);
    });

    it("Should lock ERC20 to native tokens", async function () {
      await simulateLockTokens(sourceToken, nativeToken);
    });

    it("Should lock native to ERC20 tokens", async function () {
      await simulateLockTokens(nativeToken, targetToken);
    });
  });

  // describe("Token Withdrawal", function () {
  //   it("Should allow recipients to withdraw locked ERC20 tokens", async function () {
  //     const eventName = "TokensReleased";
  //     // Calculate platform fee and net amount
  //     const platformFeePercentage =
  //       await targetChainBridge.platformFeePercentage();
  //     const fee = (amount * BigInt(platformFeePercentage)) / BigInt(10000);
  //     const netAmount = amount - fee;
  //     console.log(`Platform fee: ${fee}, Net amount: ${netAmount}`);

  //     // Verify withdrawable tokens for recipient
  //     const withdrawableTokens = await sourceChainBridge.withdrawableTokens(
  //       recipient.address,
  //       targetToken
  //     );
  //     console.log(`Withdrawable tokens: ${withdrawableTokens}`);
  //     expect(withdrawableTokens).to.greaterThanOrEqual(netAmount);

  //     // Verify token balances
  //     const initialRecipientBalance = await targetTokenContract.balanceOf(
  //       recipient.address
  //     );
  //     console.log(`initial Recipient Balance: ${initialRecipientBalance}`);

  //     expect(initialRecipientBalance).to.lessThan(
  //       withdrawableTokens + initialRecipientBalance
  //     );

  //     // Withdraw tokens as recipient
  //     const withdrawTx = await (
  //       await targetChainBridge
  //         .connect(recipient)
  //         .withdrawTokens(targetTokenContract.target)
  //     ).wait();

  //     console.log(`Withdraw Tx: ${withdrawTx?.hash}`);

  //     await expect(withdrawTx)
  //       .to.emit(targetChainBridge, "TokensWithdrawn")
  //       .withArgs(targetTokenContract.target, recipient.address, netAmount);

  //     // Verify recipient's ERC20 balance
  //     expect(await targetTokenContract.balanceOf(recipient.address)).to.be.gt(
  //       initialRecipientBalance
  //     );
  //   });

  //   it("Should allow recipients to withdraw native ETH", async function () {
  //     // Calculate platform fee and net amount
  //     const platformFeePercentage =
  //       await targetChainBridge.platformFeePercentage();
  //     const fee = (amount * BigInt(platformFeePercentage)) / BigInt(10000);
  //     const netAmount = amount - fee;

  //     // Verify token balances
  //     const initialRecipientBalance = await targetProvider.getBalance(
  //       recipient.address
  //     );
  //     console.log(`Previous balance: ${initialRecipientBalance}`);
  //     expect(initialRecipientBalance).to.lessThan(
  //       initialRecipientBalance + netAmount
  //     );

  //     // Verify withdrawable tokens for recipient
  //     const withdrawableTokens = await targetChainBridge.withdrawableTokens(
  //       recipient.address,
  //       ethers.ZeroAddress
  //     );
  //     console.log(`Withdrawable tokens: ${withdrawableTokens}`);
  //     expect(withdrawableTokens).to.greaterThanOrEqual(netAmount);

  //     // Withdraw native ETH as recipient
  //     const withdrawTx = await (
  //       await targetChainBridge
  //         .connect(recipient)
  //         .withdrawTokens(ethers.ZeroAddress)
  //     ).wait();
  //     console.log(`Withdraw Tx: ${withdrawTx?.hash}`);

  //     expect(withdrawTx)
  //       .to.emit(targetChainBridge, "TokensWithdrawn")
  //       .withArgs(ethers.ZeroAddress, recipient.address, netAmount);

  //     // Verify recipient's ETH balance
  //     const finalRecipientBalance = await targetProvider.getBalance(
  //       recipient.address
  //     );
  //     console.log(`Current balance: ${finalRecipientBalance}`);
  //     expect(finalRecipientBalance).to.be.gt(initialRecipientBalance);
  //   });
  // });
});
