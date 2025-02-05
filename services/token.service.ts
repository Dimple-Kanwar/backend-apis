import { ethers } from 'ethers';
import { TokenConfig } from '../types';
import { abi as ERC20_ABI } from "../artifacts/contracts/MockERC20Token.sol/MockERC20Token.json";
import { ChainConfig } from '../types';

export class TokenService {
    private tokenMappings: Map<string, Map<number, string>>;

    constructor(private chainConfigs: { [chainId: number]: ChainConfig }) {
        this.tokenMappings = new Map();
        this.initializeTokenMappings(chainConfigs);
    }

    // to be fixed
    private initializeTokenMappings(chainConfigs: { [chainId: number]: ChainConfig}) {
        // Initialize token mappings across chains
        // Example: BTC -> WBTC mapping for different chains
        for (const [chainId, config] of Object.entries(chainConfigs)) {
            const tokens = Object.entries(config.supportedTokens).map(([symbol, address]) => ({
                address,
                symbol,
                chainId
            }));
            this.tokenMappings.set('BTC', new Map([
                [1, '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599'], // WBTC on Ethereum
                [42161, '0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f'] // WBTC on Arbitrum
            ]));
        }

    }

    getTokenContract(tokenAddress: string, signer: ethers.Signer): ethers.Contract {
        return new ethers.Contract(tokenAddress, ERC20_ABI, signer);
    }

    async isTokenSupported(tokenAddress: string, chainId: number): Promise<boolean> {
        const chainConfig = this.chainConfigs[chainId];
        return Object.values(chainConfig.supportedTokens)
            .some(token => token.address.toLowerCase() === tokenAddress.toLowerCase());
    }

    async getTargetTokenAddress(
        sourceToken: string,
        sourceChainId: number,
        targetChainId: number
    ): Promise<string> {
        const tokenSymbol = await this.getTokenSymbol(sourceToken, sourceChainId);
        const targetMapping = this.tokenMappings.get(tokenSymbol);

        if (!targetMapping || !targetMapping.has(targetChainId)) {
            throw new Error(`No token mapping found for ${tokenSymbol} on chain ${targetChainId}`);
        }

        return targetMapping.get(targetChainId)!;
    }

    private async getTokenSymbol(tokenAddress: string, chainId: number): Promise<string> {
        const chainConfig = this.chainConfigs[chainId];
        const tokenConfig = Object.values(chainConfig.supportedTokens)
            .find(token => token.address.toLowerCase() === tokenAddress.toLowerCase());

        if (!tokenConfig) {
            throw new Error('Token not found');
        }

        return tokenConfig.symbol;
    }
}