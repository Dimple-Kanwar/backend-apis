use crate::{
    errors::CustomError,
    models::{api_response::success_response, intent::IntentRequest},
    services::intent_service::IntentService,
};
use actix_web::{post, web, HttpResponse};

#[post("/intent/submit")]
async fn submit_intent(intent_req: web::Json<IntentRequest>) -> Result<HttpResponse, CustomError> {
    print!("intent_req: {:?}", intent_req);
    match IntentService::submit_intent(intent_req.into_inner()).await {
        Ok(intent) => Ok(success_response(intent)),
        Err(e) => Err(CustomError::ValidationError(e.to_string())),
    }
}

