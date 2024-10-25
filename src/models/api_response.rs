use actix_web::HttpResponse;
use serde::Serialize;

use crate::errors::ApiError;

// Generic API Response wrapper
#[derive(Debug, Serialize)]
pub struct ApiResponse<T> {
    pub status: String,
    pub code: u16,
    pub result: Option<T>,
    pub error: Option<ApiError>
}


// Success response helper
pub fn success_response<T: Serialize>(data: T) -> HttpResponse {
    HttpResponse::Ok().json(ApiResponse {
        status: "SUCCESS".to_string(),
        code: 200,
        result: Some(data),
        error: None,
    })
}
