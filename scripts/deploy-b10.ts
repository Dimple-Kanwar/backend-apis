import { ethers } from "ethers";
import { abi as tokenAbi, bytecode } from "../artifacts/contracts/MockERC20Token.sol/MockERC20Token.json";
import "dotenv/config";

interface ChainConfig {
  name: string;
  rpc: string;
  chainId: number;
}

const CHAINS: { [key: string]: ChainConfig } = {
  baseSepolia: {
    name: "Base Sepolia",
    rpc: process.env.BASE_SEPOLIA_RPC!,
    chainId: 84532
  },
  sepolia: {
    name: "Sepolia",
    rpc: process.env.SEPOLIA_TESTNET_RPC!,
    chainId: 11155111
  }
};

async function deployToken(chain: ChainConfig) {
  console.log(`\nDeploying B10 token to ${chain.name}...`);
  
  const provider = new ethers.JsonRpcProvider(chain.rpc);
  const owner = new ethers.Wallet(process.env.ADMIN_ACCOUNT_PK!, provider);
  
  // Deploy token contract
  const factory = new ethers.ContractFactory(
    tokenAbi,
    bytecode,
    owner
  );

  const token = await factory.deploy(
    "B10 Token",  // name
    "B10",        // symbol
    18            // decimals
  );

  const receipt = await token.deploymentTransaction()?.wait();
  
  console.log(`Deployed B10 token on ${chain.name}:`);
  console.log(`Address: ${await token.getAddress()}`);
  console.log(`Transaction Hash: ${receipt?.hash}`);
  console.log(`Gas Used: ${receipt?.gasUsed}`);
  
  return await token.getAddress();
}

async function main() {
  try {
    // Deploy to Base Sepolia
    const baseSepoliaAddress = await deployToken(CHAINS.baseSepolia);
    
    // Deploy to Sepolia
    const sepoliaAddress = await deployToken(CHAINS.sepolia);
    
    console.log("\nDeployment Summary:");
    console.log("===================");
    console.log(`Base Sepolia B10: ${baseSepoliaAddress}`);
    console.log(`Sepolia B10: ${sepoliaAddress}`);
    console.log("\nAdd these addresses to your .env file as:");
    console.log(`B10_TOKEN_BASE_SEPOLIA=${baseSepoliaAddress}`);
    console.log(`B10_TOKEN_SEPOLIA=${sepoliaAddress}`);
    
  } catch (error) {
    console.error("Deployment failed:", error);
    process.exitCode = 1;
  }
}

main();
