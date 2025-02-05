import { ethers } from "ethers";
import { CHAIN_CONFIGS } from "../config/chains";
import { ChainConfig, EventData } from "../types";
import { ChainService } from "./chain.service";
import { TransactionService } from "./transaction.service";
import { pubsub } from "./pubsub.service";
import { BridgeService } from "./bridge.service";

export class EventListener {
    constructor(
        private chainService: ChainService,
        private bridgeService: BridgeService,
        private configs: { [chainId: number]: ChainConfig },
        private transactionService: TransactionService
    ) { }

    public async TokenLockEventListener() {
        console.log("starting lock token event listener..");

        for (const [chainId, config] of Object.entries(this.configs)) {
            const bridgeContract = this.chainService.getBridgeContract(Number(chainId));
            // Listen for TokensLocked events
            bridgeContract.on(
                bridgeContract.filters.TokensLocked,
                async (token, sender, amount, targetChainTxHash, event) => {
                    try {
                        console.log(`TokenLocked event detected on chain ${chainId}`);

                        // Handle the token release on target chain
                        await this.processTokenLockEvent({
                            sourceToken: token, sender, amount, targetChainTxHash, sourceTxHash: event.transactionHash, isNativeToken: false
                        });
                    } catch (error: any) {
                        console.error('Error processing TokenLocked event:', error);
                        // Emit error event for monitoring
                        pubsub.publish('BRIDGE_ERROR', {
                            error: error.message,
                            transactionHash: event.transactionHash
                        });
                    }

                }
            );
            // Listen for NativeTokenLocked events
            bridgeContract.on(
                bridgeContract.filters.NativeTokenLocked,
                async (sender, amount, targetChainTxHash, event) => {
                    return await this.processTokenLockEvent({
                        sourceToken: ethers.ZeroAddress,
                        sender,
                        amount,
                        targetChainTxHash,
                        sourceTxHash: event.transactionHash,
                        isNativeToken: true
                    });
                }
            );
            console.log("Bridge event listener started");
        }
    }

    private async processTokenLockEvent(
        {
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
            }) {
        try {
            // Check if transaction already processed
            const txProcessed = await this.checkTransactionProcessed(targetChainTxHash, "LOCKED");
            if (txProcessed) return;

            // Validate transaction details with backend
            // const validationResponse = await this.validateTransactionWithBackend({
            //     token,
            //     from,
            //     amount: amount.toString(),
            //     targetChainTxHash
            // });

            // if (!validationResponse.valid) {
            //     console.error('Transaction validation failed');
            //     return;
            // }


            // Prepare release transaction parameters
            const releaseParams = {
                sourceToken,
                sender,
                amount,
                targetChainTxHash,
                sourceTxHash,
                isNativeToken
            };

            // Handle the token release on target chain
            await this.bridgeService.handleTokenRelease(releaseParams);
        } catch (error: any) {
            console.error('Error processing TokenLocked event:', error);
            // Emit error event for monitoring
            pubsub.publish('BRIDGE_ERROR', {
                error: error.message,
                transactionHash: sourceTxHash
            });
        }
    }

    // private async executeMultiSigTransaction(params: any[]) {
    //     const txHash = ethers.keccak256(
    //         ethers.utils.defaultAbiCoder.encode(
    //             ['address', 'address', 'uint256', 'bytes32', 'bool'],
    //             params
    //         )
    //     );

    //     // Collect signatures from validators
    //     const signatures = await Promise.all(
    //         this.signers.map(async (signer) => ({
    //             signer: signer.address,
    //             signature: await signer.signMessage(
    //                 ethers.utils.arrayify(txHash)
    //             )
    //         }))
    //     );

    //     // Select first two signatures (configurable)
    //     const selectedSignatures = signatures.slice(0, 2);

    //     // Submit transaction to target chain
    //     const txResponse = await this.targetBridgeContract
    //         .connect(this.signers[0])
    //         .executeTokenOperation(...params);

    //     return txResponse;
    // }

    private async checkTransactionProcessed(txHash: string, status: string): Promise<boolean> {
        // Check backend if transaction already processed
        const response = await this.transactionService.getTransactionByHash(txHash, status);
        if (!response) return false;
        return true;
    }

    // private async validateTransactionWithBackend(txData: any) {
    //     // Validate transaction details with backend
    //     const response = await axios.post('/api/validate-transaction', txData);
    //     return response.data;
    // }

}
