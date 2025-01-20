import axios from "axios";
import { fetchCoinMarketData, fetchPrice } from "../services/price.service";
import { BridgeRequest } from "../interfaces/requests";
import { BridgeService } from "../services/bridge.service";
import("dotenv/config");

export const mutation = {
    Mutation: {
        // Fetch current market data for a specific coin
        async lockToken(_: any, { bridgeRequest }: { bridgeRequest: BridgeRequest }) {
            const bridgeService = new BridgeService();
            return await bridgeService.lockToken({ sourceChainId: bridgeRequest.sourceToken.chainId, targetChainId: bridgeRequest.destinaionToken.chainId, token: bridgeRequest.sourceToken.token, amount: bridgeRequest.sourceToken.amount, recipient: bridgeRequest.destinaionToken.account })
                .then((res: any) => res)
                .catch((err: Error) => {
                    console.error(err);
                    throw err;
                });
        },

        async getCoinPrice(_: any, { id }: { id: number }) {
            return await fetchPrice(id.toString())
                .then((res) => res)
                .catch((err: Error) => {
                    console.error(err);
                    throw err;
                });
        }
    }
}