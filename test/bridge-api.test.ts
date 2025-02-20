import 'dotenv/config';

import { ethers } from 'ethers';
import { MockERC20Token__factory } from '../typechain-types';
import { abi as tokenAbi } from '../artifacts/contracts/MockERC20Token.sol/MockERC20Token.json';
import { CHAIN_CONFIGS } from '../config/chains';

console.log('Chain configs loaded:', CHAIN_CONFIGS);
console.log('Available chain IDs:', Object.keys(CHAIN_CONFIGS));

// Chain configuration types
interface ChainConfig {
  name: string;
  rpcUrl: string;
  chainId: number;
  bridgeAddress: string;
  supportedTokens: {
    [symbol: string]: {
      address: string;
      decimals: number;
    };
  };
  wsRpcUrl: string;
}

interface BridgeTestConfig {
  sourceChain: ChainConfig;
  targetChain: ChainConfig;
  tokenSymbol: string;
  amount: string;
  privateKey: string;
  deadline?: number; // Optional deadline for testing expired signatures
}

// Supported chains
const SUPPORTED_CHAINS = {
  SEPOLIA: 11155111,
  BASE_SEPOLIA: 84532
} as const;

// Helper function to create test configuration
function createTestConfig({
  sourceChainId = SUPPORTED_CHAINS.SEPOLIA,
  targetChainId = SUPPORTED_CHAINS.BASE_SEPOLIA,
  tokenSymbol = 'B10',
  amount = '1.0',
  privateKey = process.env.USER1_PK || '',
  deadline,
}: {
  sourceChainId?: (typeof SUPPORTED_CHAINS)[keyof typeof SUPPORTED_CHAINS],
  targetChainId?: (typeof SUPPORTED_CHAINS)[keyof typeof SUPPORTED_CHAINS],
  tokenSymbol?: string,
  amount?: string,
  privateKey?: string,
  deadline?: number,
} = {}): BridgeTestConfig {
  return {
    sourceChain: CHAIN_CONFIGS[sourceChainId],
    targetChain: CHAIN_CONFIGS[targetChainId],
    tokenSymbol,
    amount,
    privateKey,
    deadline,
  };
}

// Default test configuration
const DEFAULT_CONFIG = createTestConfig();

// Validate chain configuration
function validateChainConfig(config: BridgeTestConfig) {
  const supportedChainIds = Object.values(SUPPORTED_CHAINS) as number[];
  
  if (!supportedChainIds.includes(config.sourceChain.chainId)) {
    throw new Error(`Source chain ${config.sourceChain.name} (${config.sourceChain.chainId}) is not supported. Supported chains: Base Sepolia, Sepolia`);
  }
  
  if (!supportedChainIds.includes(config.targetChain.chainId)) {
    throw new Error(`Target chain ${config.targetChain.name} (${config.targetChain.chainId}) is not supported. Supported chains: Base Sepolia, Sepolia`);
  }
}

// Example values - replace with your actual values

