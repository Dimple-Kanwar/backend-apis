use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct NetworkStatus {
    pub chain_id: u64,
    pub name: String,
    pub latest_block: u64,
    pub gas_price: u64,
    pub symbol: String,
    pub block_explorer: String,
}
