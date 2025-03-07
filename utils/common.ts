import { ethers } from "ethers";

// Generate hash for locking tokens
export const generateLockHash = async(
    sourceToken: string,
    targetToken: string,
    sender: string,
    recipient: string,
    amount: string,
    nonce: number,
    sourceChainId: number,
    targetChainId: number
) => {
    return ethers.solidityPackedKeccak256(['address', 'address','address', 'address', 'uint256', 'uint256', 'uint256', 'uint256', 'uint256'], [
        sourceToken,
        targetToken,
        sender,
        recipient,
        ethers.parseEther(amount),
        nonce,
        Math.floor(Date.now() / 1000), // Current timestamp
        sourceChainId,
        targetChainId]
    );
}

// Generate hash for releasing tokens
export const generateReleaseHash = async(
    token: string,
    sender: string,
    recipient: string,
    amount: ethers.BigNumberish,
    nonce: number,
    lockTxHash: string,  // Hash of the original lock transaction
    sourceChainId: number,
    targetChainId: number
) => {
    return ethers.solidityPackedKeccak256(['address', 'address', 'address', 'uint256', 'uint256', 'uint256', 'bytes32', 'uint256', 'uint256'], [
        token,
        sender,
        recipient,
        amount,
        nonce,
        Math.floor(Date.now() / 1000), // Current timestamp
        lockTxHash,
        sourceChainId,
        targetChainId]
    );
}

export const generateNonce = async(address: string): Promise<number> => {
    return parseInt(
        ethers.solidityPackedKeccak256(
            ['address', 'uint256', 'uint256'],
            [address, Date.now(), Math.floor(Math.random() * 1000000)]
        ).slice(2, 10),
        16
    );
}