use serde::{Deserialize, Serialize};
use uuid::Uuid;

// #[derive(Serialize, Deserialize, Debug)]
// pub struct IntentRequest<T> {
//     pub data: Option<T>,
//     pub intent: String,
//     pub requester: f64,
//     pub chain_id: u64
// }

#[derive(Serialize, Deserialize, Debug)]
pub struct IntentRequest {
    pub data: String,
    pub intent: String,
    pub requester: String,
    pub chain_id: u64
}

#[derive(Debug, Serialize, Deserialize)]
pub struct IntentResponse {
    pub transaction_hash: String,
    pub intent_id: Uuid
}
