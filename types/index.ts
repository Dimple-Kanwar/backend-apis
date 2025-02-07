export interface ChainConfig {
  name: any;
  rpcUrl: string;
  chainId: number;
  bridgeAddress: string;
  supportedTokens: {
    [symbol: string]: TokenConfig;
  };
  wsRpcUrl: string;
}

export interface EventData {
  token: string;
  sender: string;
  amount: string;
  targetChainTxHash: number;
  transactionHash: string;
}

export interface BridgeTransaction {
  id: string;
  sourceChainId: Number;
  targetChainId: Number;
  sourceToken: String;
  targetToken: String;
  amount: String;
  sender: String;
  recipient: String;
  nonce: String;
  sourceTxHash: String;
  targetDataHash: String;
  sourceDataHash: String;
  targetTxHash: String;
  status: TransactionStatus;
  errorMessage: String;
  createdAt: Date;
  updatedAt: Date;
}

export interface TokenConfig {
  symbol: string;
  address: string;
  decimals: number;
  chainId: number;
}

export enum TransactionStatus {
  PENDING = "PENDING",
  LOCKED = "LOCKED",
  RELEASING = "RELEASING",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
}

export interface BridgeTokenInput {
  sourceToken: string;
  targetToken: string;
  sourceChainId: number;
  targetChainId: number;
  amount: string;
  sender: string;
  recipient: string;
}

export interface BridgeResponse {
  success: boolean;
  transactionHash?: string;
  sourceTxHash?: string;
  targetTxHash?: string;
  status: string;
  error?: string;
}
