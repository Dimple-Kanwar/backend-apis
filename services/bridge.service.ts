import { Contract, ethers, Wallet } from "ethers";
import { ChainService } from "./chain.service";
import { TransactionService } from "./transaction.service";
import { CHAIN_CONFIGS } from "../config/chains";
import { BridgeRequest } from "../interfaces/requests";
import { generateLockHash, generateNonce, generateReleaseHash } from "../utils/common";
import { EventListener } from "./events.service";
import { TokenService } from "./token.service";
import { BridgeTransaction, TransactionStatus } from "../types";
import { pubsub } from "./pubsub.service";
export class BridgeService {
  private eventListener: EventListener;
  private chainService: ChainService;
  private transactionService: TransactionService;
  private tokenService: TokenService;

  constructor() {
    this.chainService = new ChainService(CHAIN_CONFIGS);
    console.log({chainService: this.chainService});
    this.transactionService = new TransactionService();
    console.log({transactionService: this.transactionService});
    this.tokenService = new TokenService(CHAIN_CONFIGS);
    console.log({tokenService: this.tokenService});
    this.eventListener = new EventListener(this.chainService, this, CHAIN_CONFIGS, this.transactionService);
    console.log({eventListener: this.eventListener});
    this.initializeEventListener();
  }

  private async initializeEventListener() {
    console.log('Bridge event listener initializing..');
    await this.eventListener.TokenLockEventListener();
    console.log('Bridge event listener initialized');
  }

  async executeTokenOperation({ sourceChainId,
    targetChainId,
    token,
    amount,
    sender,
    recipient }: BridgeRequest) {
    try {
      const nonce = await generateNonce(sender);
      const targetChainTxHash = await generateLockHash(token, sender, recipient, ethers.parseEther(amount), nonce, sourceChainId, targetChainId);
      const transaction = await this.transactionService.createTransaction({
        sourceChainId,
        targetChainId,
        sourceToken: token,
        amount: ethers.parseEther(amount),
        sender,
        sourceDataHash: targetChainTxHash,
        recipient,
        status: "PENDING",
      });

      const sourceBridge = this.chainService.getBridgeContract(
        sourceChainId
      ) as Contract;

      console.log({ sourceBridge });
      const signer = this.chainService.getSigner(sourceChainId);
      console.log({ signer });
      const tokenContract = new ethers.Contract(
        token,
        ["function allowance(address owner, address spender) returns (uint256)"],
        signer
      );
      console.log({ tokenContract });
      const allowanceTx = await tokenContract.allowance(sender, sourceBridge.target);
      console.log({ allowanceTx });
      await allowanceTx.wait();
      console.log({
        token,
        amount: ethers.parseEther(amount),
        sender,
        targetChainTxHash,
        isLock: true
      });
      const tx = await sourceBridge.executeTokenOperation(
        token,
        ethers.parseEther(amount),
        sender,
        targetChainTxHash,
        true
      );
      console.log({ tx });
      await tx.wait();
      console.log({ transaction });
      await this.transactionService.updateTransaction(
        transaction.id,
        {
          "status": TransactionStatus.LOCKED,
          "sourceTxHash": tx.hash
        });

      return {
        sourceTxHash: tx.hash,
        ...transaction
      };
    } catch (error: any) {
      console.error('Lock tokens error:', error);
      return { success: false, error: error.message };
    }
  }

  async handleTokenRelease({
    sourceToken,
    sender,
    amount,
    targetChainTxHash,
    sourceTxHash,
    isNativeToken }: {
      sourceToken: string,
      sender: string,
      amount: ethers.BigNumberish,
      targetChainTxHash: string,
      sourceTxHash: string,
      isNativeToken: boolean
    }
  ) {
    try {
      // Find transaction record
      let transactions = await this.transactionService.getTransactionByHash(sourceTxHash);
      console.log({transactions});
      const transaction = transactions[0];
      // Get target chain token mapping
      const targetToken = await this.tokenService.getTargetTokenAddress(
        sourceToken,
        transaction.sourceChainId!,
        transaction.targetChainId!
      );

      const nonce = await generateNonce(transaction.recipient!);
      const sourceChainTxHash = await generateReleaseHash(targetToken, sender, transaction.recipient!, amount, nonce, sourceTxHash, transaction.sourceChainId!, transaction.targetChainId!);

      // if (!transaction) {
      //   transaction = await this.transactionService.createTransaction({
      //     sourceChainId,
      //     targetChainId,
      //     sourceToken,
      //     targetToken,
      //     amount,
      //     sender,
      //     recipient,
      //     nonce,
      //     sourceDataHash: sourceChainTxHash,
      //     sourceTxHash,
      //     status: TransactionStatus.LOCKED,
      //     createdAt: Date.now(),
      //     updatedAt: Date.now()
      //   });
      // }

      // // Update status to releasing
      await this.transactionService.updateTransaction(transaction.id, {
        status: TransactionStatus.RELEASING
      });


      // Release tokens on target chain
      const signer = this.chainService.getSigner(transaction.targetChainId!);
      const targetContract = this.chainService.getBridgeContract(transaction.targetChainId!);
      const targetChainBridge = targetContract.connect(signer) as Contract;

      const releaseTx = await targetChainBridge.executeTokenOperation(
        targetToken,
        amount,
        transaction.recipient,
        sourceChainTxHash,
        false
      );
      const receipt = await releaseTx.wait();
      // Update transaction status
      await this.transactionService.updateTransaction(transaction.id, {
        targetTxHash: releaseTx.hash,
        status: TransactionStatus.COMPLETED
      });

      // Emit event
      pubsub.publish(`TRANSACTION_COMPLETED_${transaction.recipient!.toLowerCase()}`, {
        transactionCompleted: {
          ...transaction,
          targetTxHash: releaseTx.hash,
          status: TransactionStatus.COMPLETED
        }
      });
      console.log(`Tokens released on chain ${transaction.targetChainId}. Tx: ${releaseTx.hash}`);

      return {
        hash: releaseTx.hash,
        ...transaction
      }
    } catch (error: any) {
      console.error('Release tokens error:', error);
      let transaction = await this.transactionService.getTransactionByHash(sourceTxHash);
      if (transaction) {
        await this.transactionService.updateTransaction(transaction[0].id, {
          status: TransactionStatus.FAILED,
          errorMessage: error.message
        });
      }
      throw error;
    }
  }

  async getTransaction(id: string) {
    return this.transactionService.getTransaction(id);
  }

  async getTransactions(address: string, status?: string) {
    return this.transactionService.getTransactions(address, status);
  }
}
