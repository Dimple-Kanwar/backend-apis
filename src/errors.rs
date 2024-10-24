use ethers::providers::ProviderError;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum CustomError {
    #[error("Invalid transaction: {0}")]
    InvalidTransaction(String),

    #[error("Insufficient funds")]
    InsufficientFunds,
    
    #[error("Account not found")]
    AccountNotFound,
    
    #[error("Internal server error")]
    InternalError,

    #[error("Provider error: {0}")]
    ProviderError(#[from] ProviderError),
    
    #[error("Invalid address: {0}")]
    InvalidAddress(String),
    
    #[error("Network error: {0}")]
    NetworkError(String),
    
    #[error("Unsupported chain: {0}")]
    UnsupportedChain(u64),

    #[error("Provider error: {0}")]
    StringifiedProviderError(String),
    
    #[error("Contract error: {0}")]
    ContractError(String),
    
    #[error("Token not found: {0}")]
    TokenNotFound(String),
}