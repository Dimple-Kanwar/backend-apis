use ethers::types::U256;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct TokenBalance {
    pub token_address: Option<String>,  // None for native token
    pub symbol: String,
    pub balance: U256,
    pub decimals: u8,
    pub formatted_balance: String,
}
