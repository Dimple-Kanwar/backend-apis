import axios from "axios";
import { fetchCoinMarketData, fetchPrice } from "../services/price.service";
import { BridgeRequest } from "../interfaces/requests";
import { BridgeService } from "../services/bridge.service";
import("dotenv/config");

export const mutation = {
    Mutation: {
        // TO DO
        async bridgeToken(_: any, { bridgeRequest }: { bridgeRequest: BridgeRequest }) {
            const bridgeService = new BridgeService();
            return await bridgeService.lockToken({ sourceChainId: bridgeRequest.sourceToken.chainId, targetChainId: bridgeRequest.destinaionToken.chainId, token: bridgeRequest.sourceToken.token, amount: bridgeRequest.sourceToken.amount, recipient: bridgeRequest.destinaionToken.account })
                .then((res: any) => res)
                .catch((err: Error) => {
                    console.error(err);
                    throw err;
                });
        }
    }
}