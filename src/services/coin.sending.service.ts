import { LogUtil, DecimalUtil, FetchUtil, CommonUtil } from "../lib";
import { ResultCode, Settings, Token } from "../models";
import { TransferService } from "./transfer.service";
import { CoinService } from "./coin.service";
import { TokenService } from "./token.service";



export class _CoinSendingService {
    
    public async sendCoin(assetCode: string, toAddress: string, amount: number, userId: string, transferId: string, destTag?: string) {
        if (!assetCode || !toAddress || !Number(amount) || Number(amount) < 0 || !userId || !transferId) {
            LogUtil.error({ e: "sendCoin(): invalid param." });
            return { code: ResultCode.ERROR }
        }        

        let result;
        let tokenInfo = await TokenService.getTokenInfo(assetCode);

        // ERC20 기반
        if(tokenInfo){
            result = await this.sendERC20Token(assetCode, toAddress, amount, transferId, tokenInfo);
        } else { // 그 외
            switch (assetCode) {
                case 'VENC':
                case 'BTC':
                case 'LTC':
                case 'QTUM':
                case 'BCH':
                    result = await this.sendBitcoin(assetCode, toAddress, amount);
                    break;
                case 'ETH':
                    result = await this.sendEth(assetCode, toAddress, amount, transferId);
                    break;
                case 'XMR':
                    result = await this.sendXmr(assetCode, toAddress, amount);
                    break;
                case 'ADA':
                    result = await this.sendAda(assetCode, toAddress, amount);
                    break;
                case 'XRP':
                    result = await this.sendXrp(assetCode, toAddress, amount, destTag);
                    break;            
                case 'BLOOD':
                    result = await this.sendBlood(toAddress, amount);
                    break;            
                case 'STI':
                    result = await this.sendSti(assetCode, toAddress, amount);
                    break;              
            }
        }

        if (!result || result.code != 200) {
            LogUtil.error({ e: "sendCoin(): coin is failed." });
            await TransferService.cancelTransfer(transferId);
            return { code: ResultCode.ERROR };
        }

        // 이더리움은 await으로 txId를 꺼낼 수 없기 때문에 따로 txId를 업데이트 한다. 
        if (assetCode == 'ETH' || tokenInfo) {
            return { code: ResultCode.SUC };
        }

        let txId = result.txId;

        // 2. Transfer txid update.
        result = await TransferService.updateTxid(transferId, txId);
        if (!result || result.code != 200) {
            LogUtil.error({ e: "sendCoin(): updating txId is failed.", transferId, txId });
            return { code: ResultCode.ERROR };
        }

        return { code: ResultCode.SUC };
    }
    
    private async sendEth(assetCode: string, toAddress: string, amount: number, transferId: string) {
        if (!assetCode || !toAddress || !Number(amount)) {
            LogUtil.error({ e: "sendEth(): invalid param." });
            return { code: ResultCode.ERROR }
        }

        let result;
        let client;

        try {
            client = CoinService.getEthClient();
            if (!client) {
                LogUtil.error({ e: "sendEth(): client is undefined." });
                return { code: ResultCode.ERROR };
            }

            let cfg = Settings.COIN_CONFIGS['ETH'];
            if (!cfg || !cfg.password) {
                LogUtil.error({ e: "sendEth(): cfg is undefined.", cfg });
                return { code: ResultCode.ERROR };
            }
            
            let coinbase = '0x946a5953178c97ae6d194c6c28f70d712f0fc2f6';

            result = await client.eth.personal.unlockAccount(coinbase, cfg.password);
            if (!result) {
                LogUtil.error({ e: "sendEth(): unlockAccount is failed." });
                return { code: ResultCode.ERROR };
            }

            client.eth.sendTransaction({ from: coinbase, to: toAddress, value: DecimalUtil.mul(amount, 100000000).toFixed() + "0000000000" })
                .then((receipt) => {
                    if (!receipt) {
                        LogUtil.error({ e: "sendEth(): receipt is undefined.", transferId });
                    }

                    TransferService.updateTxid(transferId, receipt.transactionHash);
                    LogUtil.info({ i: 'sendded: ETH[' + receipt.transactionHash + ']' }, true);
                });

            LogUtil.info({ i: ' sendCoin: ' + assetCode + '(' + amount + ') -> ' + toAddress }, true);

        } catch (err) {
            LogUtil.error({ e: 'sendEth()' + err.message });
            return { code: ResultCode.ERROR };
        }

        return { code: ResultCode.SUC };
    }