async function generatePermitSignature(
  tokenAddress: string,
  owner: string,
  spender: string,
  value: string,
  deadline: string,
  privateKey: string,
  rpcUrl: string
) {
  console.log('\nGenerating permit signature...');
  console.log('Token:', tokenAddress);
  console.log('Owner:', owner);
  console.log('Spender:', spender);
  console.log('Value:', ethers.formatEther(value), 'B10');
  console.log('Deadline:', new Date(parseInt(deadline) * 1000).toISOString());

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  console.log('Provider:', provider);
  const signer = new ethers.Wallet(privateKey, provider);
  console.log('Signer:', signer);
  const token = new ethers.Contract(tokenAddress, tokenAbi, signer);
  console.log('Token:', token);
  console.log('\nAvailable functions:', token.interface.fragments.filter(f => f.type === 'function').map(f => f.format()).filter(Boolean));

  // Get the EIP712 domain
  const _domain = await token.eip712Domain();
  console.log('\nEIP712 Domain:', _domain);

  // Get the current nonce for the owner
  const nonce = await token.nonces(owner);
  console.log('Current nonce:', nonce);
  
  // Get the chain id
  const chainId = await provider.getNetwork().then(network => network.chainId);
  console.log('Chain ID:', chainId);

  // Get token details
  const name = await token.name();
  console.log('Token name:', name);

  // Create the permit type data
  const domain = {
    name,
    version: '1',
    chainId,
    verifyingContract: tokenAddress
  };

  // The type definition for EIP-2612
  const types = {
    Permit: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'nonce', type: 'uint256' },
      { name: 'deadline', type: 'uint256' }
    ]
  };

  // The permit message data
  const message = {
    owner,
    spender,
    value,
    nonce,
    deadline
  };

  console.log('\nSigning permit with domain:', domain);
  console.log('Message:', message);

  // Sign the permit
  const signature = await signer.signTypedData(domain, types, message);
  console.log('Generated signature:', signature);

  // Verify the permit will work by checking allowance before and simulating permit
  const allowanceBefore = await token.allowance(owner, spender);
  console.log('\nAllowance before:', ethers.formatEther(allowanceBefore));

  // Split signature into v, r, s components for verification
  const sig = ethers.Signature.from(signature);
  
  // Try to verify the signature will work (this will revert if invalid)
  try {
    const tx = await token.permit.populateTransaction(
      owner,
      spender,
      value,
      deadline,
      sig.v,
      sig.r,
      sig.s
    );
    console.log('Permit verification successful! Transaction data:', tx.data);
  } catch (error: any) {
    console.error('Permit verification failed:', error.message);
    throw error;
  }
  
  return signature;
}

