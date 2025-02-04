import { CHAIN_CONFIGS } from "../config/chains";
import { ChainConfig, EventData } from "../types";
import { ChainService } from "./chain.service";

export class EventListener {
  constructor(
    private chainService: ChainService,
    private configs: { [chainId: number]: ChainConfig }
  ) {}

  public async TokenLockEventListener(
    callback: (event: EventData) => Promise<void>
  ) {
    for (const [chainId, config] of Object.entries(this.configs)) {
      const bridgeContract = this.chainService.getBridgeContract(
        Number(chainId)
      );

      bridgeContract.on(
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
          console.log("Received Locked Token event...");
          const eventData: EventData = {
            token,
            sender,
            recipient,
            amount: amount.toString(),
            // nonce: nonce.toString(),
            sourceChainId: Number(sourceChainId),
            targetChainId: Number(destinationChainId),
            transactionHash: event.transactionHash,
          };
          await callback(eventData);
        }
      );
    }
  }
  public async TokenReleaseEventListener(
    callback: (event: EventData) => Promise<void>
  ) {
    for (const [chainId, config] of Object.entries(this.configs)) {
      const bridgeContract = this.chainService.getBridgeContract(
        Number(chainId)
      );

      bridgeContract.on(
        "TokensReleased",
        async (token, recipient, amount, sourceChainTxHash, event) => {
          console.log("Received Token Release event...");
          const eventData: EventData = {
            token,
            recipient,
            amount: amount.toString(),
            transactionHash: event.transactionHash,
            sourceChainId: Number(chainId),
            targetChainId: 0,
            sender: "",
            // sourceTxHash: sourceChainTxHash
          };
          await callback(eventData);
        }
      );
    }
  }
}
