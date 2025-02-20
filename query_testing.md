query GetSupportedChains {
supportedChains {
id
name
}
}

mutation BridgeTokens {
bridgeToken(
token: "0x9d0aeb04c6a180e9c2cf9d732e5a737655bbd968"  
 sourceChainId: 84532  
 targetChainId: 421614  
 amount: "10"
sender: "0x984c9a3fC1166061b5A4015B557ba141eBb55912"  
 recipient: "0x3c1e7e6C35A579a00eA8F8cc799b397EaA6b9374"  
 ) {
success
transactionHash
sourceTxHash
targetTxHash
status
error
}
}

mutation TestSmallTransfer {
bridgeToken(
token: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174"
sourceChainId: 80002
targetChainId: 84532
amount: "100000" # 0.1 USDC
sender: "0x742d35Cc6634C0532925a3b844Bc454e4438f44e"
recipient: "0x742d35Cc6634C0532925a3b844Bc454e4438f44e"
) {
success
transactionHash
error
}
}

mutation GenerateApiKey {
generateApiKey(input: {
clientName: "TestClient"
rateLimit: 1000
})
}
//sepolia
mutation BridgeTokens {
bridgeToken(
sourceToken: "0xab52AeDE8579C847cD20865d2f81a782EF646Cc5"  
 targetToken: "0xa991Ba363cfe3d47278ff6115d0D13cE87A2DAac"
sourceChainId: 84532  
 targetChainId: 11155111  
 amount: "2"
sender: "0x984c9a3fC1166061b5A4015B557ba141eBb55912"
recipient: "0x3c1e7e6C35A579a00eA8F8cc799b397EaA6b9374"  
 ) {
success
transactionHash
sourceTxHash
targetTxHash
status
error
}
}
