import { ethers, Contract, JsonRpcProvider, Wallet } from "ethers";
import { abi as tokenAbi } from "../artifacts/contracts/MockERC20Token.sol/MockERC20Token.json";
import { abi as bridgeAbi } from "../artifacts/contracts/Bridge.sol/Bridge.json";
import {
  generateLockHash,
  generateNonce,
  generateReleaseHash,
} from "../utils/common";
// import { Bridge, MockERC20 } from "../typechain-types";
import { BridgeEventService } from "./events.service";

export class BridgeService {
  private sourceProvider: JsonRpcProvider;
  private targetProvider: JsonRpcProvider;
  private sourceChainBridge: Contract;
  private targetChainBridge: Contract;
  private sourceTokenContract!: Contract;
  private targetTokenContract!: Contract;
  private owner: Wallet;
  private sender: Wallet;
  private recipient: Wallet;
  private sourceEventService: BridgeEventService;
  private targetEventService: BridgeEventService;

  constructor(
    sourceRpcUrl: string,
    sourceBridgeAddress: string,
    targetRpcUrl: string,
    targetBridgeAddress: string
  ) {
    if (
      !process.env.ADMIN_ACCOUNT_PK ||
      !process.env.USER1_PK ||
      !process.env.USER2_PK
    ) {
      throw new Error("Required private keys not set");
    }

    this.sourceProvider = new ethers.JsonRpcProvider(sourceRpcUrl);
    this.targetProvider = new ethers.JsonRpcProvider(targetRpcUrl);

    this.owner = new Wallet(process.env.ADMIN_ACCOUNT_PK, this.sourceProvider);
    this.sender = new Wallet(process.env.USER1_PK, this.sourceProvider);
    this.recipient = new Wallet(process.env.USER2_PK, this.targetProvider);

    this.sourceChainBridge = new Contract(
      sourceBridgeAddress,
      bridgeAbi,
      this.owner
    );
    this.targetChainBridge = new Contract(
      targetBridgeAddress,
      bridgeAbi,
      this.owner.connect(this.targetProvider)
    );

    // Initialize event services
    this.sourceEventService = new BridgeEventService(
      "wss://base-sepolia-rpc.publicnode.com",
      sourceBridgeAddress
    );
    this.targetEventService = new BridgeEventService(
      "wss://arbitrum-sepolia-rpc.publicnode.com",
      targetBridgeAddress
    );
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

      // Check and handle token approval
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
      const bridgeBalance = await this.sourceTokenContract.balanceOf(
        this.sourceChainBridge.target
      );
      if (bridgeBalance < formattedAmount) {
        throw new Error("Lock operation failed: Bridge did not receive tokens");
      }

      // Release tokens
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

      const targetOwner = this.owner.connect(this.targetProvider);
      const releaseTx = await (
        this.targetChainBridge.connect(targetOwner) as Contract
      ).executeTokenOperation(
        targetToken,
        formattedAmount,
        recipient,
        releaseHash,
        false
      );

      // Wait for release event and confirmation
      const [releaseEvent, releaseReceipt] = await Promise.all([
        this.targetEventService.waitForEvent("TokensReleased"),
        releaseTx.wait(),
      ]);
      console.log("Release transaction completed:", releaseReceipt.hash);

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
        targetTxHash: releaseReceipt.hash,
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
