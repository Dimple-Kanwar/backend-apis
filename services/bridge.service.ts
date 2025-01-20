import { Addressable, AddressLike, ethers } from 'ethers';
import { ChainService } from './chain.service';
import { TransactionService } from './transaction.service';
import { CHAIN_CONFIGS } from '../config/chains';
import { BridgeRequest } from '../interfaces/requests';

export class BridgeService {
    private chainService: ChainService;
    private transactionService: TransactionService;

    constructor() {
        this.chainService = new ChainService(CHAIN_CONFIGS);
        this.transactionService = new TransactionService();
    }

    async lockToken({
        sourceChainId,
        targetChainId,
        token,
        amount,
        recipient
    }: {
        sourceChainId: number,
        targetChainId: number,
        token: Addressable,
        amount: number,
        recipient: AddressLike
    }) {
        const bridgeContract = this.chainService.getBridgeContract(sourceChainId);
        const signer = this.chainService.getSigner(sourceChainId);
        const tokenContract = new ethers.Contract(
            token,
            ['function approve(address spender, uint256 amount) returns (bool)']
        );

        // Approve bridge contract
        const approveTx = await tokenContract.approve(bridgeContract.address, amount);
        await approveTx.wait();

        // Lock tokens
        const tx = await bridgeContract.lockTokens(
            token,
            amount,
            targetChainId,
            recipient
        );
        const receipt = await tx.wait();


        // Create transaction record
        await this.transactionService.createTransaction({
            sourceChainId,
            targetChainId,
            token,
            amount,
            sender: signer, //await signer.getAddress(),
            recipient,
            sourceTxHash: tx.hash,
            status: 'PENDING'
        });

        return { transactionHash: tx.hash };
    }

    // Additional methods for queries and transaction management
    //   async getSupportedChains() {
    //     return Object.entries(CHAIN_CONFIGS).map(([chainId, config]) => ({
    //       id: parseInt(chainId),
    //       name: config.name,
    //       supportedTokens: Object.entries(config.supportedTokens).map(([symbol, address]) => ({
    //         address,
    //         symbol,
    //         chainId: parseInt(chainId)
    //       }))
    //     }));
    //   }

    //   async getSupportedTokens(chainId: number) {
    //     const config = CHAIN_CONFIGS[chainId];
    //     if (!config) throw new Error('Unsupported chain');

    //     return Object.entries(config.supportedTokens).map(([symbol, address]) => ({
    //       address,
    //       symbol,
    //       chainId
    //     }));
    //   }

    async getTransaction(id: string) {
        return this.transactionService.getTransaction(id);
    }

    async getTransactions(address: string, status?: string) {
        return this.transactionService.getTransactions(address, status);
    }
}