    private async sendBitcoin(assetCode: string, toAddress: string, amount: number) {
        if (!assetCode || !toAddress || !Number(amount)) {
            LogUtil.error({ e: "sendBitcoin(): invalid param." });
            return { code: ResultCode.ERROR }
        }

        let result;
        let client;

        try {
            client = CoinService.getBitcoinClient(assetCode);
            if (!client) {
                LogUtil.error({ e: "sendBitcoin(): client is undefined." });
                return { code: ResultCode.ERROR };
            }

            result = await client.sendToAddress(toAddress, amount);
            if (!result) {
                LogUtil.error({ e: "sendBitcoin(): sendToAddress is failed." });
                return { code: ResultCode.ERROR };
            }

            LogUtil.info({ i: ' sendCoin: ' + assetCode + '(' + amount + ') -> ' + toAddress }, true);

        } catch (err) {
            LogUtil.error({ e: 'sendBitcoin()' + err.message });
            return { code: ResultCode.ERROR };
        }

        return { code: ResultCode.SUC, txId: result };
    }

    private async sendXmr(assetCode: string, toAddress: string, amount: number) {
        if (!assetCode || assetCode != 'XMR' || !toAddress || !Number(amount)) {
            LogUtil.error({ e: "sendXmr(): invalid param." });
            return { code: ResultCode.ERROR }
        }

        let url = CoinService.getXmrRPCUrl();
        let txId;

        try {
            let fetchRes = await FetchUtil.post(url, {
                jsonrpc: "2.0",
                id: "0",
                method: "transfer",
                params: {
                    destinations: [
                        {
                            amount: Math.floor(DecimalUtil.mul(amount, 100000000) * 10000),
                            address: toAddress,
                            unlock_time: 0
                        }
                    ]
                }
            });

            if (!fetchRes || !fetchRes.result || !fetchRes.result.tx_hash) {
                LogUtil.error({ e: 'sendXmr(): result is undefined.', fetchRes });
                return { code: ResultCode.ERROR };
            }
            txId = fetchRes.result.tx_hash;

            LogUtil.info({ i: ' sendCoin: ' + assetCode + '(' + amount + ') -> ' + toAddress }, true);

        } catch (err) {
            LogUtil.error({ e: 'sendXmr()' + err.message });
            return { code: ResultCode.ERROR };
        }

        return { code: ResultCode.SUC, txId: txId };
    }

    private async sendAda(assetCode: string, toAddress: string, amount: number) {
        if (!assetCode || assetCode != 'ADA' || !toAddress || !Number(amount)) {
            LogUtil.error({ e: "sendAda(): invalid param." });
            return { code: ResultCode.ERROR }
        }

        let cfg = Settings.COIN_CONFIGS[assetCode];
        if (!cfg || !cfg.port || !cfg.host || !cfg.accountIndex || !cfg.walletId) {
            LogUtil.error({ e: "sendAda(): cfg is undefined.", cfg });
            return undefined;
        }

        let url = 'http://' + cfg.host + ':' + cfg.port + '/api/v1/transactions';
        let txId;

        try {
            let fetchRes = await FetchUtil.post(url, {
                destinations: [
                    {
                        amount: DecimalUtil.mul(amount, 1000000),
                        address: toAddress
                    }
                ],
                source: {
                    accountIndex: cfg.accountIndex,
                    walletId: cfg.walletId
                }
            });

            if (!fetchRes || fetchRes.status != 'success' || !fetchRes.data || !fetchRes.data || !fetchRes.data.id) {
                LogUtil.error({ e: 'sendAda(): result is undefined.', fetchRes });
                return { code: ResultCode.ERROR };
            }
            txId = fetchRes.data.id;

            LogUtil.info({ i: ' sendCoin: ' + assetCode + '(' + amount + ') -> ' + toAddress }, true);

        } catch (err) {
            LogUtil.error({ e: 'sendAda()' + err.message });
            return { code: ResultCode.ERROR };
        }

        return { code: ResultCode.SUC, txId: txId };
    }

