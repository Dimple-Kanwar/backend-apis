use chrono::{DateTime, Utc};
use ethers::core::k256::U256;
use serde::{Deserialize, Serialize};
use uuid::Uuid;
#[derive(Debug, Serialize, Deserialize)]
pub struct Transaction {
    pub id: Uuid,
    pub from_address: String,
    pub to_address: String,
    pub amount: f64,
    pub token_address: String,
    pub timestamp: DateTime<Utc>,
    pub status: TransactionStatus,
}

#[derive(Debug, Serialize, Deserialize)]
pub enum TransactionStatus {
    Pending,
    Completed,
    Failed,
}


#[derive(Deserialize)]
pub struct TransactionRequest {
    pub from_address: String,
    pub token_address: String,
    pub to_address: String,
    pub amount: u64,
    pub chain_id: u64
}
