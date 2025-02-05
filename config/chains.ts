import { ChainConfig } from "../types";

export const CHAIN_CONFIGS: { [chainId: number]: ChainConfig } = {
    421614: { // Arbitrum Sepolia
        rpcUrl: process.env.ARBITRUM_TESTNET_RPC || '',
        chainId: 421614,
        name: "Arbitrum Sepolia",
        bridgeAddress: process.env.ARBITRUM_BRIDGE_ADDRESS || '',
        supportedTokens: {
            'B10': {
                address: process.env.B10_TOKEN_ARBITRUM || '',
                chainId: 421614,
                decimals: 18,
                symbol: "B10"
            }
            // Add more tokens
        }
    },
    84532: { // Base Sepolia
        rpcUrl: process.env.BASE_TESTNET_RPC || '',
        chainId: 84532,
        name: "Base Sepolia",
        bridgeAddress: process.env.BASE_BRIDGE_ADDRESS || '',
        // bridgeValidatorAddress: process.env.BASE_BRIDGE_VALIDATOR_ADDRESS || '',
        supportedTokens: {
            'B10': {
                address: process.env.B10_TOKEN_BASE || '',
                chainId: 84532,
                decimals: 18,
                symbol: "B10"
            }
            // Add more tokens
        }
    },
    // 31: {
    //     rpcUrl: process.env.ROOTSTOCK_TESTNET_RPC || '',
    //     chainId: 31,
    //     name: "Rootstock Testnet",
    //     bridgeAddress: '0x16D769F63Fe44f4f5590159cECADafaA9A9B8Fde',
    //     // bridgeValidatorAddress: '0xee3DB392af91d48E38f3ee9B6b30CfF4232c2a29'
    //     supportedTokens: {
    //         'B10': {
    //             address: process.env.B10_TOKEN_ROOTSTOCK_TESTNET || '',
    //             chainId: 31,
    //             decimals: 18,
    //             symbol: "B10"
    //         }
    //         // Add more tokens
    //     }
    // },
    // 80002: {
    //     rpcUrl: process.env.ROOTSTOCK_TESTNET_RPC || '',
    //     chainId: 80002,
    //     name: "Rootstock Testnet",
    //     bridgeAddress: '',
    //     bridgeValidatorAddress: ''
    // }
};