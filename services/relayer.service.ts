import { ethers } from 'ethers';
import { EventData } from '../types';
import { ChainService } from './chain.service';
import { Validator } from './validator.service';

export class Relayer {
  constructor(
    private chainService: ChainService,
    private validator: Validator,
    private walletPrivateKey: string
  ) {}

  public async processEvent(eventData: EventData) {
    try {
      // Sign the message
      const signature = await this.validator.signMessage(eventData);
      
      // Get target chain contract
      const targetContract = this.chainService.getBridgeContract(eventData.targetChainId);
      const wallet = new ethers.Wallet(this.walletPrivateKey, this.chainService.getProvider(eventData.targetChainId));
      const connectedContract = targetContract.connect(wallet);

      // Submit release transaction
      const tx = await connectedContract.releaseToken(
        eventData.token,
        eventData.recipient,
        eventData.amount,
        // eventData.nonce,
        eventData.sourceChainId,
        signature
      );

      await tx.wait();
      console.log(`Tokens released on chain ${eventData.targetChainId}. Tx: ${tx.hash}`);
    } catch (error) {
      console.error('Error processing event:', error);
      throw error;
    }
  }
}