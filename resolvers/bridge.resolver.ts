import { BridgeService } from "../services/bridge.service";
import { BridgeTokenInput, BridgeResponse } from "../types";
import { Context } from "../types/context";

export const bridgeResolvers = {
  Mutation: {
    bridgeToken: async (
      _: any,
      {
        sourceToken,
        targetToken,
        sourceChainId,
        targetChainId,
        amount,
        sender,
        recipient,
        signature,
      }: BridgeTokenInput,
      context: Context
    ): Promise<BridgeResponse> => {
      try {
        return await context.bridgeService.bridgeToken({
          sourceToken,
          targetToken,
          sourceChainId,
          targetChainId,
          amount,
          sender,
          recipient,
        });
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error occurred";
        return {
          success: false,
          status: "FAILED",
          error: errorMessage,
        };
      }
    },
  },
};
