use ethers::{
    abi::AbiParser,
    contract::Contract,
    core::types::{Address, U256},
    providers::{Http, Middleware, Provider},
    types::U64,
};
use std::{str::FromStr, sync::Arc};

use crate::{
    errors::CustomError,
    models::{network_config::NetworkConfig, network_status::NetworkStatus, token::TokenBalance},
};

use super::network_config::get_network_config;

// ERC20 ABI for balance and decimals functions
const ERC20_ABI: &str = r#"[
    {
        "constant": true,
        "inputs": [{"name": "_owner", "type": "address"}],
        "name": "balanceOf",
        "outputs": [{"name": "balance", "type": "uint256"}],
        "type": "function"
    },
    {
        "constant": true,
        "inputs": [],
        "name": "decimals",
        "outputs": [{"name": "", "type": "uint8"}],
        "type": "function"
    },
    {
        "constant": true,
        "inputs": [],
        "name": "symbol",
        "outputs": [{"name": "", "type": "string"}],
        "type": "function"
    }
]"#;

#[derive(Clone, Debug)]
pub struct BlockchainClient {
    provider: Arc<Provider<Http>>,
    config: NetworkConfig,
}

impl BlockchainClient {
    /// Create a new blockchain client by chain ID
    pub async fn new(chain_id: u64) -> Result<Self, CustomError> {
        let config = get_network_config(chain_id)?;
        let provider = Provider::<Http>::try_from(&config.rpc_url)
            .map_err(|e| CustomError::NetworkError(e.to_string()))?;

        // Verify connection and chain ID
        let connected_chain_id = provider
            .get_chainid()
            .await
            .map_err(|e| CustomError::StringifiedProviderError(e.to_string()))?;

        if connected_chain_id.as_u64() != chain_id {
            return Err(CustomError::NetworkError(
                "Connected chain ID doesn't match requested chain ID".to_string(),
            ));
        }

        Ok(Self {
            provider: Arc::new(provider),
            config,
        })
    }

    /// Get native token balance for an address
    pub async fn get_native_balance(
        &self,
        wallet_address: &str,
    ) -> Result<TokenBalance, CustomError> {
        let address = Address::from_str(wallet_address)
            .map_err(|_| CustomError::InvalidAddressError(wallet_address.to_string()))?;

        let balance = self
            .provider
            .get_balance(address, None)
            .await
            .map_err(|e| CustomError::StringifiedProviderError(e.to_string()))?;

        // Get chain native token symbol
        let chain_id: U256 = self
            .provider
            .get_chainid()
            .await
            .map_err(|e| CustomError::StringifiedProviderError(e.to_string()))?;

        let formatted_balance = ethers::utils::format_ether(balance);

        let symbol = self.get_token_symbol(chain_id);

        Ok(TokenBalance {
            token_address: None,
            symbol,
            balance,
            decimals: 18,
            formatted_balance: formatted_balance.to_string(),
        })
    }

    /// Get ERC20 token balance
    pub async fn get_token_balance(
        &self,
        token_address: &str,
        wallet_address: &str,
    ) -> Result<TokenBalance, CustomError> {
        let token_address = Address::from_str(token_address)
            .map_err(|_| CustomError::InvalidAddressError(token_address.to_string()))?;

        let wallet_address = Address::from_str(wallet_address)
            .map_err(|_| CustomError::InvalidAddressError(wallet_address.to_string()))?;

        // Create contract instance
        let contract = Contract::new(
            token_address,
            AbiParser::default().parse_str(ERC20_ABI).unwrap(),
            self.provider.clone(),
        );

        // Get token decimals
        let decimals: u8 = contract
            .method::<_, u8>("decimals", ())
            .map_err(|e| CustomError::ContractError(e.to_string()))?
            .call()
            .await
            .map_err(|e| CustomError::ContractError(e.to_string()))?;

        // Get token symbol
        let symbol: String = contract
            .method::<_, String>("symbol", ())
            .map_err(|e| CustomError::ContractError(e.to_string()))?
            .call()
            .await
            .map_err(|e| CustomError::ContractError(e.to_string()))?;

        // Get balance
        let balance: U256 = contract
            .method::<_, U256>("balanceOf", wallet_address)
            .map_err(|e| CustomError::ContractError(e.to_string()))?
            .call()
            .await
            .map_err(|e| CustomError::ContractError(e.to_string()))?;

        // Format balance with proper decimals
        let formatted_balance = Self::format_units(balance, decimals);

        Ok(TokenBalance {
            token_address: Some(token_address.to_string()),
            symbol,
            balance,
            decimals,
            formatted_balance,
        })
    }

