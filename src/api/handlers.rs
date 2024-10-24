use actix_web::{post, get, web, HttpResponse, Responder};


// use crate::models::transaction::Transaction;
use crate::{
    models::transaction::TransactionRequest, 
    services::{blockchain_service::BlockchainClient, transaction_service::TransactionService, wallet_service::{self, WalletService}}
};

#[post("/transfer")]
async fn transfer(
    transaction_req: web::Json<TransactionRequest>,
) -> impl Responder {
    // let wallet_service = WalletService;
    let transaction_service = TransactionService;

    match transaction_service
        .send_transaction(
            &transaction_req.from_address.clone(),
            &transaction_req.to_address.clone(),
            transaction_req.amount,
            &transaction_req.token_address.clone(),
            transaction_req.chain_id
        )
        .await
    {
        Ok(transaction) => HttpResponse::Created().json(transaction),
        Err(e) => HttpResponse::BadRequest().body(e.to_string()),
    }
}

#[get("/chain/{chain_id}/wallet/{address}")]
async fn get_wallet(params: web::Path<(u64,String)>) -> impl Responder {
    let params = params.into_inner();
    let address = params.1;
    let chai_id = params.0;
    // println!("address {}", address);
    // println!("chai_id {}", chai_id);
    let wallet_service = WalletService;
    match wallet_service.get_wallet(&address, chai_id).await {
        Ok(wallet) => HttpResponse::Ok().json(wallet),
        Err(e) => HttpResponse::NotFound().body(e.to_string()),
    }
}