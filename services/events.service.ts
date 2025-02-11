import {
  ethers,
  Contract,
  WebSocketProvider,
  Listener,
  EventLog,
  LogDescription,
} from "ethers";
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
        // this.removeListener(eventName, eventListener);
        reject(new Error(`Timeout waiting for ${eventName} event`));
      }, this.TIMEOUT);

      // Set up a filter for all logs from the contract
      const filter = {
        address: this.contract.target,
      };

      console.log("Setting up filter:", filter);

      // Listen for raw logs and decode them
      const eventListener = async (log: any) => {
        try {
          console.log("Raw log received:", {
            address: log.address,
            topics: log.topics,
            data: log.data,
            blockNumber: log.blockNumber,
            transactionHash: log.transactionHash,
          });

          // Try to parse the log
          let parsedLog: LogDescription;
          try {
            parsedLog = this.contract.interface.parseLog({
              topics: [...log.topics],
              data: log.data,
            })!;
            console.log("Parsed log:", parsedLog);
          } catch (parseError) {
            console.log("Could not parse log:", parseError);
            return;
          }

          // Check if this is the event we're looking for
          if (parsedLog.name === eventName) {
            console.log(`${eventName} event detected:`, {
              args: parsedLog.args,
              eventName: parsedLog.name,
              signature: parsedLog.signature,
            });

            clearTimeout(timer);
            this.provider.off("block", blockListener);
            resolve(parsedLog);
          }
        } catch (error) {
          console.error("Error processing log:", error);
        }
      };

      // Listen for new blocks and check logs
      const blockListener = async (blockNumber: number) => {
        try {
          const block = await this.provider.getBlock(blockNumber, true);
          if (!block) return;

          // Process each transaction in the block
          const logs = await this.provider.getLogs({
            ...filter,
            fromBlock: blockNumber,
            toBlock: blockNumber,
          });

          for (const log of logs) {
            await eventListener(log);
          }
        } catch (error) {
          console.error("Error processing block:", error);
        }
      };

      // Start listening for new blocks
      this.provider.on("block", blockListener);

      console.log(`Listeners set up for ${eventName}`);
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
