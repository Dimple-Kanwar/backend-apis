import { ethers, Signer, Contract, BaseContract } from "ethers";
import { ChainConfig } from "../types";
import { abi as BridgeABI } from "../artifacts/contracts/Bridge.sol/Bridge.json";
import { CHAIN_CONFIGS } from '../config/chains';
import { GasService } from "./gas.service";
import { Bridge__factory } from "../typechain-types";
import { Chain } from "../interfaces/responses";

export class ChainService {

  private providers: Map<number, ethers.Provider> = new Map();
  private bridgeContracts: Map<number, BaseContract> = new Map();
  private signers: Map<number, Signer> = new Map();

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

  public getBridgeContract(chainId: number) {
    // Return type changed to BaseContract
    const contract = this.bridgeContracts.get(chainId);
    if (!contract)
      throw new Error(`Bridge contract not found for chain ${chainId}`);
    return contract;
  }

  public setSigner(chainId: number, signer: Signer) {
    this.signers.set(chainId, signer);

    let bridgeContract = this.bridgeContracts.get(chainId);
    if (!bridgeContract) {
      throw new Error(`BridgeContract not found for the chainId: ${chainId}`)
    }
    bridgeContract = bridgeContract.connect(signer);
    if (bridgeContract) {
      this.bridgeContracts.set(
        chainId,
        bridgeContract
      );
    }
  }

  public getGasService(chainId: number): GasService {
    const provider = this.getProvider(chainId);
    const gasService = new GasService(provider);
    return gasService;
  }

  // Additional methods for queries and transaction management
  async getSupportedChains(): Promise<Chain[]> {
    return Object.entries(CHAIN_CONFIGS).map(([chainId, config]) => ({
      id: parseInt(chainId),
      name: config.name
    }));
  }

  public getSigner(chainId: number): Signer {
    const signer = this.signers.get(chainId);
    if (!signer) throw new Error(`Signer not found for chain ${chainId}`);
    return signer;
  }
}
