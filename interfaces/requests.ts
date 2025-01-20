import { AddressLike, BigNumberish } from "ethers";

export interface Token {
    amount: BigNumberish,
    token: AddressLike,
    account: string,
    chainId: number
}

export interface BridgeRequest {
    sourceToken: Token
    destinaionToken: Token
}