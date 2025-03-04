import { BridgeService } from "../services/bridge.service";
import { generateLockHash, generateNonce } from "../utils/common";
import { abi as bridgeAbi } from "../artifacts/contracts/Bridge.sol/Bridge.json";
import { ethers, Contract, Wallet } from "ethers";
import { CHAIN_CONFIGS } from "../config/chains";
import "dotenv/config";

const senderWallet = new Wallet(process.env.USER1_PK!);
const receiverWallet = new Wallet(process.env.USER2_PK!);

const bridgeToken = async (input: any) => {
  const {
    sourceToken,
    targetToken,
    sourceChainId,
    targetChainId,
    amount,
    sender,
    recipient,
  } = input;
  const formattedAmount = ethers.parseEther(amount);
  console.log({ formattedAmount });
  const nonce = await generateNonce(sender);
  console.log({ nonce });
  const targetChainTxHash = await generateLockHash(
    sourceToken,
    sender,
    recipient,
    formattedAmount.toString(),
    nonce,
    sourceChainId,
    targetChainId
  );
  console.log({ targetChainTxHash });
  let sourceBridge: Contract | undefined;
  for (const [chainId, config] of Object.entries(CHAIN_CONFIGS)) {
    if (chainId == sourceChainId) {
        console.log({rpcURl : config.rpcUrl});
        const provider = new ethers.JsonRpcProvider(config.rpcUrl);
      
      console.log({birdgeAddress : config.bridgeAddress});
       sourceBridge = new Contract(
        config.bridgeAddress,
        bridgeAbi,
        senderWallet.connect(provider)
      );
      const lockTx = await sourceBridge.lockTokens(
        sourceToken,
        formattedAmount,
        recipient,
        targetChainTxHash
      );
      console.log("Lock transaction hash:", lockTx.hash);
        const receipt = await lockTx.wait();
        console.log("Lock transaction receipt:", receipt);
        break;
    }
  }
};

const input = {
  sourceToken: "0x62060727308449B9347f5649Ea7495C061009615",
  targetToken: "0x22DD04E98a65396714b64a712678A2D27737Bb77",
  sourceChainId: 84532,
  targetChainId: 11155111,
  amount: "10",
  sender: "0x0500DE79c6Aa801936cA05D798C9E7468b6739C6",
  recipient: "0x865639b103B5cb25Db1C8703a02a64449dA4d038",
};
bridgeToken(input).catch(console.error);
