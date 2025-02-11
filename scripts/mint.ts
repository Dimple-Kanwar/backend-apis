import {ethers, Wallet} from "ethers";
import { MockERC20 } from "../typechain-types";
import { abi as tokenAbi } from "../artifacts/contracts/MockERC20Token.sol/MockERC20Token.json";
import "dotenv/config";

async function main() {
    const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_TESTNET_RPC);
    const owner = new Wallet(process.env.ADMIN_ACCOUNT_PK!, provider);
    const token = process.env.B10_TOKEN_SEPOLIA!;
    const tokenContract = new ethers.Contract(token, tokenAbi, owner) as unknown as MockERC20;
    const mintTx = await tokenContract.mint(owner, ethers.parseEther("1000"))
    const receipt1 = await mintTx.wait();
    console.log({ receipt1 });
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});



