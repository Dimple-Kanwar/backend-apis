use std::env;
use std::str::FromStr;
use std::sync::Arc;

use crate::errors::CustomError;
// use crate::services::wallet_service::WalletService;
use crate::models::transaction::{Transaction, TransactionStatus};
use chrono::Utc;
use ethers::contract::abigen;
use ethers::middleware::SignerMiddleware;
use ethers::signers::{LocalWallet, Signer};
use ethers::types::{Address, TransactionReceipt, U256};
use uuid::Uuid;

use super::blockchain_service::BlockchainClient;

pub struct TransactionService;

// Contract ABI for ERC20 tokens
// const ERC20_ABI: &str = r#"[
//     {
//         "inputs": [
//             {"name": "recipient", "type": "address"},
//             {"name": "amount", "type": "uint256"}
//         ],
//         "name": "transfer",
//         "outputs": [{"name": "", "type": "bool"}],
//         "stateMutability": "nonpayable",
//         "type": "function"
//     },
//     {
//         "inputs": [
//             {"name": "owner", "type": "address"}
//         ],
//         "name": "balanceOf",
//         "outputs": [{"name": "", "type": "uint256"}],
//         "stateMutability": "view",
//         "type": "function"
//     }
// ]"#;

impl TransactionService {

    // pub async fn transfer_native(
    //     &self,
    //     private_key: &str,
    //     to_address: &str,
    //     amount: f64,
    //     gas_limit: Option<u64>,
    // ) -> Result<TransactionReceipt, CustomError> {
    //     // Create wallet from private key
    //     let wallet = LocalWallet::from_str(private_key)
    //         .context("Invalid private key")?
    //         .with_chain_id(self.chain_id);

    //     // Create client with wallet
    //     let client = SignerMiddleware::new(
    //         self.provider.clone(),
    //         wallet,
    //     );
    //     let client = Arc::new(client);

    //     // Convert amount to Wei (multiply by 10^18)
    //     let amount_wei = U256::from_dec_str(&format!("{:.0}", amount * 1e18))
    //         .context("Invalid amount")?;

    //     // Create transaction object
    //     let to_addr = Address::from_str(to_address)
    //         .context("Invalid recipient address")?;

    //     let mut tx = TransactionRequest::new()
    //         .to(to_addr)
    //         .value(amount_wei);

    //     // Set gas limit if provided
    //     if let Some(limit) = gas_limit {
    //         tx = tx.gas(limit);
    //     }

    //     // Send transaction and wait for confirmation
    //     let pending_tx = client
    //         .send_transaction(tx, None)
    //         .await
    //         .context("Failed to send transaction")?;

    //     let receipt = pending_tx
    //         .await
    //         .context("Failed to get transaction receipt")?
    //         .context("Transaction failed")?;

    //     Ok(receipt)
    // }
    
    // Transfer ERC20 tokens
    pub async fn transfer_token(
        &self,
        from_address: &str,
        token_address: &str,
        to_address: &str,
        amount: u64,
        chain_id: u64,
    ) -> Result<TransactionReceipt, CustomError> {
        let private_key = env::var("PRIVATE_KEY")
        .map_err(|e| CustomError::NetworkError(format!("Failed to create wallet: {}", e)))?;
    
        let blockchain_client = BlockchainClient::new(chain_id).await?;
        // Create wallet from private key
        let wallet = LocalWallet::from_str(&private_key)
            .map_err(|e| CustomError::NetworkError(format!("Failed to create wallet: {}", e)))?
            .with_chain_id(chain_id);
    
        // Create client with wallet
        let signer = Arc::new(SignerMiddleware::new(
            blockchain_client.provider.clone(),
            wallet.with_chain_id(chain_id),
        ));
    
        abigen!(ERC20Contract, "[
            function balanceOf(address owner) view returns (uint256)
            function decimals() view returns (uint8)
            function symbol() view returns (string)
            function transfer(address to, uint amount) returns (bool)
        ]");
        
        // Create contract instance
        let token_addr = Address::from_str(token_address)
            .map_err(|_| CustomError::InvalidAddressError(format!("Invalid token address: {}", token_address)))?;
    
        let contract = ERC20Contract::new(token_addr, signer);
    
        // Convert amount to token units (multiply by 10^decimals)
        let decimals: u8 = contract
            .method::<_, u8>("decimals", ())
            .map_err(|e| CustomError::ContractError(e.to_string()))?
            .call()
            .await
            .map_err(|e| CustomError::ContractError(e.to_string()))?;
        let decimal_amount = U256::from(amount) * U256::exp10(decimals as usize);
       
        // Create transfer call with recipient address
        let to_addr = Address::from_str(to_address)
            .map_err(|_| CustomError::InvalidAddressError(format!("Invalid recipient address: {}", to_address)))?;
        let tx = contract.transfer(to_addr, decimal_amount);
        let pending_tx = tx.send().await.map_err(|e| CustomError::ContractError(e.to_string()))?;
        let receipt = pending_tx.await?;
       
      
        Ok(receipt.expect("Transaction not mined yet."))
    }


    
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
            return Err(CustomError::InsufficientFundsError);
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