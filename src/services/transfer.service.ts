import { LogUtil, FetchUtil } from "../lib";
import { TransferCollection } from "../collections";
import { ResultCode, Settings } from "../models";
import { CoinService } from "./coin.service";

export class _TransferService {

    public async getTransferByTxinfo(txId: string, address: string, amount: number) {
        if (!txId || !address || !Number(amount)) {
            return undefined;
        }

        let transfer;
        let transferCollection;
        try {
            transferCollection = await TransferCollection.getInstance();
            transfer = await transferCollection.findOne({ txId: txId, toAddress: address, amount: amount });
        } catch (err) {
            LogUtil.error({ e: err.message });
            return;
        }

        return transfer;
    }

    public async getWithdrawTransfer(_id: string) {
        if (!_id) {
            LogUtil.error({ e: 'getTransferById(): _id is undefined. '});
            return undefined;
        }

        let transfer;
        let transferCollection;
        try {
            transferCollection = await TransferCollection.getInstance();
            transfer = await transferCollection.findOne({ _id: _id, status: 101, txId: undefined });
        } catch (err) {
            LogUtil.error({ e: err.message });
            return;
        }

        return transfer;
    }

    // 코인 입출금 확정
    public async checkDisapprovalTransfer(assetCode: string) {
        if (!assetCode) {
            return { code: ResultCode.ERROR }
        }

        // status 101 (대기중)인 transfer 가져옴.
        let transferCollection = await TransferCollection.getInstance();
        let disapprovalTransferList = await transferCollection.find({ assetCode: assetCode, status: 101 }).toArray();

        if (disapprovalTransferList.length != 0) {
            LogUtil.info({ i: 'unconfirmed:' + assetCode + '(' + disapprovalTransferList.length + ')' });
        }

        for (let i = 0; i < disapprovalTransferList.length; i++) {
            if (!disapprovalTransferList[i].txId) {
                continue;
            }

            // 입/출금이 확정되었는지 확인
            if (!await CoinService.isConfirmedTx(assetCode, disapprovalTransferList[i].txId)) {
                continue;
            }

            // HTTP GET method 호출 -> ventas-new-api
            FetchUtil.get(Settings.API_SERVER + '/blk/' + assetCode + '/' + disapprovalTransferList[i].txId + '/' + disapprovalTransferList[i].kind + '/' + Settings.API_PRIVATE_KEY);
            LogUtil.info({ i: 'fetch: confirmed. ' + assetCode + '[' + disapprovalTransferList[i].txId + '][' + disapprovalTransferList[i].kind + ']' }, true);
        }
    }

    public async cancelTransfer(_id: string) {
        if (!_id) {
            LogUtil.error({ e: 'cancelTransfer(): invalid param.' })
            return { code: ResultCode.ERROR }
        }

        let result;
        try {
            let transferCollection = await TransferCollection.getInstance();            
            result = await transferCollection.updateOne({ _id: _id }, { $set: { status: 105 } });

            if (!result) {
                LogUtil.error({ e: 'updateTxid(): updating transfer is failed.' })
                return { code: ResultCode.ERROR }
            }

        } catch (err) {
            LogUtil.error({ e: 'cancelTransfer(): ' + err.message })
            return { code: ResultCode.ERROR }
        }

        return { code: ResultCode.SUC }
    }

    public async updateTxid(_id: string, txId: string) {
        if (!_id || !txId) {
            LogUtil.error({ e: 'updateTxid(): invalid param.', _id, txId })
            return { code: ResultCode.ERROR }
        }

        let result;
        try {
            let transferCollection = await TransferCollection.getInstance();                        
            result = await transferCollection.updateOne({ _id: _id }, { $set: { txId: txId } });

            if (!result) {
                LogUtil.error({ e: 'updateTxid(): updating transfer is failed.', _id, txId })
                return { code: ResultCode.ERROR }
            }

        } catch (err) {
            LogUtil.error({ e: 'updateTxid(): ' + err.message })
            return { code: ResultCode.ERROR }
        }

        return { code: ResultCode.SUC }
    }
}
export const TransferService = new _TransferService();