async function testBridgeAPI(config: BridgeTestConfig = DEFAULT_CONFIG) {
  // Validate chain configuration
  validateChainConfig(config);
  
  console.log('\nTesting bridge API with config:', JSON.stringify(config, null, 2));
  try {
    const {
      sourceChain,
      targetChain,
      tokenSymbol,
      amount,
      privateKey,
      deadline: configDeadline,
    } = config;

    // Validate configuration
    if (!sourceChain.rpcUrl) {
      throw new Error(`RPC URL not configured for source chain ${sourceChain.name}`);
    }
    if (!sourceChain.bridgeAddress) {
      throw new Error(`Bridge address not configured for source chain ${sourceChain.name}`);
    }
    if (!sourceChain.supportedTokens[tokenSymbol]) {
      throw new Error(`Token ${tokenSymbol} not supported on source chain ${sourceChain.name}`);
    }
    if (!targetChain.supportedTokens[tokenSymbol]) {
      throw new Error(`Token ${tokenSymbol} not supported on target chain ${targetChain.name}`);
    }
    if (!sourceChain.supportedTokens[tokenSymbol].address) {
      throw new Error(`Token ${tokenSymbol} address not configured on source chain ${sourceChain.name}`);
    }
    if (!targetChain.supportedTokens[tokenSymbol].address) {
      throw new Error(`Token ${tokenSymbol} address not configured on target chain ${targetChain.name}`);
    }

    // Setup providers and signer
    const sourceProvider = new ethers.JsonRpcProvider(sourceChain.rpcUrl);
    const signer = new ethers.Wallet(privateKey, sourceProvider);
    const owner = await signer.getAddress();

    // Get token addresses and parse amount
    const sourceToken = sourceChain.supportedTokens[tokenSymbol].address;
    const targetToken = targetChain.supportedTokens[tokenSymbol].address;
    const decimals = sourceChain.supportedTokens[tokenSymbol].decimals;
    const formattedAmount = ethers.parseUnits(amount, decimals);

    // Use provided deadline or set to 1 hour from now
    const deadline = configDeadline || Math.floor(Date.now() / 1000) + 3600;

    console.log(`\nPreparing to bridge ${amount} ${tokenSymbol}`);
    console.log(`From: ${sourceChain.name} (Chain ID: ${sourceChain.chainId})`);
    console.log(`To: ${targetChain.name} (Chain ID: ${targetChain.chainId})`);
    console.log(`Owner Address: ${owner}\n`);

    // Generate the permit signature
    const signature = await generatePermitSignature(
      sourceToken,
      owner,
      sourceChain.bridgeAddress,
      formattedAmount.toString(),
      deadline.toString(),
      privateKey,
      sourceChain.rpcUrl
    );

    // Example GraphQL mutation
    const mutation = `
      mutation BridgeToken($input: BridgeTokenInput!) {
        bridgeToken(input: $input) {
          success
          sourceTxHash
          targetTxHash
          status
          error
        }
      }
    `;

    // Prepare GraphQL mutation variables
    const variables = {
      input: {
        sourceToken,
        targetToken,
        sourceChainId: sourceChain.chainId,
        targetChainId: targetChain.chainId,
        amount: formattedAmount.toString(),
        sender: owner,
        recipient: owner, // Using same address as recipient for testing
        signature
      }
    };

    console.log('\nTest Summary:');
    console.log('Owner Address:', owner);
    console.log('Token Details:');
    console.log('  Source:', sourceToken, `(${sourceChain.name})`);
    console.log('  Target:', targetToken, `(${targetChain.name})`);
    console.log('Amount:', ethers.formatEther(formattedAmount), tokenSymbol);
    console.log('Deadline:', new Date(deadline * 1000).toISOString());
    console.log('\nGenerated Signature:', signature);
    console.log('\nGraphQL Mutation Variables:', JSON.stringify(variables, null, 2));
    
    // To actually send the mutation, you would use your GraphQL client
    // Example with fetch:
    /*
    const response = await fetch('YOUR_GRAPHQL_ENDPOINT', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: mutation,
        variables: variables
      })
    });
    const result = await response.json();
    console.log('API Response:', result);
    */
    
  } catch (error: any) {
    // Check for specific error types
    if (error.message.includes('invalid signature')) {
      console.error('Error: Invalid signature provided');
    } else if (error.message.includes('expired')) {
      console.error('Error: Permit deadline has expired');
    } else if (error.message.toLowerCase().includes('insufficient')) {
      console.error('Error: Insufficient token balance or allowance');
    } else {
      console.error('Error:', error.message);
    }
    throw error; // Re-throw to be caught by the test runner
  }
}

// Example usage with different configurations
async function runTests() {
  try {
    // Test 1: Default configuration (Sepolia -> Base Sepolia)
    console.log('\n=== Test 1: Default Configuration (Sepolia -> Base Sepolia) ===');
    await testBridgeAPI();

    // Test 2: Reverse direction (Base Sepolia -> Sepolia)
    console.log('\n=== Test 2: Reverse Direction (Base Sepolia -> Sepolia) ===');
    await testBridgeAPI(
      createTestConfig({
        sourceChainId: SUPPORTED_CHAINS.BASE_SEPOLIA,
        targetChainId: SUPPORTED_CHAINS.SEPOLIA,
      })
    );

    // Test 3: With expired deadline
    console.log('\n=== Test 3: With Expired Deadline ===');
    const expiredDeadline = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
    await testBridgeAPI(
      createTestConfig({
        deadline: expiredDeadline,
      })
    );

    // Test 4: With different amount
    console.log('\n=== Test 4: With Different Amount ===');
    await testBridgeAPI(
      createTestConfig({
        amount: '5.0',
      })
    );
  } catch (error: any) {
    console.error('Error running tests:', error.message);
    process.exit(1);
  }

  console.log('\nAll permit signature tests completed!');
}

// Run the tests
if (require.main === module) {
  runTests()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Test failed:', error);
      process.exit(1);
    });
}

export { generatePermitSignature, testBridgeAPI };
