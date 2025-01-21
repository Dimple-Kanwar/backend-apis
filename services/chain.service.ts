import { ethers, Signer } from 'ethers';
import { ChainConfig } from '../types';
import { abi as BridgeABI } from '../artifacts/contracts/Bridge.sol/Bridge.json';

export class ChainService {
  
  private providers: Map<number, ethers.Provider> = new Map();
  private bridgeContracts: Map<number, ethers.Contract> = new Map();

  constructor(private configs: { [chainId: number]: ChainConfig }) {
    this.initializeProviders();
  }

  private initializeProviders() {
    for (const [chainId, config] of Object.entries(this.configs)) {
      const provider = new ethers.JsonRpcProvider(config.rpcUrl);
      this.providers.set(Number(chainId), provider);

      const bridgeContract = new ethers.Contract(
        config.bridgeAddress,
        BridgeABI,
        provider
      );
      this.bridgeContracts.set(Number(chainId), bridgeContract);
    }
  }

  public getProvider(chainId: number): ethers.Provider {
    const provider = this.providers.get(chainId);
    if (!provider) throw new Error(`Provider not found for chain ${chainId}`);
    return provider;
  }

  public getBridgeContract(chainId: number): ethers.Contract {
    const contract = this.bridgeContracts.get(chainId);
    if (!contract) throw new Error(`Bridge contract not found for chain ${chainId}`);
    return contract;
  }

  // TO DO
  getSigner(chainId: number) {
    
  }
}