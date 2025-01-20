import axios from "axios";
import { fetchCoinMarketData, fetchPrice } from "../services/price.service";
import { bridgeTokens } from "../services/bridge.service";
import { BridgeRequest } from "../interfaces/requests";
import("dotenv/config");

export const mutation = {
    Mutation: {
        // Fetch current market data for a specific coin
        async bridgeToken(_: any, { bridgeRequest }: { bridgeRequest: BridgeRequest }) {
            return await bridgeTokens(bridgeRequest)
                .then((res) => res)
                .catch((err: Error) => {
                    console.error(err);
                    throw err;
                });
        },

        async getCoinPrice(_: any, { id }: { id: number }) {
            return await fetchPrice(id)
                .then((res) => res)
                .catch((err: Error) => {
                    console.error(err);
                    throw err;
                });
        }
    }
}