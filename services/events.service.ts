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
  private readonly TIMEOUT = 180000; // 2 minutes timeout

  // Hardcoded conversion rates for tokens between Base Sepolia and Sepolia
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
      const provider = new WebSocketProvider(config.wsRpcUrl);
      const contract = new Contract(
        config.bridgeAddress,
        bridgeAbi,
        owner.connect(provider)
      );
      this.providers.set(Number(chainId), provider);
      this.contracts.set(Number(chainId), contract);

      provider.websocket.onerror = (error: any) => {
        console.error("WebSocket error:", error);
        this.reconnect(Number(chainId));
      };
    }
  }

  public async startListening() {
    try {
      for (const [chainId, contract] of this.contracts.entries()) {
        // Listen for TokensLocked event
        this.waitForEvent(
          contract,
          "TokensLocked",
          async (eventArgs: any[]) => {
            console.log("TokensLocked event detected:", eventArgs);

            // Extract relevant data from the event
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
            console.log({
              sourceToken,
              targetToken,
              lockedAmount,
              sender,
              recipient,
              sourceChainId,
              targetChainId,
              lockHash,
            });
            // Compute the tokens to be released using a conversion rate
            const conversionRate = this.getConversionRate(
              sourceToken,
              targetToken
            );
            // Scale the conversion rate to match the token's smallest unit (e.g., 10^18 for 18 decimals)
            const scaledConversionRate = BigInt(
              Math.floor(conversionRate * 1e18)
            );
            const releaseAmount: bigint =
              (lockedAmount * scaledConversionRate) / BigInt(1e18);
            console.log(
              `Computed release amount: ${releaseAmount.toString()} tokens`
            );

            // Initialize BridgeService
            const bridgeService = new BridgeService();

            // Call releaseTokens function with computed release amount
            const releaseResult = await bridgeService.releaseTokens({
              targetToken: sourceToken,
              sourceChainId, // Replace with actual source chain ID
              targetChainId, // Replace with actual target chain ID
              amount: releaseAmount,
              sender: sender,
              recipient: recipient,
              lockTxHash: lockHash,
            });

            console.log("Release operation result:", releaseResult);
          }
        );

        // Listen for TokensReleased event
        this.waitForEvent(contract, "TokensReleased", (eventArgs: any[]) => {
          console.log("TokensReleased event detected:", eventArgs);
        });

        // Wait for lock event and confirmation
        this.waitForEvent(
          contract,
          "PlatformFeeDeducted",
          (eventArgs: any[]) => {
            console.log("PlatformFeeDeducted event detected:", eventArgs);
          }
        );
      }

      console.log(
        "Started listening for TokensLocked and TokensReleased events..."
      );
    } catch (error) {
      console.error("Error starting listeners:", error);
    }
  }

  public waitForEvent(
    contract: Contract,
    eventName: string,
    callback: (...args: any[]) => void
  ): void {
    console.log(`Setting up listener for ${eventName} event...`);

    const timer = setTimeout(() => {
      contract.off(eventName, eventListener);
      console.error(`Timeout waiting for ${eventName} event`);
    }, this.TIMEOUT);

    const eventListener = (...args: any[]) => {
      console.log(`${eventName} event detected:`, args);
      clearTimeout(timer);
      contract.off(eventName, eventListener); // Remove the listener after detecting the event
      callback(args); // Invoke the callback with the event data
    };

    contract.on(eventName, eventListener);
    console.log(`Listener set up for ${eventName}`);
  }

  private getConversionRate(sourceToken: string, targetToken: string): number {
    // Construct a unique key for the conversion rate lookup
    console.log({ sourceToken, targetToken });
    const rateKey = `${sourceToken}-${targetToken}`;
    console.log({ rateKey });
    // Fetch the conversion rate
    const rate = this.CONVERSION_RATES[rateKey];

    console.log(`Conversion rate for ${rateKey}: ${rate}`);
    if (!rate) {
      throw new Error(
        `No conversion rate defined for ${sourceToken} to ${targetToken}`
      );
    }
    return rate;
  }

  private getTargetToken(sourceToken: string): string {
    // Implement the logic to get the target token based on the source token
    // This is a placeholder implementation
    return sourceToken; // Replace with actual logic
  }

  private async reconnect(chainId: number) {
    if (this.reconnectAttempts >= this.MAX_RECONNECT_ATTEMPTS) {
      throw new Error("Max reconnection attempts reached");
    }

    this.reconnectAttempts++;
    try {
      const provider = this.providers.get(chainId);
      if (!provider) {
        throw new Error(`Provider for chain ${chainId} not found`);
      }

      this.removeAllListeners();
      const newProvider = new WebSocketProvider(provider.websocket.toString());
      const contract = new Contract(
        this.contracts.get(chainId)?.target!,
        bridgeAbi,
        newProvider
      );

      this.providers.set(chainId, newProvider);
      this.contracts.set(chainId, contract);
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
