import { ethers } from "ethers";
import { CHAIN_CONFIGS } from "../config/chains";
import {abi} from "../artifacts/contracts/Bridge.sol/Bridge.json";
export const getProvider = async (_chainId: number) => {
    let provider;
    let bridgeAddress;
    for (const [chainId, config] of Object.entries(CHAIN_CONFIGS)) {
        console.log({ chainId, config });
        if (Number(chainId) == _chainId) {
            provider = new ethers.JsonRpcProvider(config.rpcUrl);
            bridgeAddress = config.bridgeAddress;
        }
    }
    return { provider, bridgeAddress };
}

export const getBridgeContract = async (chainId: number) => {
    const { provider, bridgeAddress } = await getProvider(chainId);
    const bridgeContract = new ethers.Contract(
        bridgeAddress!,
        abi,
        provider
    );
    return bridgeContract;
}