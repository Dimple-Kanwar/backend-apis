import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "dotenv/config";

const config: HardhatUserConfig = {
  solidity: "0.8.28",
  networks: {
    "base_sepolia": {
      url: process.env.BASE_TESTNET_RPC,
      accounts: [process.env.ADMIN_ACCOUNT_PK!]
    },
    "eth_sepolia": {
      url: process.env.SEPOLIA_TESTNET_RPC,
      accounts: [process.env.ADMIN_ACCOUNT_PK!]
    },
    "arbitrum_sepolia": {
      url: process.env.ARBITRUM_TESTNET_RPC,
      accounts: [process.env.ADMIN_ACCOUNT_PK!]
    },
    "gnosis_chiado_testnet": {
      url: process.env.GNOSIS_TESTNET_RPC,
      accounts: [process.env.ADMIN_ACCOUNT_PK!]
    },
    rootstock_testnet: {
      url: process.env.ROOTSTOCK_TESTNET_RPC,
      accounts: [process.env.ADMIN_ACCOUNT_PK!]
    },
    localhost: {
      url: "http://127.0.0.1:8545/"
    }
  }
};

export default config;
