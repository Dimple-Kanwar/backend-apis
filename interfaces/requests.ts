import { Addressable, AddressLike, BigNumberish } from "ethers";

export interface Token {
    amount: number,
    token: Addressable,
    account: string,
    chainId: number
}

export interface BridgeRequest {
    sourceToken: Token
    destinaionToken: Token
}