    private async sendXrp(assetCode: string, toAddress: string, amount: number, destTag: string) {
        if (!assetCode || assetCode != 'XRP' || !toAddress || !destTag || !Number(amount) || Number(amount) < 0) {
            LogUtil.error({ e: "sendXrp(): param is undefined.", assetCode, toAddress, destTag, amount });
            return { code: ResultCode.ERROR }
        }

        let client = await CoinService.getXrpClient();
        if (!client) {
            LogUtil.error({ e: "sendXrp(): client is undefined." });
            return { code: ResultCode.ERROR }
        }

        let cfg = Settings.COIN_CONFIGS['XRP'];
        if (!cfg || !cfg.accountId || !cfg.secret) {
            LogUtil.error({ e: "sendXrp(): cfg is undefined.", cfg });
            return { code: ResultCode.ERROR }
        }

        let myAddress = cfg.accountId;
        let secret = cfg.secret;
        let payment = {
            source: {
                address: myAddress,
                maxAmount: {
                    value: String(amount),
                    currency: "XRP"
                }
            },
            destination: {
                address: toAddress,
                amount: {
                    value: String(amount),
                    currency: "XRP"
                },
                tag: destTag
            }
        }

        let txId;
        try {
            let result = await client.preparePayment(myAddress, payment);
            if (!result || !result.txJSON) {
                LogUtil.error({ e: "sendXrp(): preparePayment is failed. ", result });
                return { code: ResultCode.ERROR };
            }

            result = await client.sign(result.txJSON, secret);
            if (!result || !result.signedTransaction) {
                LogUtil.error({ e: "sendXrp(): sign is failed. ", result });
                return { code: ResultCode.ERROR };
            }

            result = await client.submit(result.signedTransaction);
            if (!result || result.resultCode != 'tesSUCCESS' || !result.tx_json) {
                LogUtil.error({ e: "sendXrp(): sign is failed. ", result });
                return { code: ResultCode.ERROR };
            }

            txId = result.tx_json.hash;

            LogUtil.info({ i: ' sendCoin: ' + assetCode + '(' + amount + ') -> ' + toAddress + ' : ' + destTag }, true);
        } catch (err) {
            LogUtil.error({ e: "sendXrp(): " + err.message });
            return { code: ResultCode.ERROR };
        }

        return { code: ResultCode.SUC, txId: txId }
    }    

    private async sendBlood(toAddress: string, amount: number) {
        if (!toAddress || !Number(amount)) {
            LogUtil.error({ e: "sendBlood(): param is invalid.", toAddress, amount });
            return { code: ResultCode.ERROR };
        }

        let cfg = Settings.COIN_CONFIGS['BLOOD'];
        if (!cfg || !cfg.host || !cfg.apiKey) {
            LogUtil.error({ e: "sendBlood(): cfg is invalid.", cfg });
            return undefined;
        }

        let result;
        try {
            result = await FetchUtil.post(cfg.host, {
                method: "sendfromaccount",
                params: [
                    cfg.account,
                    toAddress,
                    amount
                ],
                id: 1,
                jsonrpc: "1.0",
                apikey: cfg.apiKey
            })

            if (result.error || !result.result) {
                LogUtil.error({ e: "sendBlood(): sending coin is failed.", result });
                return { code: ResultCode.ERROR }
            }

        } catch (err) {
            LogUtil.error({ e: "sendBlood(): " + err.message });
            return { code: ResultCode.ERROR }
        }

        return { code: ResultCode.SUC, txId: result.result };
    }

