use actix_web::web;
mod handlers;
mod intent_handlers;

pub fn config(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/api/v1")
            .service(handlers::transfer)
            .service(handlers::get_wallet)
            .service(intent_handlers::submit_intent)
    );
}