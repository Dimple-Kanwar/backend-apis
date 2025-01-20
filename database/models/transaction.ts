import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema({
  sourceChainId: Number,
  targetChainId: Number,
  token: String,
  amount: String,
  sender: String,
  recipient: String,
  nonce: String,
  sourceTxHash: String,
  targetTxHash: String,
  status: {
    type: String,
    enum: ['PENDING', 'COMPLETED', 'FAILED'],
    default: 'PENDING'
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

export const Transaction = mongoose.model('Transaction', transactionSchema);