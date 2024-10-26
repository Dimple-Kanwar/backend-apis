use actix_web::{HttpResponse, ResponseError};
use ethers::providers::ProviderError;
use serde::Serialize;
use thiserror::Error;

use crate::models::api_response::ApiResponse;

#[derive(Error, Debug)]
pub enum CustomError {
    #[error("Invalid transaction: {0}")]
    InvalidTransactionError(String),

    #[error("Insufficient funds")]
    InsufficientFundsError,
    
    #[error("Account not found")]
    AccountNotFoundError,
    
    #[error("Internal server error")]
    InternalServerError,

    #[error("Provider error: {0}")]
    ProviderError(#[from] ProviderError),
    
    #[error("Invalid address: {0}")]
    InvalidAddressError(String),

    #[error("Invalid amount: {0}")]
    InvalidAmountError(String),
    
    #[error("Network error: {0}")]
    NetworkError(String),
    
    #[error("Unsupported chain: {0}")]
    UnsupportedChainError(u64),

    #[error("Provider error: {0}")]
    StringifiedProviderError(String),
    
    #[error("Contract error: {0}")]
    ContractError(String),
    
    #[error("Token not found: {0}")]
    TokenNotFoundError(String),

    #[error("Resource not found")]
    NotFoundError,

    #[error("Transaction failed")]
    TransactionFailedError,

    #[error("Failed to get transaction receipt")]
    TransactionReceiptFailedError,
    
    #[error("Invalid input: {0}")]
    ValidationError(String)
}

// Custom Error type
#[derive(Debug, Serialize)]
pub struct ApiError {
    code: u16,
    message: String,
}

// Implement ResponseError for CustomError
impl ResponseError for CustomError {
    fn error_response(&self) -> HttpResponse {
        let api_error = ApiError {
            code: match self {
                CustomError::NotFoundError => 404,
                CustomError::ValidationError(_) => 400,
                CustomError::InternalServerError => 500,
                CustomError::InvalidTransactionError(_) => 400,
                CustomError::InsufficientFundsError => 400,
                CustomError::AccountNotFoundError => 404,
                CustomError::ProviderError(_) => 500,
                CustomError::InvalidAddressError(_) => 400,
                CustomError::NetworkError(_) => 500,
                CustomError::UnsupportedChainError(_) => 400,
                CustomError::StringifiedProviderError(_) => 500,
                CustomError::ContractError(_) => 500,
                CustomError::TokenNotFoundError(_) => 404,
                CustomError::InvalidAmountError(_) => 400,
                CustomError::TransactionFailedError => 500,
                CustomError::TransactionReceiptFailedError => 500,
            },
            message: self.to_string(),
        };

        let response = ApiResponse {
            status: "FAILURE".to_string(),
            code: api_error.code,
            result: None::<()>,
            error: Some(api_error),
        };

        match self {
            CustomError::NotFoundError => HttpResponse::NotFound().json(response),
            CustomError::ValidationError(_) => HttpResponse::BadRequest().json(response),
            CustomError::InternalServerError => HttpResponse::InternalServerError().json(response),
            CustomError::InvalidTransactionError(_) => HttpResponse::BadRequest().json(response),
            CustomError::InsufficientFundsError => HttpResponse::BadRequest().json(response),
            CustomError::AccountNotFoundError => HttpResponse::NotFound().json(response),
            CustomError::ProviderError(_) => HttpResponse::InternalServerError().json(response),
            CustomError::InvalidAddressError(_) => HttpResponse::BadRequest().json(response),
            CustomError::NetworkError(_) => HttpResponse::InternalServerError().json(response),
            CustomError::UnsupportedChainError(_) => HttpResponse::BadRequest().json(response),
            CustomError::StringifiedProviderError(_) => HttpResponse::InternalServerError().json(response),
            CustomError::ContractError(_) => HttpResponse::InternalServerError().json(response),
            CustomError::TokenNotFoundError(_) => HttpResponse::NotFound().json(response),
            CustomError::InvalidAmountError(_) => HttpResponse::BadRequest().json(response),
            CustomError::TransactionFailedError => HttpResponse::InternalServerError().json(response),
            CustomError::TransactionReceiptFailedError => HttpResponse::InternalServerError().json(response),
        }
    }
}