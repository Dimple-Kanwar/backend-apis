import { Transaction } from '../database/models/transaction';
import { pubsub } from './pubsub.service';

export class TransactionService {
    
    async createTransaction(data: any) {
        const transaction = new Transaction(data);
        await transaction.save();

        // pubsub.publish(`TRANSACTION_UPDATED_${data.sender.toLowerCase()}`, {
        //     bridgeTransactionUpdated: transaction
        // });

        return transaction;
    }

    async updateTransaction(id: string, data: any) {
        const transaction = await Transaction.findByIdAndUpdate(id, data, { new: true });

        if (transaction) {
            pubsub.publish(`TRANSACTION_UPDATED_${transaction.sender?.toLowerCase()}`, {
                bridgeTransactionUpdated: transaction
            });
        }

        return transaction;
    }

    async getTransaction(id: string) {
        return Transaction.findById(id);
    }

    async getTransactions(address: string, status?: string) {
        const query: any = {
            $or: [{ sender: address }, { recipient: address }]
        };

        if (status) {
            query.status = status;
        }

        return Transaction.find(query).sort({ createdAt: -1 });
    }

    async getTransactionByHash(hash: String, status?: string) {
        const query: any = {
            $or: [{ targetChainTxHash: hash }, { sourceChainTxHash: hash }]
        };

        if (status) {
            query.status = status;
        }

        return Transaction.find(query).sort({ createdAt: -1 });
    }
}
