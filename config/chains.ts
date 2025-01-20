export interface ChainConfig {
    rpcUrl: string;
    chainId: number;
    bridgeAddress: string;
    // supportedTokens: {
    //     [tokenSymbol: string]: string; // token address
    // };
}

export const CHAIN_CONFIGS: { [chainId: number]: ChainConfig } = {
    421614: { // Arbitrum Sepolia
        rpcUrl: process.env.ARBITRUM_TESTNET_RPC || '',
        chainId: 421614,
        bridgeAddress: process.env.ARBITRUM_BRIDGE_ADDRESS || '',
        // supportedTokens: {
        //     'USDC': process.env.ARBITRUM_USDC_ADDRESS || '',
        //     // Add more tokens
        // }
    },
    84532: { // Base Sepolia
        rpcUrl: process.env.BASE_TESTNET_RPC || '',
        chainId: 84532,
        bridgeAddress: process.env.BASE_BRIDGE_ADDRESS || '',
        // supportedTokens: {
        //     'USDC': process.env.BASE_USDC_ADDRESS || '',
        //     // Add more tokens
        // }
    }
};