import { ethers, Contract, JsonRpcProvider, Wallet } from "ethers";

import {
  generateLockHash,
  generateNonce,
  generateReleaseHash,
} from "../utils/common";
import { BridgeEventService } from "./events.service";
import { CHAIN_CONFIGS } from "../config/chains";
import { bridgeAbi, tokenAbi } from "../utils/abi";

export class BridgeService {
  private sourceProvider: JsonRpcProvider;
  private targetProvider: JsonRpcProvider;
  private sourceChainBridge: Contract;
  private targetChainBridge: Contract;
  private sourceTokenContract!: Contract;
  private targetTokenContract!: Contract;
  private owner: Wallet;
  private sender: Wallet;
  // private recipient: Wallet;
  private sourceEventService: BridgeEventService;
  private targetEventService: BridgeEventService;

  constructor() {
    if (
      !process.env.ADMIN_ACCOUNT_PK ||
      !process.env.USER1_PK
      // !process.env.USER2_PK
    ) {
      throw new Error("Required private keys not set");
    }
    if (!CHAIN_CONFIGS[84532]) {
      throw new Error("Source Chain ID not supported");
    }
    if (!CHAIN_CONFIGS[11155111]) {
      throw new Error("Target Chain ID not supported");
    }

    this.sourceProvider = new ethers.JsonRpcProvider(
      CHAIN_CONFIGS[84532].rpcUrl
    );
    this.targetProvider = new ethers.JsonRpcProvider(
      CHAIN_CONFIGS[11155111].rpcUrl
    );
    this.owner = new Wallet(process.env.ADMIN_ACCOUNT_PK, this.sourceProvider);
    this.sender = new Wallet(process.env.USER1_PK, this.sourceProvider);
    // this.recipient = new Wallet(process.env.USER2_PK, this.targetProvider);

    this.sourceChainBridge = new Contract(
      CHAIN_CONFIGS[84532].bridgeAddress,
      bridgeAbi,
      this.owner
    );
    this.targetChainBridge = new Contract(
      CHAIN_CONFIGS[11155111].bridgeAddress,
      bridgeAbi,
      this.owner.connect(this.targetProvider)
    );

    this.sourceEventService = new BridgeEventService(
      CHAIN_CONFIGS[84532].wsRpcUrl,
      CHAIN_CONFIGS[84532].bridgeAddress
    );
    this.targetEventService = new BridgeEventService(
      CHAIN_CONFIGS[11155111].wsRpcUrl,
      CHAIN_CONFIGS[11155111].bridgeAddress
    );
  }
  private async verifyReleaseState(
    targetToken: string,
    amount: bigint,
    releaseHash: string,
    recipient: string
  ): Promise<void> {
    try {
      // Check if release hash is already processed
      const isProcessed = await this.targetChainBridge.processedHashes(
        releaseHash
      );
      if (isProcessed) {
        throw new Error("Release hash already processed");
      }

      // Check bridge balance
      const bridgeBalance = await this.targetTokenContract.balanceOf(
        this.targetChainBridge.target
      );
      console.log("Bridge balance:", bridgeBalance.toString());
      console.log("Required amount:", amount.toString());

      if (bridgeBalance < amount) {
        throw new Error(
          `Insufficient bridge balance. Has: ${bridgeBalance}, Needs: ${amount}`
        );
      }

      // Verify recipient address
      const code = await this.targetProvider.getCode(recipient);
      if (code !== "0x") {
        throw new Error("Recipient cannot be a contract");
      }
    } catch (error) {
      console.error("Release state verification failed:", error);
      throw error;
    }
  }

