

use crate::{errors::CustomError, models::network_config::NetworkConfig};


/// Get network configuration based on chain ID
pub fn get_network_config(chain_id: u64) -> Result<NetworkConfig, CustomError> {
    match chain_id {
        1 => Ok(NetworkConfig {
            chain_id: 1,
            name: "Ethereum Mainnet".to_string(),
            rpc_url: "https://eth-mainnet.g.alchemy.com/v2/YOUR-API-KEY".to_string(),
            symbol: "ETH".to_string(),
            block_explorer: "https://etherscan.io".to_string(),
        }),
        137 => Ok(NetworkConfig {
            chain_id: 137,
            name: "Polygon Mainnet".to_string(),
            rpc_url: "https://polygon-rpc.com".to_string(),
            symbol: "MATIC".to_string(),
            block_explorer: "https://polygonscan.com".to_string(),
        }),
        56 => Ok(NetworkConfig {
            chain_id: 56,
            name: "BNB Smart Chain".to_string(),
            rpc_url: "https://bsc-dataseed.binance.org".to_string(),
            symbol: "BNB".to_string(),
            block_explorer: "https://bscscan.com".to_string(),
        }),
        // Add more networks as needed
        5 => Ok(NetworkConfig {
            chain_id: 5,
            name: "Goerli Testnet".to_string(),
            rpc_url: "https://eth-goerli.g.alchemy.com/v2/YOUR-API-KEY".to_string(),
            symbol: "ETH".to_string(),
            block_explorer: "https://goerli.etherscan.io".to_string(),
        }),
        80084 => Ok(NetworkConfig {
            chain_id: 80084,
            name: "Berachain bArtio".to_string(),
            rpc_url: "https://bartio.rpc.berachain.com".to_string(),
            symbol: "BERA".to_string(),
            block_explorer: "https://bartio.beratrail.io".to_string(),
        }),
        _ => Err(CustomError::UnsupportedChain(chain_id)),
    }
}
