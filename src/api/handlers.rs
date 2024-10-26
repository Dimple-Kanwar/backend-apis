use actix_web::{post, get, web, HttpResponse, Responder};


// use crate::models::transaction::Transaction;
use crate::{
    errors::CustomError, models::{api_response::success_response, transaction::TransactionRequest}, services::{transaction_service::TransactionService, wallet_service::WalletService}
};


#[post("/transfer")]
async fn transfer(
    transaction_req: web::Json<TransactionRequest>,
) -> impl Responder {
    let transaction_service = TransactionService;
  
    match transaction_service
        .transfer_token(
            &transaction_req.from_address.clone(),
            &transaction_req.token_address.clone(),
            &transaction_req.to_address.clone(),
            transaction_req.amount,
            transaction_req.chain_id
        )
        .await
    {
        Ok(transaction) => HttpResponse::Created().json(transaction),
        Err(e) => HttpResponse::BadRequest().body(e.to_string()),
    }
}


#[get("/chain/{chain_id}/wallet/{address}")]
async fn get_wallet(params: web::Path<(u64,String)>) -> Result<HttpResponse, CustomError> {
    let params = params.into_inner();
    let address = params.1;
    let chai_id = params.0;
    let wallet_service = WalletService;
    match wallet_service.get_wallet(&address, chai_id).await {
        Ok(wallet) => Ok(success_response(wallet)),
        Err(e) => Err(CustomError::ValidationError(e.to_string())),
    }
}