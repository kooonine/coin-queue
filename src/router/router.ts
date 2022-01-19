import * as express from "express";
import { LogUtil, FetchUtil, DecimalUtil } from "../lib";
import { CoinService, TransferService, CoinAddressService, CoinSendingService, CoinBalanceService, UserWalletService } from "../services";
import { ResultCode, Settings } from "../models";

var bodyParser = require('body-parser')

// express 예외 처리 코드 추가 필요.
class _ExpressRouter {
    app = express();
    sendingLock = {}

    init() {
        this.listen(3100);
        this.app.use(bodyParser.json())
        this.routeCoinHash();
        this.routeCoinAddr();
        this.routeCoinSending();
        this.routeCoinBalance();
        this.routeStiCoinHash();
    }

    listen(port: number) {
        this.app.listen(port, () => {
            console.log('ventas-coin-queue listening on port ' + port + '!');
        });
    }

    // block 알람을 받아 입금 확인 및 입출금 확정
    routeCoinHash() {
        this.app.get('/blk/:_coinCode/:_hash/:_privateKey', async (req: express.Request, res: express.Response) => {
            if (!req.params._privateKey || req.params._privateKey != 'Vent@sPriv@teKey12291!') {
                LogUtil.error({ e: 'invalid private key.' });
                res.end();
                return;
            }

            LogUtil.info({ i: 'noti:' + req.params._coinCode + '[' + req.params._hash + ']' });

            // 입출금 확정
            await TransferService.checkDisapprovalTransfer(req.params._coinCode);

            // 입금 확인
            await CoinService.checkTransactions(req.params._coinCode, req.params._hash);

            // ADA 자동 체크
            if (req.params._coinCode == 'XMR') {
                await TransferService.checkDisapprovalTransfer('ADA');
                await CoinService.checkTransactions('ADA', req.params._hash);
            }

            res.end();
        });
    }

    routeStiCoinHash() {
        this.app.post('/blk/STI', async (req: express.Request, res: express.Response) => {
            let body = req.body;
            if (!body) {                
                res.end();
                return;
            };

            LogUtil.info({ i: 'noti:STI[' + body.hash + ']' });

            if (body.is_send == 'true') {
                await TransferService.checkDisapprovalTransfer('STI');
                res.end();
                return;
            }

            // 입출금 확정
            let amount = body.amount;
            let toAddress = body.account;
            let hash = body.hash;

            if (!toAddress || !hash || !amount) {
                LogUtil.error({ e: 'notiSti: param is undefined.', amount, toAddress, hash });
                res.end();
                return;
            }

            amount = DecimalUtil.div(amount, Math.pow(10, 24));

            let transfer = await TransferService.getTransferByTxinfo(hash, toAddress, amount);
            if (transfer) {
                LogUtil.error({ e: 'notiSti: transfer is exist.', transfer });
                res.end();
                return;
            }

            // tx안의 받는 사람 주소가 회원 주소인지 체크
            let isMyAddress = await UserWalletService.isMyAddress('STI', toAddress);
            if (!isMyAddress) {                
                res.end();
                return;
            }

            FetchUtil.get(Settings.API_SERVER + '/blk/STI/' + hash + '/deposit/' + Settings.API_PRIVATE_KEY);
            LogUtil.info({ i: 'fetch: depositSTI[' + hash + ']' }, true);

            res.end();
        });
    }
    routeCoinAddr() {
        this.app.get('/coinAddr/:_assetCode/:_userId/:_privateKey', async (req: express.Request, res: express.Response) => {
            if (!req.params._privateKey || req.params._privateKey != 'Vent@sPriv@teKey12291!') {
                LogUtil.error({ e: 'invalid private key.' });
                res.json({ code: ResultCode.ERROR });
                return;
            }
            LogUtil.info({ i: 'coinAddr: ' + req.params._assetCode + '[' + req.params._userId + ']' });
            console.log('여기자니가나');
            console.log(req.params._assetCode);
            
                                            
            let coinAddress = await CoinAddressService.getNewAddress(req.params._assetCode, req.params._userId);

            LogUtil.prod({ p: 'coinAddr: ' + req.params._assetCode + '[' + req.params._userId + '][' + coinAddress + ']' });

            res.json({ code: ResultCode.SUC, result: coinAddress });
        });
    }

    routeCoinSending() {
        this.app.get('/send/:_assetCode/:_toAddress/:_amount/:_transferId/:_privateKey', async (req: express.Request, res: express.Response) => {
            if (!req.params._privateKey || req.params._privateKey != 'Vent@sPriv@teKey12291!') {
                LogUtil.error({ e: 'invalid private key.' });
                res.json({ code: ResultCode.ERROR });
                return;
            }
            LogUtil.info({ i: 'coinSending: ' + req.params._assetCode + '(' + req.params._amount + ')[' + req.params._toAddress + '][' + req.params._transferId + ']' });

            if (this.sendingLock[req.params._transferId]) {
                return;
            }

            this.sendingLock[req.params._transferId] = true;

            let withdrawTransfer = await TransferService.getWithdrawTransfer(req.params._transferId);
            if (!withdrawTransfer) {
                LogUtil.error({ e: 'withdrawTransfer is undefined.' });
                res.json({ code: ResultCode.ERROR });
                return;
            }

            let result = await CoinSendingService.sendCoin(withdrawTransfer.assetCode, withdrawTransfer.toAddress, withdrawTransfer.amount, withdrawTransfer.owner, withdrawTransfer._id, withdrawTransfer.destTag);

            delete this.sendingLock[req.params._transferId];

            res.json(result);
        });
    }

    routeCoinBalance() {
        this.app.get('/balance/:_assetCode/:_privateKey', async (req: express.Request, res: express.Response) => {
            if (!req.params._privateKey || req.params._privateKey != 'Vent@sPriv@teKey12291!') {
                LogUtil.error({ e: 'invalid private key.' });
                res.json({ code: ResultCode.ERROR });
                return;
            }
            LogUtil.info({ i: 'balance: ' + req.params._assetCode });
            let balance = await CoinBalanceService.getCoinBalance(req.params._assetCode);

            LogUtil.info({ i: 'balance: ' + req.params._assetCode + '(' + balance + ')' });
            res.json({ code: ResultCode.SUC, balance });
        });
    }
}

export const ExpressRouter = new _ExpressRouter();





