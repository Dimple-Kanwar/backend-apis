use crate::errors::ApiError;
use crate::services::wallet_service::WalletService;
use crate::models::transaction::{Transaction, TransactionStatus};
use chrono::Utc;
use uuid::Uuid;

pub struct TransactionService {
    wallet_service: WalletService,
}

impl TransactionService {
    pub fn new(wallet_service: WalletService) -> Self {
        Self { wallet_service }
    }

    pub async fn create_transaction(
        &self,
        from_address: String,
        to_address: String,
        amount: f64,
        token_address: String,
    ) -> Result<Transaction, ApiError> {
        // Verify sender has sufficient funds
        let sender_wallet = self.wallet_service.get_wallet(&from_address).await?;
        
        if sender_wallet.balance < amount {
            return Err(ApiError::InsufficientFunds);
        }

        // Create transaction
        let transaction = Transaction {
            id: Uuid::new_v4(),
            from_address: from_address,
            to_address,
            amount,
            token_address,
            timestamp: Utc::now(),
            status: TransactionStatus::Pending,
        };

        // In a real implementation, you would:
        // 1. Start a database transaction
        // 2. Update sender and receiver balances
        // 3. Store the transaction
        // 4. Commit the database transaction

        Ok(transaction)
    }

    // pub async fn send_transaction(
    //     &self,
    //     params: TransactionParams,
    // ) -> Result<TransactionReceipt, TransactionError> {
    //     // Build the transaction
    //     let tx = self.build_transaction(&params, true).await?;

    //     // Send transaction and wait for confirmation
    //     let pending_tx = self
    //         .client
    //         .send_transaction(tx, None)
    //         .await
    //         .map_err(|e| TransactionError::TransactionError(e.to_string()))?;

    //     // Wait for transaction to be mined
    //     let receipt = pending_tx
    //         .await
    //         .map_err(|e| TransactionError::TransactionError(e.to_string()))?
    //         .ok_or_else(|| TransactionError::TransactionError("Transaction failed".into()))?;

    //     Ok(receipt)
    // }
}