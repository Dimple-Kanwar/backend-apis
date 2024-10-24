use actix_web::{post, get, web, HttpResponse, Responder};
use serde::Deserialize;

// use crate::models::transaction::Transaction;
use crate::services::{transaction_service::TransactionService, wallet_service::WalletService};

#[derive(Deserialize)]
pub struct TransactionRequest {
    from_address: String,
    to_address: String,
    amount: f64,
    token_address: String,
}

#[post("/transfer")]
async fn create_transaction(
    transaction_req: web::Json<TransactionRequest>,
) -> impl Responder {
    let wallet_service = WalletService;
    let transaction_service = TransactionService::new(wallet_service);

    match transaction_service
        .create_transaction(
            transaction_req.from_address.clone(),
            transaction_req.to_address.clone(),
            transaction_req.amount,
            transaction_req.token_address.clone(),
        )
        .await
    {
        Ok(transaction) => HttpResponse::Created().json(transaction),
        Err(e) => HttpResponse::BadRequest().body(e.to_string()),
    }
}

#[get("/wallets/{address}")]
async fn get_wallet(address: web::Path<String>) -> impl Responder {
    let wallet_service = WalletService;
    
    match wallet_service.get_wallet(&address).await {
        Ok(wallet) => HttpResponse::Ok().json(wallet),
        Err(e) => HttpResponse::NotFound().body(e.to_string()),
    }
}