import { ethers } from "ethers";
import { MockERC20Token } from "../typechain-types";
import { abi as tokenAbi } from "../artifacts/contracts/MockERC20Token.sol/MockERC20Token.json";
import "dotenv/config";

interface ChainConfig {
  name: string;
  rpc: string;
  tokenAddress: string;
  chainId: number;
}

const CHAINS: { [key: string]: ChainConfig } = {
  baseSepolia: {
    name: "Base Sepolia",
    rpc: process.env.BASE_SEPOLIA_RPC!,
    tokenAddress: process.env.B10_TOKEN_BASE_SEPOLIA!,
    chainId: 84532
  },
  sepolia: {
    name: "Sepolia",
    rpc: process.env.SEPOLIA_TESTNET_RPC!,
    tokenAddress: process.env.B10_TOKEN_SEPOLIA!,
    chainId: 11155111
  }
};

async function mintTokens(chain: ChainConfig, amount: string) {
  console.log(`\nMinting ${amount} B10 tokens on ${chain.name}...`);
  
  const provider = new ethers.JsonRpcProvider(chain.rpc);
  const owner = new ethers.Wallet(process.env.ADMIN_ACCOUNT_PK!, provider);
  const tokenContract = new ethers.Contract(
    chain.tokenAddress,
    tokenAbi,
    owner
  ) as unknown as MockERC20Token;

  // Get current balance
  const balanceBefore = await tokenContract.balanceOf(owner.address);
  console.log(`Balance before: ${ethers.formatEther(balanceBefore)} B10`);

  // Mint tokens
  const mintTx = await tokenContract.mint(owner.address, ethers.parseEther(amount));
  const receipt = await mintTx.wait();

  // Get new balance
  const balanceAfter = await tokenContract.balanceOf(owner.address);
  
  console.log(`Minted ${amount} B10 tokens on ${chain.name}:`);
  console.log(`Transaction Hash: ${receipt?.hash}`);
  console.log(`Gas Used: ${receipt?.gasUsed}`);
  console.log(`New Balance: ${ethers.formatEther(balanceAfter)} B10\n`);
}

async function main() {
  try {
    // Amount to mint on each chain
    const amount = "10000";

    // Mint on Base Sepolia
    await mintTokens(CHAINS.baseSepolia, amount);
    
    // Mint on Sepolia
    await mintTokens(CHAINS.sepolia, amount);
    
    console.log("Minting completed successfully on both chains!");
    
  } catch (error) {
    console.error("Minting failed:", error);
    process.exitCode = 1;
  }
}

main();



