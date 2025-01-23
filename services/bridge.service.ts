import { Addressable, AddressLike, Contract, ethers } from "ethers";
import { ChainService } from "./chain.service";
import { TransactionService } from "./transaction.service";
import { CHAIN_CONFIGS } from "../config/chains";
import { EventListener } from "./events.service";
import { Relayer } from "./relayer.service";
import { Validator } from "./validator.service";
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

  async lockToken({
    sourceChainId,
    targetChainId,
    token,
    amount,
    recipient,
  }: {
    sourceChainId: number;
    targetChainId: number;
    token: Addressable;
    amount: number;
    recipient: AddressLike;
  }) {
    const transaction = await this.transactionService.createTransaction({
      sourceChainId,
      targetChainId,
      token,
      amount,
      sender: await this.chainService.getSigner(sourceChainId).getAddress(),
      recipient,
      status: "PENDING",
    });

    const sourceBridge = this.chainService.getBridgeContract(
      sourceChainId
    ) as Contract;

    const lockTokenPromise = new Promise((resolve, reject) => {
      sourceBridge.once(
        "TokenLocked",
        async (
          token,
          sender,
          amount,
          recipient,
          sourceChainId,
          destinationChainId,
          event
        ) => {
          try {
            await this.relayer.processEvent({
              token,
              sender,
              recipient,
              amount: amount.toString(),
              sourceChainId: Number(sourceChainId),
              targetChainId: Number(destinationChainId),
              transactionHash: event.transactionHash,
            });
            resolve(event);
          } catch (error) {
            reject(error);
          }
        }
      );
    });

    const tokenContract = new ethers.Contract(
      token,
      ["function approve(address spender, uint256 amount) returns (bool)"],
      this.chainService.getSigner(sourceChainId)
    );

    const approveTx = await tokenContract.approve(sourceBridge.target, amount);
    await approveTx.wait();

    const tx = await sourceBridge.lockTokens(
      token,
      amount,
      targetChainId,
      recipient
    );
    await tx.wait();

    await lockTokenPromise;

    return {
      transactionHash: tx.hash,
      transactionId: transaction.id,
    };
  }

  async getTransaction(id: string) {
    return this.transactionService.getTransaction(id);
  }

  async getTransactions(address: string, status?: string) {
    return this.transactionService.getTransactions(address, status);
  }
}
