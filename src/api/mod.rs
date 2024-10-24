use actix_web::web;
mod handlers;

pub fn config(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/api/v1")
            .service(handlers::create_transaction)
            .service(handlers::get_wallet)
    );
}