  public async bridgeToken(request: {
    sourceToken: string;
    targetToken: string;
    sourceChainId: number;
    targetChainId: number;
    amount: string;
    sender: string;
    recipient: string;
  }): Promise<any> {
    try {
      const {
        sourceToken,
        targetToken,
        sourceChainId,
        targetChainId,
        amount,
        sender,
        recipient,
      } = request;

      if (
        !process.env.ADMIN_ACCOUNT_PK ||
        !process.env.USER1_PK
        // !process.env.USER2_PK
      ) {
        throw new Error("Required private keys not set");
      }
      if (!CHAIN_CONFIGS[sourceChainId]) {
        throw new Error("Source Chain ID not supported");
      }
      if (!CHAIN_CONFIGS[targetChainId]) {
        throw new Error("Target Chain ID not supported");
      }

      this.sourceProvider = new ethers.JsonRpcProvider(
        CHAIN_CONFIGS[sourceChainId].rpcUrl
      );
      this.targetProvider = new ethers.JsonRpcProvider(
        CHAIN_CONFIGS[targetChainId].rpcUrl
      );
      this.owner = new Wallet(
        process.env.ADMIN_ACCOUNT_PK,
        this.sourceProvider
      );
      this.sender = new Wallet(process.env.USER1_PK, this.sourceProvider);
      // this.recipient = new Wallet(process.env.USER2_PK, this.targetProvider);

      this.sourceChainBridge = new Contract(
        CHAIN_CONFIGS[sourceChainId].bridgeAddress,
        bridgeAbi,
        this.owner
      );
      this.targetChainBridge = new Contract(
        CHAIN_CONFIGS[targetChainId].bridgeAddress,
        bridgeAbi,
        this.owner.connect(this.targetProvider)
      );

      this.sourceEventService = new BridgeEventService(
        CHAIN_CONFIGS[sourceChainId].wsRpcUrl,
        CHAIN_CONFIGS[sourceChainId].bridgeAddress
      );
      this.targetEventService = new BridgeEventService(
        CHAIN_CONFIGS[targetChainId].wsRpcUrl,
        CHAIN_CONFIGS[targetChainId].bridgeAddress
      );
      console.log("Starting bridge operation:", request);

      // Initialize token contracts
      this.sourceTokenContract = new Contract(
        sourceToken,
        tokenAbi,
        this.owner
      );
      this.targetTokenContract = new Contract(
        targetToken,
        tokenAbi,
        this.owner.connect(this.targetProvider)
      );

      const formattedAmount = ethers.parseEther(amount);

      // Verify owner is validator
      const isSourceValidator = await this.sourceChainBridge.validators(
        this.owner.address
      );
      const isTargetValidator = await this.targetChainBridge.validators(
        this.owner.address
      );
      if (!isSourceValidator || !isTargetValidator) {
        throw new Error("Owner is not a validator");
      }
      if (
        new Wallet(process.env.USER1_PK!, this.sourceProvider).address != sender
      ) {
        throw new Error("Private Key and Public Key mismatch");
      }
      // Check and handle token approval
      console.log("Checking token allowance...");
      console.log("Sender:", sender);

      const allowance = await (
        this.sourceTokenContract.connect(this.sender) as Contract
      ).allowance(sender, this.sourceChainBridge.target);
      if (allowance < formattedAmount) {
        console.log("Approving tokens...");
        const approveTx = await (
          this.sourceTokenContract.connect(this.sender) as Contract
        ).approve(this.sourceChainBridge.target, formattedAmount);
        await approveTx.wait();
      }

      // Verify sender balance
      const senderBalance = await this.sourceTokenContract.balanceOf(sender);
      if (senderBalance < formattedAmount) {
        throw new Error("Insufficient sender balance");
      }

      // Verify bridge liquidity
      const targetBridgeBalance = await this.targetTokenContract.balanceOf(
        this.targetChainBridge.target
      );
      if (targetBridgeBalance < formattedAmount) {
        throw new Error("Insufficient bridge liquidity");
      }

      // Lock tokens
      const nonce = await generateNonce(sender);
      const targetChainTxHash = await generateLockHash(
        sourceToken,
        sender,
        recipient,
        formattedAmount,
        nonce,
        sourceChainId,
        targetChainId
      );

      const lockTx = await (
        this.sourceChainBridge.connect(this.owner) as Contract
      ).executeTokenOperation(
        sourceToken,
        formattedAmount,
        sender,
        targetChainTxHash,
        true
      );

      // Wait for lock event and confirmation
      const [lockEvent, lockReceipt] = await Promise.all([
        this.sourceEventService.waitForEvent("TokensLocked"),
        lockTx.wait(),
      ]);
      console.log("Lock transaction completed:", lockReceipt.hash);

      // Verify bridge received tokens
      // const bridgeBalance = await this.sourceTokenContract.balanceOf(
      //   this.sourceChainBridge.target
      // );
      // if (bridgeBalance < formattedAmount) {
      //   throw new Error("Lock operation failed: Bridge did not receive tokens");
      // }

      // Release tokens
      console.log("lock hash", lockReceipt.hash);
      const releaseHash = await generateReleaseHash(
        targetToken,
        sender,
        recipient,
        formattedAmount,
        nonce,
        lockReceipt.hash,
        sourceChainId,
        targetChainId
      );
      console.log("Release hash:", releaseHash);
      // const targetOwner = this.owner.connect(this.targetProvider);
      let releaseReceip = { hash: "" };
      try {
        // Add explicit gas estimation handling
        await this.verifyReleaseState(
          targetToken,
          formattedAmount,
          releaseHash,
          recipient
        );
        const estimatedGas =
          await this.targetChainBridge.executeTokenOperation.estimateGas(
            targetToken,
            formattedAmount,
            recipient,
            releaseHash,
            false
          );

        const releaseTx = await this.targetChainBridge.executeTokenOperation(
          targetToken,
          formattedAmount,
          recipient,
          releaseHash,
          false,
          {
            gasLimit: Math.ceil(Number(estimatedGas) * 1.2), // Add 20% buffer
          }
        );
        const [releaseEvent, releaseReceipt] = await Promise.all([
          this.targetEventService.waitForEvent("TokensReleased"),
          releaseTx.wait(),
        ]);
        releaseReceip = releaseReceipt;
      } catch (error) {
        // Add specific error handling for gas estimation
        if ((error as any).code === "UNPREDICTABLE_GAS_LIMIT") {
          // Handle gas estimation failure
          console.log("Gas estimation failed, trying with fixed gas limit");
          // Try with fixed gas limit
          const releaseTx = await this.targetChainBridge.executeTokenOperation(
            targetToken,
            formattedAmount,
            recipient,
            releaseHash,
            false,
            {
              gasLimit: 500000, // Fixed gas limit
            }
          );
        }
        throw error;
      }

      // Wait for release event and confirmation

      console.log("Release transaction completed:", releaseReceip.hash);

      // Verify recipient received tokens
      const recipientBalance = await this.targetTokenContract.balanceOf(
        recipient
      );
      if (recipientBalance < formattedAmount) {
        throw new Error(
          "Release operation failed: Recipient did not receive tokens"
        );
      }

      return {
        success: true,
        sourceTxHash: lockReceipt.hash,
        targetTxHash: releaseReceip.hash,
        status: "COMPLETED",
      };
    } catch (error) {
      console.error("Bridge operation failed:", error);
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Unknown error occurred",
        status: "FAILED",
      };
    } finally {
      await this.destroy();
    }
  }

  public async destroy() {
    await Promise.all([
      this.sourceProvider.destroy(),
      this.targetProvider.destroy(),
      this.sourceEventService.destroy(),
      this.targetEventService.destroy(),
    ]);
  }
}