    private async sendERC20Token(assetCode: string, toAddress: string, amount: number, transferId: string, tokenInfo: Token){
        if (!assetCode || !toAddress || !Number(amount) || !transferId) {
            LogUtil.error({ e: "sendERC20Token(): invalid param.", assetCode, toAddress, amount, transferId });
            return { code: ResultCode.ERROR }
        }

        let result;
        let client;
        try {
            client = CoinService.getEthClient();
            if (!client) {
                LogUtil.error({ e: "sendERC20Token(): client is undefined." });
                return { code: ResultCode.ERROR };
            }
            
            if (!tokenInfo || !tokenInfo.coinbase || !tokenInfo.basePw || !tokenInfo.decimal) {
                LogUtil.error({ e: "sendERC20Token(): cfg is undefined.", tokenInfo });
                return { code: ResultCode.ERROR };
            }

            result = await client.eth.personal.unlockAccount(tokenInfo.coinbase, tokenInfo.basePw);
            if (!result) {
                LogUtil.error({ e: "sendERC20Token(): unlockAccount is failed." });
                return { code: ResultCode.ERROR };
            }

            let abi = CommonUtil.getEthJSONAbi();
            let contract = new client.eth.Contract(abi, tokenInfo.contract);

            let tokenAmount = DecimalUtil.mul(amount, 100000000);                
            for(let i = 0; i < tokenInfo.decimal - 8; i++){
                tokenAmount += '0';
            }

            contract.methods.transfer(toAddress, tokenAmount).send({ from: tokenInfo.coinbase }).then((receipt) => {
                if (!receipt || !receipt.transactionHash || !receipt.status) {
                    LogUtil.error({ e: "sendERC20Token(): receipt is undefined.", transferId, receipt });
                }

                TransferService.updateTxid(transferId, receipt.transactionHash);
                LogUtil.info({ i: 'sendded: ' + tokenInfo.assetCode + '[' + receipt.transactionHash + ']' }, true);
            })

            LogUtil.info({ i: ' sendCoin: ' + assetCode + '(' + amount + ') -> ' + toAddress }, true);

        } catch (err) {
            LogUtil.error({ e: 'sendERC20Token()' + err.message });
            return { code: ResultCode.ERROR };
        }

        return { code: ResultCode.SUC };
        
    }

    public async sendSti(assetCode: string, toAddress: string, amount: number) {
        if (!assetCode || assetCode != 'STI' || !toAddress || !Number(amount)) {
            LogUtil.error({ e: "sendSti(): invalid param." });
            return { code: ResultCode.ERROR }
        }

        let cfg = Settings.COIN_CONFIGS[assetCode];
        if (!cfg || !cfg.port || !cfg.host || !cfg.walletId) {
            LogUtil.error({ e: "sendSti(): cfg is undefined.", cfg });
            return undefined;
        }

        let url = 'http://' + cfg.host + ':' + cfg.port;
        let txId;       

        try {
            let fetchRes = await FetchUtil.post(url, {
                action: "send",  
                wallet: cfg.walletId,
                source: cfg.account,
                destination: toAddress,
                amount: DecimalUtil.mul(amount, 100000000) + '0000000000000000',
                symbol: "STI",
                fcode: " "
            });

            if (!fetchRes || !fetchRes.block) {
                LogUtil.error({ e: 'sendSti(): result is undefined.', fetchRes });
                return { code: ResultCode.ERROR };
            }            
            
            txId = fetchRes.block;            

            LogUtil.info({ i: ' sendSti: ' + assetCode + '(' + amount + ') -> ' + toAddress });

        } catch (err) {
            LogUtil.error({ e: 'sendSti()' + err.message });
            return { code: ResultCode.ERROR };
        }

        return { code: ResultCode.SUC, txId: txId };
    }

    
}
export const CoinSendingService = new _CoinSendingService();