    /// Helper function to format units with proper decimals
    fn format_units(amount: U256, decimals: u8) -> String {
        let mut amount_str = amount.to_string();
        let digits = amount_str.len();

        if digits <= decimals as usize {
            amount_str.insert_str(0, &"0".repeat(decimals as usize - digits + 1));
        }

        amount_str.insert(digits - decimals as usize, '.');

        // Trim trailing zeros and decimal point if necessary
        amount_str = amount_str
            .trim_end_matches('0')
            .trim_end_matches('.')
            .to_string();

        if amount_str.is_empty() {
            "0".to_string()
        } else {
            amount_str
        }
    }
    /// Get multiple token balances at once
    pub async fn get_multiple_token_balances(
        &self,
        token_addresses: &[String],
        wallet_address: &str,
    ) -> Result<Vec<TokenBalance>, CustomError> {
        let mut balances = Vec::new();

        // Get native balance first
        let native_balance = self.get_native_balance(wallet_address).await?;
        balances.push(native_balance);

        // Get ERC20 token balances
        for token_address in token_addresses {
            match self.get_token_balance(token_address, wallet_address).await {
                Ok(balance) => balances.push(balance),
                Err(e) => {
                    eprintln!("Error fetching balance for token {}: {}", token_address, e);
                    continue;
                }
            }
        }

        Ok(balances)
    }

    /// Get transaction count (nonce) for an address
    pub async fn get_transaction_count(&self, address: &str) -> Result<U256, CustomError> {
        let address = Address::from_str(address)
            .map_err(|_| CustomError::InvalidAddressError(address.to_string()))?;

        self.provider
            .get_transaction_count(address, None)
            .await
            .map_err(CustomError::ProviderError)
    }

    /// Get latest block number
    pub async fn get_latest_block(&self) -> Result<U64, CustomError> {
        self.provider
            .get_block_number()
            .await
            .map_err(CustomError::ProviderError)
    }

    /// Get network status
    pub async fn get_network_status(&self) -> Result<NetworkStatus, CustomError> {
        let latest_block = self.get_latest_block().await?;
        let gas_price = self
            .provider
            .get_gas_price()
            .await
            .map_err(CustomError::ProviderError)?;

        Ok(NetworkStatus {
            chain_id: self.config.chain_id,
            name: self.config.name.clone(),
            latest_block: latest_block.as_u64(),
            gas_price: gas_price.as_u64(),
            symbol: self.config.symbol.clone(),
            block_explorer: self.config.block_explorer.clone(),
        })
    }

    /// Get network status
    pub fn get_token_symbol(&self, chain_id: U256) -> String {
        let symbol = match chain_id.as_u64() {
            1 => "ETH",
            137 => "MATIC",
            56 => "BNB",
            80084 => "BERA",
            // Add more chains as needed
            _ => "ETH",
        };

        return symbol.to_string();
    }
}

// Example API implementation for web framework integration
// pub async fn handle_wallet_connection(chain_id: u64, wallet_address: &str) -> Result<String, CustomError> {
//     let client = BlockchainClient::new(chain_id).await?;
//     let (balance, symbol) = client.get_native_balance(wallet_address).await?;
//     let network_status = client.get_network_status().await?;

//     Ok(format!(
//         "Connected to {} - Balance: {} {} - Latest Block: {}",
//         network_status.name,
//         ethers::utils::format_ether(balance),
//         symbol,
//         network_status.latest_block
//     ))
// }

// #[tokio::main]
// async fn main() -> Result<(), CustomError> {
//     // Example usage
//     let chain_id = 1; // Ethereum Mainnet
//     let wallet_address = "0x742d35Cc6634C0532925a3b844Bc454e4438f44e";

//     // Connect to the network and get wallet info
//     match handle_wallet_connection(chain_id, wallet_address).await {
//         Ok(info) => println!("{}", info),
//         Err(e) => eprintln!("Error: {}", e),
//     }

//     Ok(())
// }
