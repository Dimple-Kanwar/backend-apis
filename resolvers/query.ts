import axios from "axios";
import { fetchCoinMarketData, fetchPrice } from "../services/price.service";
import("dotenv/config");

export const query = {
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
        }
    }
}