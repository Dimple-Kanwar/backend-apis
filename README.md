# Sample Hardhat Project

This project demonstrates a basic Hardhat use case. It comes with a sample contract, a test for that contract, and a Hardhat Ignition module that deploys that contract.

Try running some of the following tasks:

```shell
npx hardhat help
npx hardhat test
REPORT_GAS=true npx hardhat test
npx hardhat node
npx hardhat ignition deploy ./ignition/modules/Bridge.ts --network base_sepolia
```

## Local setup instructions:

    npm install

setup .env file: 

    cp .env.sample .env

#Note: replace private keys for the required accounts

    npm start

    npm run test


curl --request POST \
    --header 'content-type: application/json' \
    --header 'x-api-key: Bu4mVCiLmyeeA7xOVVEicLa30mWqyS+n0Ih1HMJNB8wxNzM4MDcyMTk0MTUy' \
    --url http://localhost:4000/graphql \
    --data '{"query":"mutation BridgeToken($input: ApiKeyInput!) {\n  generateApiKey(input: $input)\n}","variables":{"input":{"clientName":"Dimple","rateLimit":1000}}}'

                


