use crate::errors::CustomError;
// use crate::services::wallet_service::WalletService;
use crate::models::transaction::{Transaction, TransactionStatus};
use chrono::Utc;
use ethers::types::{TransactionRequest, U256};
use ethers::utils;
use uuid::Uuid;

use super::blockchain_service::BlockchainClient;

pub struct TransactionService;

impl TransactionService {

    pub async fn send_transaction(
        &self,
        from_address: &str,
        to_address: &str,
        amount: f64,
        token_address: &str,
        chain_id: u64
    ) -> Result<Transaction, CustomError> {
        let client = BlockchainClient::new(chain_id).await?;
        // Verify sender has sufficient funds
        let native_balance = client.get_native_balance(from_address).await?;
        
        if  native_balance.formatted_balance.parse::<f64>().unwrap()  < amount {
            return Err(CustomError::InsufficientFunds);
        }

        // Create transaction
        let transaction = Transaction {
            id: Uuid::new_v4(),
            from_address: from_address.to_string(),
            to_address: to_address.to_string(),
            amount,
            token_address: token_address.to_string(),
            timestamp: Utc::now(),
            status: TransactionStatus::Pending,
        };

        // craft the transaction
        // it knows to figure out the default gas value and determine the next nonce so no need to explicitly add them unless you want to
        // let tx = TransactionRequest::new()
        // .to(to_address)
        // .value(U256::from(utils::parse_ether(0.01)?));

        //  // send it!
        // let pending_tx = client.send_transaction(tx, None).await?;

        // // get the mined tx
        // let receipt = pending_tx.await?.ok_or_else(|| eyre::format_err!("tx dropped from mempool"))?;
        // let tx = client.get_transaction(receipt.transaction_hash).await?;

        // println!("Sent tx: {}\n", serde_json::to_string(&tx)?);
        // println!("Tx receipt: {}", serde_json::to_string(&receipt)?);

        Ok(transaction)
    }
}