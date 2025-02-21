import { ethers } from "ethers";
import "dotenv/config";
import { CHAIN_CONFIGS } from "../config/chains";

interface SignatureParams {
  sourceChainId: number;
  targetChainId: number;
  sourceToken: string;
  targetToken: string;
  amount: string;
  sender: string;
  recipient: string;
  privateKey: string;
}

interface BridgeData {
  sourceChainId: number;
  targetChainId: number;
  sourceToken: string;
  targetToken: string;
  amount: string;
  sender: string;
  recipient: string;
  deadline: number;
}

async function generateBridgeSignature({
  sourceChainId,
  targetChainId,
  sourceToken,
  targetToken,
  amount,
  sender,
  recipient,
  privateKey,
}: SignatureParams): Promise<{ signature: string; bridgeData: BridgeData }> {
  // Create provider and signer
  const provider = new ethers.JsonRpcProvider(
    CHAIN_CONFIGS[sourceChainId].rpcUrl
  );
  const signer = new ethers.Wallet(privateKey, provider);

  // Calculate permit deadline (48 hours from now)
  const deadline = Math.floor(Date.now() / 1000) + 48 * 60 * 60;

  // Create the bridge data
  const bridgeData = {
    sourceChainId,
    targetChainId,
    sourceToken,
    targetToken,
    amount,
    sender,
    recipient,
    deadline,
  };

  // Create the typed data for signing
  const domain = {
    name: "Bridge",
    version: "1",
    chainId: sourceChainId,
    verifyingContract: CHAIN_CONFIGS[sourceChainId].bridgeAddress,
  };

  const types = {
    BridgeRequest: [
      { name: "sourceChainId", type: "uint256" },
      { name: "targetChainId", type: "uint256" },
      { name: "sourceToken", type: "address" },
      { name: "targetToken", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "sender", type: "address" },
      { name: "recipient", type: "address" },
      { name: "deadline", type: "uint256" },
    ],
  };

  // Sign the typed data
  const signature = await signer.signTypedData(domain, types, bridgeData);

  return { signature, bridgeData };
}

async function verifySignature(signature: string, bridgeData: BridgeData) {
  // Create domain and types matching those used in signature generation
  const domain = {
    name: "Bridge",
    version: "1",
    chainId: bridgeData.sourceChainId,
    verifyingContract: CHAIN_CONFIGS[bridgeData.sourceChainId].bridgeAddress,
  };

  const types = {
    BridgeRequest: [
      { name: "sourceChainId", type: "uint256" },
      { name: "targetChainId", type: "uint256" },
      { name: "sourceToken", type: "address" },
      { name: "targetToken", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "sender", type: "address" },
      { name: "recipient", type: "address" },
      { name: "deadline", type: "uint256" },
    ],
  };

  try {
    // Recover the address that signed the data
    const recoveredAddress = ethers.verifyTypedData(
      domain,
      types,
      bridgeData,
      signature
    );

    // Check if the recovered address matches the sender
    const isValid =
      recoveredAddress.toLowerCase() === bridgeData.sender.toLowerCase();

    return {
      isValid,
      recoveredAddress,
      expectedAddress: bridgeData.sender,
    };
  } catch (error) {
    console.error("Error verifying signature:", error);
    return {
      isValid: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main() {
  // Validate environment variables
  const requiredEnvVars = [
    "B10_TOKEN_SEPOLIA",
    "B10_TOKEN_BASE_SEPOLIA",
    "USER1_ADDRESS",
    "USER1_PK",
  ];

  const missingEnvVars = requiredEnvVars.filter(
    (varName) => !process.env[varName]
  );
  if (missingEnvVars.length > 0) {
    console.error(
      `Missing required environment variables: ${missingEnvVars.join(", ")}`
    );
    console.error("Please make sure your .env file is properly configured");
    process.exit(1);
  }

  // Example usage
  const params: SignatureParams = {
    sourceChainId: 11155111, // Sepolia
    targetChainId: 84532, // Base Sepolia
    sourceToken: process.env.B10_TOKEN_SEPOLIA!,
    targetToken: process.env.B10_TOKEN_BASE_SEPOLIA!,
    amount: ethers.parseEther("1.0").toString(),
    sender: process.env.USER1_ADDRESS!,
    recipient: process.env.USER1_ADDRESS!,
    privateKey: process.env.USER1_PK!,
  };

  try {
    console.log("Generating bridge signature with parameters:");
    console.log({
      sourceChainId: params.sourceChainId,
      targetChainId: params.targetChainId,
      sourceToken: params.sourceToken,
      targetToken: params.targetToken,
      amount: params.amount,
      sender: params.sender,
      recipient: params.recipient,
      // Don't log the private key
    });

    const { signature, bridgeData } = await generateBridgeSignature(params);
    console.log("\nGenerated Signature:", signature);

    // Verify the signature
    console.log("\nVerifying signature...");
    const verificationResult = await verifySignature(signature, bridgeData);

    if (verificationResult.isValid) {
      console.log("✅ Signature is VALID");
      console.log(`Recovered address: ${verificationResult.recoveredAddress}`);
      console.log(`Expected address: ${verificationResult.expectedAddress}`);
    } else {
      console.log("❌ Signature is INVALID");
      if (verificationResult.error) {
        console.log(`Error: ${verificationResult.error}`);
      } else {
        console.log(
          `Recovered address: ${verificationResult.recoveredAddress}`
        );
        console.log(`Expected address: ${verificationResult.expectedAddress}`);
      }
    }

    // Print mutation example
    console.log("\nGraphQL Mutation Example:");
    console.log(`mutation {
  bridgeToken(
    sourceToken: "${params.sourceToken}"
    targetToken: "${params.targetToken}"
    sourceChainId: ${params.sourceChainId}
    targetChainId: ${params.targetChainId}
    amount: "${params.amount}"
    sender: "${params.sender}"
    recipient: "${params.recipient}"
    signature: "${signature}"
    deadline: ${bridgeData.deadline}
  ) {
    success
    transactionHash
    sourceTxHash
    targetTxHash
    status
    error
  }
}`);
  } catch (error: any) {
    console.error("Error generating signature:", error.message);
    if (error.stack) {
      console.error("\nStack trace:", error.stack);
    }
    process.exit(1);
  }
}

// Export for testing
export { generateBridgeSignature, verifySignature };

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("Script failed:", error);
      process.exit(1);
    });
}
