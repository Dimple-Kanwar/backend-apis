use serde::{Serialize,Deserialize};
use std::{any::Any, fmt::Debug};

use super::token::TokenBalance;

#[derive(serde::Serialize)]
pub struct ApiResponse {
    pub status: String,
    pub code: String,
    pub message: String,
    pub result: Vec<(TokenBalance, String)>
}
