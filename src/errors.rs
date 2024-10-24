use thiserror::Error;

#[derive(Error, Debug)]
pub enum ApiError {
    #[error("Invalid transaction: {0}")]
    InvalidTransaction(String),
    #[error("Insufficient funds")]
    InsufficientFunds,
    #[error("Account not found")]
    AccountNotFound,
    #[error("Internal server error")]
    InternalError,
}