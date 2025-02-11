import { ethers, Contract, WebSocketProvider, Listener } from "ethers";
import { abi as bridgeAbi } from "../artifacts/contracts/Bridge.sol/Bridge.json";

export class BridgeEventService {
  private provider: WebSocketProvider;
  private contract: Contract;
  private activeListeners: Map<string, Listener>;
  private reconnectAttempts: number;
  private readonly MAX_RECONNECT_ATTEMPTS = 5;
  private readonly TIMEOUT = 120000; // 2 minutes timeout

  constructor(wsProviderUrl: string, contractAddress: string) {
    this.provider = new ethers.WebSocketProvider(wsProviderUrl);
    this.contract = new ethers.Contract(
      contractAddress,
      bridgeAbi,
      this.provider
    );
    this.activeListeners = new Map();
    this.reconnectAttempts = 0;

    this.provider.websocket.onerror = (error) => {
      console.error("WebSocket error:", error);
      this.reconnect();
    };
  }

  public async waitForEvent(eventName: string): Promise<any> {
    console.log(`Waiting for ${eventName} event...`);

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.contract.off(eventName, eventListener);
        reject(new Error(`Timeout waiting for ${eventName} event`));
      }, this.TIMEOUT);

      const eventListener = (...args: any[]) => {
        console.log(`${eventName} event detected:`, args);
        clearTimeout(timer);
        this.contract.off(eventName, eventListener);
        resolve(args);
      };

      this.contract.on(eventName, eventListener);
      console.log(`Listener set up for ${eventName}`);
    });
  }

  private async reconnect() {
    if (this.reconnectAttempts >= this.MAX_RECONNECT_ATTEMPTS) {
      throw new Error("Max reconnection attempts reached");
    }

    this.reconnectAttempts++;
    try {
      this.removeAllListeners();
      const newProvider = new ethers.WebSocketProvider(
        this.provider.websocket.toString()
      );
      this.provider = newProvider;
      this.contract = new ethers.Contract(
        this.contract.target,
        bridgeAbi,
        this.provider
      );
      this.reconnectAttempts = 0;
    } catch (error) {
      console.error("Reconnection failed:", error);
      setTimeout(() => this.reconnect(), 5000);
    }
  }

  private removeAllListeners() {
    for (const [eventName, listener] of this.activeListeners) {
      this.contract.off(eventName, listener);
    }
    this.activeListeners.clear();
  }

  public async destroy() {
    this.removeAllListeners();
    await this.provider.destroy();
  }
}
