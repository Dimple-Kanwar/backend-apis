use ethers::{
    providers::{Provider, Http},
    signers::LocalWallet,
    middleware::SignerMiddleware,
};

pub struct BlockchainClient {
    provider: Provider<Http>,
    wallet: LocalWallet,
}