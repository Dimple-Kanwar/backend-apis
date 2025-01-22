import { ethers, Signer, Contract, BaseContract } from "ethers";
import { ChainConfig } from "../types";
import { abi as BridgeABI } from "../artifacts/contracts/Bridge.sol/Bridge.json";

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

      const bridgeContract = new Contract(
        config.bridgeAddress,
        BridgeABI,
        provider
      ) as BaseContract;
      this.bridgeContracts.set(Number(chainId), bridgeContract);
    }
  }

  public getProvider(chainId: number): ethers.Provider {
    const provider = this.providers.get(chainId);
    if (!provider) throw new Error(`Provider not found for chain ${chainId}`);
    return provider;
  }

  public getBridgeContract(chainId: number): BaseContract {
    // Return type changed to BaseContract
    const contract = this.bridgeContracts.get(chainId);
    if (!contract)
      throw new Error(`Bridge contract not found for chain ${chainId}`);
    return contract;
  }

  public setSigner(chainId: number, signer: Signer) {
    this.signers.set(chainId, signer);

    const bridgeContract = this.bridgeContracts.get(chainId);
    if (bridgeContract) {
      this.bridgeContracts.set(
        chainId,
        bridgeContract.connect(signer) as BaseContract
      );
    }
  }

  public getSigner(chainId: number): Signer {
    const signer = this.signers.get(chainId);
    if (!signer) throw new Error(`Signer not found for chain ${chainId}`);
    return signer;
  }
}
