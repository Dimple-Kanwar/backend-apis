import { BridgeRequest, Token } from "../interfaces/requests";
import { getBridgeContract, getProvider } from "../utils/bridgeUtils";
import { fetchCoinMarketData } from "./price.service"

// 1 btc to eth
export const bridgeTokens = async(bridgeRequest: BridgeRequest) => {
    //get exchange rate for ETH to wETH
    // lock btc in bitcoin network
    // connect to source chain
    
    
    // connect to bridge contract on source chain
    
    // listen for lock event
    // unlock eth in ethereum network
    // listen for unlock event
    //bridge complete
}

export const lockToken = async (sourceToken:Token, destinaionToken: Token) => {
    const sourceProvider = await getProvider(sourceToken.chainId);
    const sourceBridgeContract = await getBridgeContract(sourceToken.chainId);
    const tx = await sourceBridgeContract.lockToken(sourceToken.token, sourceToken.amount, destinaionToken.chainId, destinaionToken.account);
    const receipt = await tx.wait();
    return tx.hash;
}

export const releaseToken = async (sourceToken:Token, destinaionToken: Token) => {
    const destinationProvider = await getProvider(destinaionToken.chainId);
    const destinationBridgeContract = await getBridgeContract(sourceToken.chainId);
    const tx = await destinationBridgeContract.lockToken(sourceToken.token, sourceToken.amount, destinaionToken.chainId, destinaionToken.account);
    const receipt = await tx.wait();
    return tx.hash;
}