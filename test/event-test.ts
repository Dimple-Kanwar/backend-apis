import { ethers } from "ethers";
import { abi as bridgeAbi } from "../artifacts/contracts/Bridge.sol/Bridge.json";

// Use WebSocket provider for persistent connection
const WS_PROVIDER_URL = "wss://base-sepolia-rpc.publicnode.com";
const provider = new ethers.WebSocketProvider(WS_PROVIDER_URL);

const contractAddress = "0x6da05625714eF4494d3a0f4bBEEd7D4AEbb896cc";
const contract = new ethers.Contract(contractAddress, bridgeAbi, provider);

const eventNames = [
  "TokensLocked",
  "NativeTokenLocked",
  "TokensReleased",
  "NativeTokenReleased",
];

// Track active listeners and filter status
const activeListeners = new Map<string, ethers.Listener>();

async function setupEventListeners() {
  for (const eventName of eventNames) {
    try {
      const listener = (...args: any[]) => {
        const event = args[args.length - 1];
        console.log(`\nNew ${eventName} event:`);
        console.log("Args:", args.slice(0, -1));
        console.log("Event data:", event);
        console.log("Block number:", event.blockNumber);
        console.log("----------------------------------");
      };

      // Add listener and track it
      contract.on(eventName, listener);
      activeListeners.set(eventName, listener);

      console.log(`Listener added for ${eventName}`);
    } catch (error) {
      console.error(`Error setting up ${eventName} listener:`, error);
    }
  }

  // Handle provider connection issues
  provider.websocket.onerror = (error) => {
    console.error("WebSocket error:", error);
    reconnect();
  };
}

// Reconnection logic
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

async function reconnect() {
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    console.error("Max reconnection attempts reached. Exiting.");
    process.exit(1);
  }

  reconnectAttempts++;
  console.log(
    `Reconnection attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}`
  );

  try {
    // Destroy old listeners
    removeAllListeners();

    // Create new provider
    const newProvider = new ethers.WebSocketProvider(WS_PROVIDER_URL);
    Object.assign(provider, newProvider);

    await setupEventListeners();
    reconnectAttempts = 0; // Reset on successful reconnect
  } catch (error) {
    console.error("Reconnection failed:", error);
    setTimeout(reconnect, 5000);
  }
}

function removeAllListeners() {
  for (const [eventName, listener] of activeListeners) {
    contract.off(eventName, listener);
  }
  activeListeners.clear();
}

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("\nGracefully shutting down...");
  removeAllListeners();
  await provider.destroy();
  process.exit();
});

// Initialize listeners
setupEventListeners().catch(console.error);

// Optional: Periodic health check
setInterval(async () => {
  try {
    await provider.getBlockNumber();
    console.log(
      "Connection healthy. Current block:",
      await provider.getBlockNumber()
    );
  } catch (error) {
    console.warn("Health check failed:", error);
    reconnect();
  }
}, 60000);
