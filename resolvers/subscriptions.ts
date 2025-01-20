import { AddressLike } from "ethers";
import { pubsub } from '../services/pubsub.service';
export const subscriptions = {
    Subscription: {
        bridgeTransactionUpdated: {
            subscribe: (_: any, { address }: { address: AddressLike}) =>
                pubsub.asyncIterableIterator([`TRANSACTION_UPDATED_${address.toString().toLowerCase()}`])
        }
    }
}