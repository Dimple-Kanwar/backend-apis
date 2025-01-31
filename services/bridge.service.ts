import { Addressable, AddressLike, Contract, ethers, Wallet } from "ethers";
import { ChainService } from "./chain.service";
import { TransactionService } from "./transaction.service";
import { CHAIN_CONFIGS } from "../config/chains";
import { EventListener } from "./events.service";
import { Relayer } from "./relayer.service";
import { Validator } from "./validator.service";
import { BridgeRequest } from "../interfaces/requests";
import { send } from "process";
import { generateLockHash, generateNonce } from "../utils/common";

export class BridgeService {
  private chainService: ChainService;
  private transactionService: TransactionService;
  private eventListener: EventListener;
  private validator: Validator;
  private relayer: Relayer;

  constructor() {
    this.chainService = new ChainService(CHAIN_CONFIGS);
    this.transactionService = new TransactionService();
    this.eventListener = new EventListener(this.chainService, CHAIN_CONFIGS);
    this.validator = new Validator(process.env.VALIDATOR_PRIVATE_KEY!);
    this.relayer = new Relayer(
      this.chainService,
      this.validator,
      process.env.RELAYER_PRIVATE_KEY!
    );
  }

  async lockToken({ sourceChainId,
    targetChainId,
    token,
    amount,
    sender,
    recipient }: BridgeRequest) {
    const transaction = await this.transactionService.createTransaction({
      sourceChainId,
      targetChainId,
      token,
      amount,
      sender,
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
    const nonce = await generateNonce(sender);
    const targetChainTxHash = await generateLockHash(token, sender, recipient, ethers.parseEther(amount), nonce, sourceChainId, targetChainId);
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
    return {
      transactionHash: tx.hash,
      transactionId: transaction.id,
    };
  }

  async releaseToken(sourceChainId: number, targetChainId: number, wallet: Wallet, token: string, recipient: AddressLike, amount: number, signature: string) {
    // Get target chain contract
    const targetContract = this.chainService.getBridgeContract(targetChainId);
    const connectedContract = targetContract.connect(wallet) as Contract;

    // Submit release transaction
    const tx = await connectedContract.releaseToken(
      token,
      recipient,
      amount,
      // eventData.nonce,
      sourceChainId,
      signature
    );

    await tx.wait();
    console.log(`Tokens released on chain ${targetChainId}. Tx: ${tx.hash}`);

    return {
      hash: tx.hash,


    }
  }

  async getTransaction(id: string) {
    return this.transactionService.getTransaction(id);
  }

  async getTransactions(address: string, status?: string) {
    return this.transactionService.getTransactions(address, status);
  }
}
