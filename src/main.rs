use actix_web::{App, HttpServer};
use dotenv::dotenv;
use std::env;
use actix_cors::Cors;
use actix_web::http::header;

mod api;
mod config;
mod errors;
mod models;
mod services;

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    dotenv().ok();
    env_logger::init();

    let config = config::Config::from_env();
    
    HttpServer::new(move || {
        let cors = Cors::default()
            .allowed_origin("http://localhost:8080")
            .allowed_origin("http://localhost:5173")
            .allowed_methods(vec!["GET", "POST"])
            .allowed_headers(vec![
                header::CONTENT_TYPE,
                header::AUTHORIZATION,
                header::ACCEPT,
            ])
            .supports_credentials();
        App::new()
            .configure(api::config)
            .wrap(cors)
    })
    .bind(("127.0.0.1", config.port))?
    .run()
    .await
}