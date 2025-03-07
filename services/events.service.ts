import {
  ethers,
  WebSocketProvider,
  Listener,
  Contract,
  ZeroAddress,
  Wallet,
} from "ethers";
import { abi as bridgeAbi } from "../artifacts/contracts/Bridge.sol/Bridge.json";
import { BridgeService } from "./bridge.service";
import { CHAIN_CONFIGS } from "../config/chains";

export class BridgeEventService {
  private providers: Map<number, WebSocketProvider>;
  private contracts: Map<number, Contract>;
  private activeListeners: Map<string, Listener>;
  private reconnectAttempts: number;
  private readonly MAX_RECONNECT_ATTEMPTS = 5;
  private readonly TIMEOUT = 180000; // 3 minutes timeout

  private readonly CONVERSION_RATES: { [tokenPair: string]: number } = {
    // B10 base sepolia to B10 sepolia: 1:1 conversion rate
    "0x62060727308449B9347f5649Ea7495C061009615-0x22DD04E98a65396714b64a712678A2D27737Bb77": 1,
    // ETH to B10: 1 ETH = 2000 B10
    "0x0000000000000000000000000000000000000000-0x62060727308449B9347f5649Ea7495C061009615": 2000,
    // B10 to ETH: 1 B10 = 0.0005 ETH
    "0x62060727308449B9347f5649Ea7495C061009615-0x0000000000000000000000000000000000000000": 0.0005,
    // ETH to B10: 1 ETH = 2000 B10
    "0x0000000000000000000000000000000000000000-0x22DD04E98a65396714b64a712678A2D27737Bb77": 2000,
    // B10 to ETH: 1 B10 = 1/2000 ETH
    "0x22DD04E98a65396714b64a712678A2D27737Bb77-0x0000000000000000000000000000000000000000": 0.0005,

    // ETH to ETH: 1:1 conversion rate
    "0x0000000000000000000000000000000000000000-0x0000000000000000000000000000000000000000": 1,
    "0x62060727308449B9347f5649Ea7495C061009615-0x62060727308449B9347f5649Ea7495C061009615": 1,
    "0x22DD04E98a65396714b64a712678A2D27737Bb77-0x22DD04E98a65396714b64a712678A2D27737Bb77": 1,
  };

  constructor() {
    const owner = new Wallet(process.env.ADMIN_ACCOUNT_PK!);
    this.providers = new Map();
    this.contracts = new Map();
    this.activeListeners = new Map();
    this.reconnectAttempts = 0;

    for (const [chainId, config] of Object.entries(CHAIN_CONFIGS)) {
      const chainIdNumber = Number(chainId);
      const provider = new WebSocketProvider(config.wsRpcUrl);
      const contract = new Contract(
        config.bridgeAddress,
        bridgeAbi,
        owner.connect(provider)
      );
      this.providers.set(chainIdNumber, provider);
      this.contracts.set(chainIdNumber, contract);

      provider.websocket.onerror = (error: any) => {
        console.error(`WebSocket error on chain ${chainId}:`, error);
        this.reconnect(chainIdNumber);
      };
    }
  }

  public async startListening() {
    try {
      for (const [chainId, contract] of this.contracts.entries()) {
        this.setupListenersForChain(chainId, contract);
      }
      console.log("Started listening for events...");
    } catch (error) {
      console.error("Error starting listeners:", error);
    }
  }

  private setupListenersForChain(chainId: number, contract: Contract) {
    this.waitForEvent(
      contract,
      chainId,
      "TokensLocked",
      async (eventArgs: any[]) => {
        const [
          sourceToken,
          targetToken,
          lockedAmount,
          sender,
          recipient,
          sourceChainId,
          targetChainId,
          lockHash,
        ] = eventArgs;
        const conversionRate = this.getConversionRate(sourceToken, targetToken);
        const scaledConversionRate = BigInt(Math.floor(conversionRate * 1e18));
        const releaseAmount =
          (lockedAmount * scaledConversionRate) / BigInt(1e18);
        console.log(
          `Computed release amount: ${releaseAmount.toString()} tokens`
        );

        const bridgeService = new BridgeService();
        const releaseResult = await bridgeService.releaseTokens({
          targetToken: sourceToken,
          sourceChainId,
          targetChainId,
          amount: releaseAmount,
          sender,
          recipient,
          lockTxHash: lockHash,
        });
        console.log("Release operation result:", releaseResult);
      }
    );

    this.waitForEvent(
      contract,
      chainId,
      "TokensReleased",
      (eventArgs: any[]) => {
        console.log("TokensReleased event detected:", eventArgs);
      }
    );

    this.waitForEvent(
      contract,
      chainId,
      "PlatformFeeDeducted",
      (eventArgs: any[]) => {
        console.log("PlatformFeeDeducted event detected:", eventArgs);
      }
    );
  }

  public waitForEvent(
    contract: Contract,
    chainId: number,
    eventName: string,
    callback: (...args: any[]) => void
  ): void {
    const key = `${eventName}-${chainId}`;
    const timer = setTimeout(() => {
      console.error(
        `Timeout waiting for ${eventName} event on chain ${chainId}`
      );
      this.activeListeners.delete(key);
    }, this.TIMEOUT);

    const eventListener = (...args: any[]) => {
      clearTimeout(timer);
      this.activeListeners.delete(key);
      callback(args);
    };

    contract.on(eventName, eventListener);
    this.activeListeners.set(key, eventListener);
  }

  private getConversionRate(sourceToken: string, targetToken: string): number {
    const rateKey = `${sourceToken}-${targetToken}`;
    const rate = this.CONVERSION_RATES[rateKey];
    if (!rate) {
      throw new Error(
        `No conversion rate defined for ${sourceToken} to ${targetToken}`
      );
    }
    return rate;
  }

  private async reconnect(chainId: number) {
    if (this.reconnectAttempts >= this.MAX_RECONNECT_ATTEMPTS) {
      throw new Error("Max reconnection attempts reached");
    }

    this.reconnectAttempts++;
    try {
      const config = CHAIN_CONFIGS[chainId];
      const provider = new WebSocketProvider(config.wsRpcUrl);
      const contract = new Contract(
        config.bridgeAddress,
        bridgeAbi,
        new Wallet(process.env.ADMIN_ACCOUNT_PK!).connect(provider)
      );

      this.providers.set(chainId, provider);
      this.contracts.set(chainId, contract);
      this.setupListenersForChain(chainId, contract);
      this.reconnectAttempts = 0;
    } catch (error) {
      console.error("Reconnection failed:", error);
      setTimeout(() => this.reconnect(chainId), 5000);
    }
  }

  private removeAllListeners() {
    for (const [key, listener] of this.activeListeners.entries()) {
      const [eventName, chainId] = key.split("-");
      const contract = this.contracts.get(Number(chainId));
      if (contract) {
        contract.off(eventName, listener);
      }
    }
    this.activeListeners.clear();
  }

  public async destroy() {
    this.removeAllListeners();
    for (const provider of this.providers.values()) {
      await provider.destroy();
    }
  }
}
