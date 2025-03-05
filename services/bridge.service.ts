import { ethers, Contract, JsonRpcProvider } from "ethers";
import { abi as tokenAbi } from "../artifacts/contracts/MockERC20Token.sol/MockERC20Token.json";
import { abi as bridgeAbi } from "../artifacts/contracts/Bridge.sol/Bridge.json";
import {
  generateLockHash,
  generateNonce,
  generateReleaseHash,
} from "../utils/common";
import { BridgeEventService } from "./events.service";
import { CHAIN_CONFIGS } from "../config/chains";
import "dotenv/config";

export class BridgeService {
  private providers: Map<number, JsonRpcProvider>;
  private bridges: Map<number, Contract>;
  public eventServices: Map<number, BridgeEventService>;
  private owner: ethers.Wallet;

  constructor() {
    if (!process.env.ADMIN_ACCOUNT_PK) {
      throw new Error("Admin private key not set");
    }

    // Initialize maps for providers, bridges, and event services
    this.providers = new Map();
    this.bridges = new Map();
    this.eventServices = new Map();

    // Initialize the admin wallet
    this.owner = new ethers.Wallet(process.env.ADMIN_ACCOUNT_PK);

    // Dynamically initialize providers, bridges, and event services for all chains
    for (const [chainId, config] of Object.entries(CHAIN_CONFIGS)) {
      const provider = new ethers.JsonRpcProvider(config.rpcUrl);
      const bridge = new Contract(config.bridgeAddress, bridgeAbi, this.owner.connect(provider));
      const eventService = new BridgeEventService();

      this.providers.set(Number(chainId), provider);
      this.bridges.set(Number(chainId), bridge);
      this.eventServices.set(Number(chainId), eventService);
    }
  }

  private async verifyReleaseState(
    targetChainId: number,
    targetToken: string,
    amount: bigint,
    releaseHash: string,
    recipient: string
  ): Promise<void> {
    try {
      const targetChainBridge = this.bridges.get(targetChainId);
      const targetProvider = this.providers.get(targetChainId);

      if (!targetChainBridge || !targetProvider) {
        throw new Error(`Chain ID ${targetChainId} not supported`);
      }

      // Check if release hash is already processed
      const isProcessed = await targetChainBridge.processedHashes(releaseHash);
      if (isProcessed) {
        throw new Error("Release hash already processed");
      }

      // Initialize target token contract
      const targetTokenContract = new Contract(targetToken, tokenAbi, this.owner.connect(targetProvider));

      // Check bridge balance
      const bridgeBalance = await targetTokenContract.balanceOf(targetChainBridge.target);
      console.log("Bridge balance:", bridgeBalance.toString());
      console.log("Required amount:", amount.toString());

      if (bridgeBalance < amount) {
        throw new Error(`Insufficient bridge balance. Has: ${bridgeBalance}, Needs: ${amount}`);
      }

      // Verify recipient address
      const code = await targetProvider.getCode(recipient);
      if (code !== "0x") {
        throw new Error("Recipient cannot be a contract");
      }
    } catch (error) {
      console.error("Release state verification failed:", error);
      throw error;
    }
  }

