use ethers::{
    core::types::{Address, BlockNumber, Chain, H256, U256},
    providers::{Http, Middleware, Provider, ProviderError},
    utils::parse_ether,
};
use ethers::utils::hex;

use crate::{errors::CustomError, models::{token::TokenBalance, wallet}};
use crate::models::wallet::Wallet;

use super::blockchain_service::BlockchainClient;

pub struct WalletService;

impl WalletService {
    
    pub async fn get_wallet(&self, address: &str, chain_id: u64) -> Result<TokenBalance, CustomError> {
        // Implementation would typically interact with a database
        // This is a mock implementation
        let client = BlockchainClient::new(chain_id).await?;
        let native_balance = client.get_native_balance(address).await?;
        Ok(native_balance)
    }

    // Convert balance from Wei to Ether
    pub fn wei_to_eth(&self, wei_value: U256) -> f64 {
        let wei = wei_value.as_u128() as f64;
        wei / 1_000_000_000_000_000_000.0 // 10^18
    }

    // Get native token balance for an address
    // pub async fn get_balance(&self, address: &str) -> Result<(U256, String), BlockchainError> {
    //     let address = Address::from_str(address)
    //         .map_err(|_| BlockchainError::InvalidAddress(address.to_string()))?;
            
    //     let balance = self
    //         .provider
    //         .get_balance(address, None)
    //         .await
    //         .map_err(BlockchainError::ProviderError)?;
            
    //     Ok((balance, self.config.symbol.clone()))
    // }

    // Get ERC20 token balance
    // pub async fn get_token_balance(
    //     &self,
    //     token_address: &str,
    //     wallet_address: &str,
    // ) -> Result<U256, BlockchainError> {
    //     let token_address = Address::from_str(token_address)
    //         .map_err(|_| BlockchainError::InvalidAddress(token_address.to_string()))?;
    //     let wallet_address = Address::from_str(wallet_address)
    //         .map_err(|_| BlockchainError::InvalidAddress(wallet_address.to_string()))?;
            
    //     // ERC20 balanceOf function signature
    //     let data = hex::decode("70a08231000000000000000000000000")
    //         .unwrap()
    //         .into_iter()
    //         .chain(wallet_address.as_bytes().iter().copied())
    //         .collect::<Vec<u8>>();
            
    //     let balance = self
    //         .provider
    //         .call(
    //             &ethers::core::types::TransactionRequest::new()
    //                 .to(token_address)
    //                 .data(data.into()),
    //             None,
    //         )
    //         .await
    //         .map_err(BlockchainError::ProviderError)?;
            
    //     Ok(U256::from_big_endian(&balance))
    // }
    
}
