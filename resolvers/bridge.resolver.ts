// resolvers/bridge.resolver.ts
import { Contract, Wallet, ethers } from "ethers";
import { abi as bridgeAbi } from "../artifacts/contracts/Bridge.sol/Bridge.json";
import { abi as tokenAbi } from "../artifacts/contracts/MockERC20Token.sol/MockERC20Token.json";
import { generateLockHash, generateNonce } from "../utils/common";

interface BridgeInput {
  token: string;
  sourceChainId: number;
  targetChainId: number;
  amount: string;
  sender: string;
  recipient: string;
}

interface BridgeResponse {
  success: boolean;
  transactionHash?: string;
  sourceTxHash?: string;
  targetTxHash?: string;
  status: string;
  error?: string;
}

export const bridgeResolvers = {
  Query: {},
  Mutation: {
    bridgeToken: async (
      _: any,
      input: BridgeInput
    ): Promise<BridgeResponse> => {
      try {
        const {
          token,
          sourceChainId,
          targetChainId,
          amount,
          sender,
          recipient,
        } = input;

        // Convert amount to BigInt
        const formattedAmount = BigInt(amount);

        // Initialize providers
        const sourceProvider = new ethers.JsonRpcProvider(
          process.env.BASE_TESTNET_RPC
        );
        const targetProvider = new ethers.JsonRpcProvider(
          process.env.ARBITRUM_TESTNET_RPC
        );

        // Initialize wallets
        const adminWallet = new Wallet(process.env.ADMIN_ACCOUNT_PK!);
        const sourceAdmin = adminWallet.connect(sourceProvider);
        const senderWallet = new Wallet(process.env.USER1_PK!);
        const senderSigner = senderWallet.connect(sourceProvider);

        // Initialize contracts
        const sourceToken = new Contract(token, tokenAbi, senderSigner);
        const sourceBridge = new Contract(
          process.env.BASE_BRIDGE_ADDRESS!,
          bridgeAbi,
          sourceAdmin
        );

        // Check if sender has sufficient balance
        const balance = await sourceToken.balanceOf(sender);
        if (balance < formattedAmount) {
          throw new Error("Insufficient token balance");
        }

        // Step 1: Approve bridge to spend tokens
        console.log("Approving tokens...");
        const approveTx = await sourceToken.approve(
          process.env.BASE_BRIDGE_ADDRESS!,
          formattedAmount
        );
        await approveTx.wait();
        console.log("Tokens approved");

        // Step 2: Generate nonce and hash
        const nonce = await generateNonce(sender);
        const targetChainTxHash = await generateLockHash(
          token,
          sender,
          recipient,
          formattedAmount,
          nonce,
          sourceChainId,
          targetChainId
        );

        // Step 3: Verify admin is validator
        const isValidator = await sourceBridge.validators(adminWallet.address);
        console.log("Is validator:", isValidator);
        if (!isValidator) {
          throw new Error("Admin is not a validator");
        }

        // Step 4: Execute token lock
        console.log("Executing token lock...");
        const lockTx = await sourceBridge.executeTokenOperation(
          token,
          formattedAmount,
          sender,
          targetChainTxHash,
          true // isLock = true
        );
        const lockReceipt = await lockTx.wait();
        console.log("Lock transaction complete:", lockTx.hash);

        // Step 5: Verify TokensLocked event
        const TokensLockedEvent =
          "TokensLocked(address,address,uint256,bytes32)";
        const eventTopic = ethers.id(TokensLockedEvent);

        const lockEvent = lockReceipt.logs.find(
          (log: any) => log.topics[0] === eventTopic
        );

        if (!lockEvent) {
          throw new Error("Token lock failed - event not found");
        }

        return {
          success: true,
          transactionHash: lockTx.hash,
          sourceTxHash: targetChainTxHash,
          status: "COMPLETED",
        };
      } catch (error: any) {
        console.error("Bridge error:", error);
        return {
          success: false,
          status: "FAILED",
          error: error.message || "Unknown error occurred",
        };
      }
    },
  },
};