  public async releaseTokens(request: {
    targetToken: string;
    sourceChainId: number;
    targetChainId: number;
    amount: bigint;
    sender: string;
    recipient: string;
    lockTxHash: string;
  }): Promise<any> {
    try {
      const {
        targetToken,
        targetChainId,
        amount,
        sender,
        recipient,
        lockTxHash,
        sourceChainId,
      } = request;
      const targetProvider = new ethers.JsonRpcProvider(
        process.env.SEPOLIA_TESTNET_RPC!
      );
      console.log({targetProvider});
      const targetChainBridge =  new Contract(process.env.SEPOLIA_BRIDGE_ADDRESS!, bridgeAbi, this.owner.connect(targetProvider)); 
      
      console.log({targetChainBridge});
      // const targetEventService = this.eventServices.get(targetChainId);

      if (!targetProvider || !targetChainBridge) {
        throw new Error(`Target Chain ID ${targetChainId} not supported`);
      }

      // Initialize target token contract
      const targetTokenContract = new Contract(targetToken, tokenAbi, this.owner.connect(targetProvider));

      // Generate release hash
      const nonce = await generateNonce(sender);
      const releaseHash = await generateReleaseHash(
        targetToken,
        sender,
        recipient,
        amount,
        nonce,
        lockTxHash,
        sourceChainId,
        targetChainId
      );
      console.log("Release hash:", releaseHash);

      // Verify release state
      // await this.verifyReleaseState(targetChainId, targetToken, formattedAmount, releaseHash, recipient);
      const recipientWithdrawalLimit_before = await targetChainBridge.withdrawableTokens(
        recipient,
        targetToken
      );
      console.log({recipientWithdrawalLimit_before});
      // Estimate gas for release operation
      const estimatedGas = await targetChainBridge.releaseTokens.estimateGas(
        targetToken,
        amount,
        recipient,
        releaseHash
      );

      // Execute release operation
      const releaseTx = await targetChainBridge.releaseTokens(
        targetToken,
        amount,
        recipient,
        releaseHash,
        {
          gasLimit: Math.ceil(Number(estimatedGas) * 1.2), // Add 20% buffer
        }
      );
      const receipt = await releaseTx.wait();

      console.log("Release transaction completed:", receipt.hash);
      
      return {
        success: true,
        txHash: receipt.hash,
        status: "COMPLETED",
      };
    } catch (error) {
      console.error("Release operation failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error occurred",
        status: "FAILED",
      };
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

      const sourceProvider = this.providers.get(sourceChainId);
      const targetProvider = this.providers.get(targetChainId);
      const sourceChainBridge = this.bridges.get(sourceChainId);
      const targetChainBridge = this.bridges.get(targetChainId);
      const sourceEventService = this.eventServices.get(sourceChainId);
      const targetEventService = this.eventServices.get(targetChainId);

      if (
        !sourceProvider ||
        !targetProvider ||
        !sourceChainBridge ||
        !targetChainBridge ||
        !sourceEventService ||
        !targetEventService
      ) {
        throw new Error("Source or Target Chain ID not supported");
      }

      // Initialize token contracts
      const sourceTokenContract = new Contract(sourceToken, tokenAbi, this.owner.connect(sourceProvider));
      const targetTokenContract = new Contract(targetToken, tokenAbi, this.owner.connect(targetProvider));

      const formattedAmount = ethers.parseEther(amount);

      // Lock tokens
      const nonce = await generateNonce(sender);
      const targetChainTxHash = await generateLockHash(
        sourceToken,
        sender,
        recipient,
        formattedAmount.toString(),
        nonce,
        sourceChainId,
        targetChainId
      );

      const lockTx = await sourceChainBridge.lockTokens(
        sourceToken,
        formattedAmount,
        sender,
        targetChainTxHash,
        true
      );

      // Wait for lock event and confirmation
      // const [lockEvent, lockReceipt] = await Promise.all([
      //   sourceEventService.waitForEvent("TokensLocked"),
      //   lockTx.wait(),
      // ]);
      console.log("Lock transaction completed:", lockTx.hash);

      // Call releaseTokens to handle the release operation
      const releaseResult = await this.releaseTokens({
        targetToken,
        sourceChainId,
        targetChainId,
        amount: formattedAmount,
        sender,
        recipient,
        lockTxHash: lockTx.hash,
      });

      return {
        success: releaseResult.success,
        sourceTxHash: lockTx.hash,
        targetTxHash: releaseResult.txHash,
        status: releaseResult.status,
      };
    } catch (error) {
      console.error("Bridge operation failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error occurred",
        status: "FAILED",
      };
    } finally {
      await this.destroy();
    }
  }

  public async destroy() {
    await Promise.all(
      Array.from(this.providers.values()).map((provider) => provider.destroy())
    );
    await Promise.all(
      Array.from(this.eventServices.values()).map((service) => service.destroy())
    );
  }
}