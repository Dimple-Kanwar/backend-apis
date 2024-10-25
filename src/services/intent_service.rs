use uuid::Uuid;

use crate::{
    errors::CustomError,
    models::{intent::{IntentRequest, IntentResponse}, transfer::TransferRequest},
    services::blockchain_service::BlockchainClient,
};

pub struct IntentService;

impl IntentService {
    pub async fn submit_intent(intent_req: IntentRequest) -> Result<IntentResponse, CustomError> {
        println!("intent_req: {:#?}", intent_req);
        let parsed_data: TransferRequest = serde_json::from_str(&intent_req.data).unwrap();
        println!("parsed_data: {:#?}", parsed_data);
        let client = BlockchainClient::new(intent_req.chain_id).await?;
        println!("client: {:#?}", client);
        let transaction_hash = Uuid::new_v4().to_string();
        let intent_id = Uuid::new_v4();
        Ok(IntentResponse {
            intent_id,
            transaction_hash,
        })
    }
}
