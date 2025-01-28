import { Addressable, AddressLike, BigNumberish } from "ethers";

export interface Token {
    amount: number,
    token: Addressable,
    account: string,
    chainId: number
}

export interface BridgeRequest {
    token: string
    sourceChainId: number
    targetChainId: number
    amount: String,
    sender: String
    recipient: String
}