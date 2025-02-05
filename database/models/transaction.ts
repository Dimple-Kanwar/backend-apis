import mongoose from 'mongoose';
import { TransactionStatus } from '../../types';

const transactionSchema = new mongoose.Schema({
  sourceChainId: Number,
  targetChainId: Number,
  sourceToken: String,
  targetToken: String,
  amount: String,
  sender: String,
  recipient: String,
  nonce: String,
  sourceTxHash: String,
  targetDataHash: String,
  sourceDataHash: String,
  targetTxHash: String,
  status: {
    type: String,
    enum: TransactionStatus,
    default: 'PENDING'
  },
  errorMessage: String,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

export const Transaction = mongoose.model('Transaction', transactionSchema);