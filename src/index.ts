import { writeFile} from "fs";
import * as json2csv from "json2csv";
import * as Moment from "moment";

import * as c from "../config.json";
import { Currency, dateFormat, IComputedTransaction, IParsedTransaction, IRawTransaction, TxType } from "./constants";
import { ethPrices } from "./ethPrices";
import { getTransactions , parseTransactions } from "./transactions";
import { IConfig } from "./typings/config";

// TODO: this should be done properly
const config = c as IConfig;

const code = async () =>  {
    const txsRaw = await getTransactions(config.wallets);
    txsRaw.sort(sortTable);
    const txsParsed = parseTransactions(txsRaw);
    const txsFinal = await computeTransactions(txsParsed);
    writeToFile(txsFinal);

};

code().catch((err) => console.log(err));

const sortTable = (a: IRawTransaction, b: IRawTransaction): number => {
    const timeStampA = parseInt(a.timeStamp, 10);
    const timeStampB = parseInt(b.timeStamp, 10);
    return timeStampA - timeStampB;
};

const computeTransactions = async (transactions: IParsedTransaction[]): Promise<IComputedTransaction[]> => {
    const prices = await ethPrices(transactions[0].date.format(dateFormat), Currency.USD);

    const txs = transactions.map((tx) => {
        const txDate = tx.date.format(dateFormat);
        const ethPrice = prices[txDate];

        let localTo = undefined !== config.wallets.find((elm) => {
            return elm.toLowerCase() === tx.to;
        });

        localTo = localTo || undefined !== config.contracts.find((elm) => {
            return elm.toLowerCase() === tx.to;
        });

        const localFrom = undefined !== config.wallets.find((elm) => {
            return elm.toLowerCase() === tx.from;
        });

        let txType: TxType = null;
        if (localFrom && localTo) {
            txType = TxType.LOCAL;
        } else if (localFrom) {
            txType = TxType.OUTGOING;
        } else if (localTo) {
            txType = TxType.INCOMING;
        } else {
            throw new Error("transaction not FROM nor TO our wallet");
        }

        // we omit incomming filed transactions
        if (txType === TxType.INCOMING && tx.txFailed) {
            return null;
        }

        return {
            date: txDate,
            hash: tx.hash,
            txCostFiat: txType === TxType.INCOMING ? "0" : tx.gasEth.times(ethPrice).toFixed(4),
            txValueFiat: tx.txFailed ? "0" : tx.value.times(ethPrice).toFixed(4),
            type: txType,
        };
    });

    const res = txs.filter((tx) => tx !== null);
    return Promise.resolve(res);
};

const writeToFile = (transactions: any) => {
    const fields = ["hash", "date", "txCostFiat", "txValueFiat", "type"];
    const csv = json2csv({ data: transactions, fields });

    writeFile("./outcome/transactions.csv", csv, (err) => {
        if (err) {
            throw err;
        }
        console.log("file saved");
    });
};
