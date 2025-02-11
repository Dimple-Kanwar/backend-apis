import { ethers, Wallet } from "ethers";
import { MockERC20 } from "../typechain-types";
import { abi as tokenAbi } from "../artifacts/contracts/MockERC20Token.sol/MockERC20Token.json";
import "dotenv/config";

async function main() {
    const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_TESTNET_RPC);
    const owner = new Wallet(process.env.ADMIN_ACCOUNT_PK!, provider);
    console.log({ owner });
    const bridgeAddress = process.env.SEPOLIA_BRIDGE_ADDRESS!;
    console.log({ bridgeAddress });
    const token = process.env.B10_TOKEN_SEPOLIA!;
    console.log({ token });
    const tokenContract = new ethers.Contract(token, tokenAbi, owner) as unknown as MockERC20;
    const balance = await tokenContract.connect(owner).balanceOf(owner.address);
    console.log({ balance });
    const formattedAmount = ethers.parseEther("1");
    console.log({ formattedAmount });
    // const approvalTx = await tokenContract.approve(bridgeAddress, formattedAmount);
    // console.log({ approvalTx });
    // const approvalReceipt = await approvalTx.wait();
    // console.log({ approvalReceipt });
    const liquidityTx = await tokenContract.connect(owner).transfer(bridgeAddress, formattedAmount);
    console.log({ liquidityTx });
    const receipt1 = await liquidityTx.wait();
    console.log({ receipt1 });
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});



