import { ethers } from 'ethers';

export class GasService {
    private cachedGasPrice: bigint | null = null;
    private lastGasUpdate: number = 0;
    private readonly CACHE_DURATION = 30000; // 30 seconds

    constructor(private provider: ethers.Provider) { }
    async getOptimizedGasPrice(provider: ethers.Provider, chainId: number): Promise<bigint | null> {
        // Default gas price strategy for other chains
        const gasPrice = await provider.getFeeData();
        return gasPrice.maxFeePerGas || gasPrice.gasPrice;
    }
    async getGasPrice(): Promise<bigint | null> {
        if (Date.now() - this.lastGasUpdate < this.CACHE_DURATION && this.cachedGasPrice) {
            return this.cachedGasPrice;
        }
        try {
            const feeData = await this.provider.getFeeData();
            this.cachedGasPrice = feeData.gasPrice!;
            this.lastGasUpdate = Date.now();
            return this.cachedGasPrice;
        } catch (error) {
            // Fallback to provider's gas estimation
            const gasPrice = await this.provider.getFeeData();
            return gasPrice.maxFeePerGas! || gasPrice.gasPrice!;
        }
    }
    async estimateGasLimit(
        contract: any,
        method: string,
        args: any[]
    ){
        try {
            const gasEstimate = await contract.estimateGas[method](...args);
            // Add 20% buffer for safety
            return gasEstimate.mul(120).div(100);
        } catch (error) {
            console.error('Gas estimation error:', error);
            throw new Error(`Failed to estimate gas for ${method}`);
        }
    }
}