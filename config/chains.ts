import { ChainConfig } from "../types";
import "dotenv/config";

export const CHAIN_CONFIGS: { [chainId: number]: ChainConfig } = {
  // 421614: {
  //   // Arbitrum Sepolia
  //   rpcUrl: "https://sepolia-rollup.arbitrum.io/rpc",
  //   chainId: 421614,
  //   name: "Arbitrum Sepolia",
  //   bridgeAddress: "0x16D769F63Fe44f4f5590159cECADafaA9A9B8Fde",
  //   supportedTokens: {
  //     B10: {
  //       address: "0xd43e27C9A7573707484F905bbCE6595ac4cfc319",
  //       chainId: 421614,
  //       decimals: 18,
  //       symbol: "B10",
  //     },
  //   },
  //   wsRpcUrl: "wss://arbitrum-sepolia-rpc.publicnode.com",
  // },
  84532: {
    // Base Sepolia
    rpcUrl: process.env.BASE_SEPOLIA_RPC || "",
    chainId: 84532,
    name: "Base Sepolia",
    bridgeAddress: process.env.BASE_BRIDGE_ADDRESS || "0x08B9191F9dfA2fA43142374ACc45292A45A85737",
    supportedTokens: {
      B10: {
        address: process.env.B10_TOKEN_BASE_SEPOLIA || "",
        chainId: 84532,
        decimals: 18,
        symbol: "B10",
      },
    },
    wsRpcUrl: "wss://base-sepolia-rpc.publicnode.com",
  },
  11155111: {
    // ETH Sepolia
    rpcUrl: "https://eth-sepolia.public.blastapi.io",
    chainId: 11155111,
    name: "ETH Sepolia",
    bridgeAddress: "0xE59875F611690d91511876c983Ae2D077574F0AA",
    supportedTokens: {
      B10: {
        address: process.env.B10_TOKEN_SEPOLIA || "",
        chainId: 11155111,
        decimals: 18,
        symbol: "B10",
      },
    },
    wsRpcUrl: "wss://ethereum-sepolia-rpc.publicnode.com",
  },
};
