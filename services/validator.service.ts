import { ethers } from 'ethers';
import { EventData } from '../types';

export class Validator {
  constructor(private privateKey: string) {}

  public async signMessage(eventData: EventData): Promise<string> {
    const wallet = new ethers.Wallet(this.privateKey);
    
    const messageHash = ethers.solidityPackedKeccak256(
      ['address', 'address', 'uint256', 'uint256', 'uint256'],
      [
        eventData.token,
        eventData.recipient,
        eventData.amount,
        // eventData.nonce,
        eventData.sourceChainId,
        eventData.targetChainId
      ]
    );

    return wallet.signMessage(ethers.getBytes(messageHash));
  }
}
