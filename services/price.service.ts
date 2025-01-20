import axios from "axios";

export const fetchPrice = async (id: string) => {
    return await axios.get(`${process.env.COINGECKO_BASE_URL}/coins/`, {
        headers: {
            'x-api-key': process.env.COINGECKO_API_KEY
        },
        params: {
            id
        }
    }).then((response) => {
        return response.data;
    }).catch((err: Error) => {
        console.log("Failed to receive market price from api. Error: ", err);
        throw err;
    })
}

export const fetchCoinMarketData = async (id: string, vs_currency: string) => {
    return await axios.get(`${process.env.COINGECKO_BASE_URL}/coins/markets`, {
        params: {
            vs_currency,
            ids: id
        },
        headers: {
            'x-api-key': process.env.COINGECKO_API_KEY
        }
    }).then((response) => {
        return response.data[0];
    }).catch((err: Error) => {
        console.error("Failed to fetch coin market data. Error: ", err);
        throw err;
    });
}