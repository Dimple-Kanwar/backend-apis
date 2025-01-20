export interface ChainConfig {
    name: any;
    rpcUrl: string;
    chainId: number;
    bridgeAddress: string;
    // supportedTokens: {
    //     [tokenSymbol: string]: string; // token address
    // };
}

export interface EventData {
    token: string;
    sender: string;
    recipient: string;
    amount: string;
    // nonce: string;
    sourceChainId: number;
    targetChainId: number;
    transactionHash: string;
}

export interface BridgeTransaction {
    id: string;
    sourceChainId: number;
    targetChainId: number;
    token: string;
    amount: string;
    sender: string;
    recipient: string;
    nonce: string;
    sourceTxHash?: string;
    targetTxHash?: string;
    status: 'PENDING' | 'COMPLETED' | 'FAILED';
    createdAt: Date;
    updatedAt: Date;
  }
  