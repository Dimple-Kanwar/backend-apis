use std::fmt::Debug;

use actix_web::{post, get, web, HttpResponse, Responder};


// use crate::models::transaction::Transaction;
use crate::{
    models::{api_response::ApiResponse, transaction::TransactionRequest}, 
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
        Ok(wallet) => {
            let status = "SUCCESS".to_string();
            let code = 200.to_string();
            let message = "Fetch Native token balance successfully!".to_string();
            // let mut data = vec![];
            let mut data: Vec<Box<dyn Debug>> = vec![];
            data.push(Box::new(wallet));
            let result = data;
            let response: ApiResponse = ApiResponse{ status, code, message, result };
            return HttpResponse::Ok().json(response)
        },
        Err(e) => {
            let status = "Failed".to_string();
            let code = 400.to_string();
            let message = "Failed to fetch Native token balance!".to_string();
            // let mut data = vec![];
            let mut data: Vec<Box<dyn Debug>> = vec![];
            data.push(Box::new(e.to_string()));
            let result = data;
            let response: ApiResponse = ApiResponse{ status, code, message, result };
            return HttpResponse::NotFound().json(response)
        },
    }
}