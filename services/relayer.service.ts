import { ethers } from 'ethers';
import { EventData } from '../types';
import { ChainService } from './chain.service';
import { Validator } from './validator.service';
import { BridgeService } from './bridge.service';

export class Relayer {
  constructor(
    private chainService: ChainService,
    private validator: Validator,
    private walletPrivateKey: string
  ) {}

  public async processEvent(eventData: EventData) {
    try {
      const bridgeService = new BridgeService();
      // Sign the message
      const signature = await this.validator.signMessage(eventData);
      const wallet = new ethers.Wallet(this.walletPrivateKey, this.chainService.getProvider(eventData.targetChainId));
      return await bridgeService.releaseToken(eventData.sourceChainId, eventData.targetChainId, wallet,eventData.token, eventData.recipient,parseInt(eventData.amount),signature);
    } catch (error) {
      console.error('Error processing event:', error);
      throw error;
    }
  }
}