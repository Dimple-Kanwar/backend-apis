use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug)]
pub struct TransferRequest {
    pub from_address: String,
    pub to_address: String,
    pub amount: f64,
    // pub chain_id: u64
}
