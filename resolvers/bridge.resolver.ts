import { fetchCoinMarketData, fetchPrice } from "../services/price.service";
import { BridgeRequest } from "../interfaces/requests";
import { BridgeService } from "../services/bridge.service";
import { pubsub } from "../services/pubsub.service";
import { AddressLike } from "ethers";
import { CHAIN_CONFIGS } from "../config/chains";
import { ChainService } from "../services/chain.service";
import("dotenv/config");

export const BridgeResolvers = {
    Mutation: {
        async bridgeToken(_: any, { bridgeRequest }: { bridgeRequest: BridgeRequest }) {
            const bridgeService = new BridgeService();
            return await bridgeService.lockToken({ sourceChainId: bridgeRequest.sourceToken.chainId, targetChainId: bridgeRequest.destinaionToken.chainId, token: bridgeRequest.sourceToken.token, amount: bridgeRequest.sourceToken.amount, recipient: bridgeRequest.destinaionToken.account })
                .then((res: any) => res)
                .catch((err: Error) => {
                    console.error(err);
                    throw err;
                });
        }
    },
    Query: {
        // Fetch current market data for a specific coin
        async getCoinMarketData(_: any, { id, vs_currency }: { id: string, vs_currency: string }) {
            return await fetchCoinMarketData(id, vs_currency)
                .then((res) => res)
                .catch((err: Error) => {
                    console.error(err);
                    throw err;
                });
        },

        async getCoinPrice(_: any, { id }: { id: string }) {
            return await fetchPrice(id)
                .then((res) => res)
                .catch((err: Error) => {
                    console.error(err);
                    throw err;
                });
        },

        supportedChains: async () => {
            const chainService = new ChainService(CHAIN_CONFIGS);
            return await chainService.getSupportedChains()
                .then((res) => res)
                .catch((err: Error) => {
                    console.error(err);
                    throw err;
                });
        }
    },
    Subscription: {
        bridgeTransactionUpdated: {
            subscribe: (_: any, { address }: { address: AddressLike }) =>
                pubsub.asyncIterableIterator([`TRANSACTION_UPDATED_${address.toString().toLowerCase()}`])
        }
    }
}