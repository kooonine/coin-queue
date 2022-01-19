import { LogUtil, FetchUtil, DecimalUtil, CommonUtil } from "../lib";
import { CoinService } from "./coin.service";
import { Settings, Token } from "../models";
import { TokenService } from "./token.service";
import { UserWalletService } from "./userwallet.service";
import { doesNotReject } from "assert";


export class _CoinBalanceService {
    public async getCoinBalance(assetCode: string) {
        if (!assetCode) {
            LogUtil.error({ e: 'getCoinBalance(): assetCode is undefined. ' });
            return 0;
        }

        switch (assetCode) {
            case 'BTC':
            case 'VENC':
            case 'QTUM':
            case 'LTC':
            case 'BCH':
                return this.getBitcoinBalance(assetCode);
            case 'ETH':
                return this.getEthBalance();
            case 'ADA':
                return this.getAdaBalance();
            case 'XMR':
                return this.getXmrBalance();
            case 'XRP':
                return this.getXrpBalance();
            case 'BLOOD':
                return this.getBloodBalance();
            case 'STI':
                return this.getStiBalance();
        }

        // ERC20 토큰이면.. 
        let tokenInfo = await TokenService.getTokenInfo(assetCode);
        if (tokenInfo) {
            return this.getERC20Balance(tokenInfo);
        }

        return 0;
    }

    private async getERC20Balance(tokenInfo: Token) {
        if (!tokenInfo || !tokenInfo.assetCode || !tokenInfo.contract || !tokenInfo.decimal || !tokenInfo.coinbase) {
            LogUtil.error({ e: "getERC20Balance(): param is undefined.", tokenInfo });
            return 0;
        }

        let client = CoinService.getEthClient();
        let abi = CommonUtil.getEthJSONAbi();
        let contract = new client.eth.Contract(abi, tokenInfo.contract);

        let addressList = await UserWalletService.getAddressList(tokenInfo.assetCode);

        let balance = 0
        try {
            addressList.push({
                address: tokenInfo.coinbase
            })
            for (let i = 0; i < addressList.length; i++) {
                let result = await contract.methods.balanceOf(addressList[i]['address']).call();
                let amount = DecimalUtil.div(result, Math.pow(10, tokenInfo.decimal));
                if (amount) {
                    balance = DecimalUtil.add(balance, amount);
                }
            }
        } catch (err) {
            return 0;
        }

        return balance;
    }

    private async getXrpBalance() {
        let cfg = Settings.COIN_CONFIGS['XRP'];
        if (!cfg || !cfg.accountId) {
            LogUtil.error({ e: "getXrpBalance(): cfg is invalid.", cfg });
            return 0;
        }

        let client = await CoinService.getXrpClient();
        if (!client) {
            LogUtil.error({ e: 'getXrpBalance(): client is undefined. ' });
            return 0;
        }

        let balance = 0;
        try {
            let result = await client.getBalances(cfg.accountId);

            if (!result || !result[0]) {
                LogUtil.error({ e: 'getXrpBalance(): result is undefined. ' });
                return 0;
            }

            balance = result[0].value;

        } catch (err) {
            LogUtil.error({ e: 'getXrpBalance(): ' + err.message });
            return 0;
        }

        return balance;
    }

    private async getXmrBalance() {
        let cfg = Settings.COIN_CONFIGS['XMR'];
        if (!cfg || !cfg.host || !cfg.port) {
            LogUtil.error({ e: "getXmrBalance(): cfg is invalid.", cfg });
            return 0;
        }

        let url = 'http://' + cfg.host + ':' + cfg.port + '/json_rpc';

        let balance = 0;
        try {

            let fetchRes = await FetchUtil.post(url, {
                jsonrpc: "2.0",
                id: "0",
                method: "get_balance",
                params: {
                    account_index: 0,
                    address_indices: [0, 1]
                }
            })

            if (!fetchRes || !fetchRes.result) {
                LogUtil.error({ e: "getXmrBalance(): fetch result error.", fetchRes });
                return 0;
            }

            balance = DecimalUtil.div(fetchRes.result.balance, 1000000000000);

        } catch (err) {
            LogUtil.error({ e: "getXmrBalance(): " + err.message });
            return 0;
        }

        return balance;
    }

    private async getAdaBalance() {
        let cfg = Settings.COIN_CONFIGS['ADA'];
        if (!cfg || !cfg.accountIndex || !cfg.walletId || !cfg.host || !cfg.host) {
            LogUtil.error({ e: "getAdaBalance(): cfg is invalid.", cfg });
            return 0;
        }

        let url = 'http://' + cfg.host + ':' + cfg.port + '/api/v1/wallets/' + cfg.walletId;
        let balance;
        try {
            let fetchRes = await FetchUtil.get(url);
            if (!fetchRes) {
                LogUtil.error({ e: "getAdaBalance(): fetchRes param.", fetchRes });
                return 0;
            }

            let fetchResJson = await fetchRes.json()
            if (!fetchResJson || fetchResJson.status != 'success' || !fetchResJson.data) {
                LogUtil.error({ e: "getAdaBalance(): fetchResJson param.", fetchRes });
                return 0;
            }

            balance = DecimalUtil.div(fetchResJson.data.balance, 1000000);

        } catch (err) {
            LogUtil.error({ e: "getAdaBalance(): " + err.message });
            return 0;
        }

        return balance;
    }

    public async getEthBalance() {
        console.log('eth');
        
        let client = CoinService.getEthClient();

        let accounts = await client.eth.personal.getAccounts();
        let balance = 0;

        try {
            for (let i = 0; i < accounts.length; i++) {
                let result = await client.eth.getBalance(accounts[i]);
                console.log(accounts[i]);
                let amount = DecimalUtil.div(result, 1000000000000000000);
                if (amount) {
                    // console.log(accounts[i]);
                    // console.log(amount);
                    
                    balance = DecimalUtil.add(balance, amount);
                }
            }
        } catch (err) {
            LogUtil.error({ e: 'getEthBalance(): ' + err.message });
            return 0;

        }
        // console.log(balance);
        
        return balance;
    }

    private async getBloodBalance() {
        let cfg = Settings.COIN_CONFIGS['BLOOD'];
        if (!cfg || !cfg.host || !cfg.apiKey || !cfg.account) {
            LogUtil.error({ e: "getBloodBalance(): cfg is undefined.", cfg });
            return 0;
        }

        let balance;
        try {

            let fetchRes = await FetchUtil.post(cfg.host, {
                method: "gettotalbalance",
                params: [],
                id: 1,
                jsonrpc: "1.0",
                apikey: cfg.apiKey
            });

            if (!fetchRes || !fetchRes.result) {
                LogUtil.error({ e: 'getBloodBalance(): result is undefined.', fetchRes });
                return 0;
            }

            balance = fetchRes.result;

        } catch (err) {
            LogUtil.error({ e: "getBloodBalance(): " + err.message });
            return 0;
        }

        return balance;
    }

    private async getBitcoinBalance(assetCode: string) {
        if (!assetCode) {
            LogUtil.error({ e: 'getBitcoinBalance(): assetCode is undefined. ' });
            return 0;
        }

        let client = CoinService.getBitcoinClient(assetCode);
        if (!client) {
            LogUtil.error({ e: 'getBitcoinBalance(): client is undefined. ', assetCode });
            return 0;
        }

        let balance = 0;

        try {
            balance = client.getBalance();
        } catch (err) {
            LogUtil.error({ e: 'getBitcoinBalance(): ' + err.message });
            return 0;
        }

        return balance;
    }

    private async getStiBalance() {
        let cfg = Settings.COIN_CONFIGS['STI'];
        if (!cfg || !cfg.walletId || !cfg.host || !cfg.host) {
            LogUtil.error({ e: "getStiBalance(): cfg is invalid.", cfg });
            return 0;
        }

        let url = 'http://' + cfg.host + ':' + cfg.port;
        let balance;
        try {
            let fetchRes = await FetchUtil.post(url, {
                action: "account_info",
                account: cfg.account
            })
            if (!fetchRes) {
                LogUtil.error({ e: "getStiBalance(): fetchRes param.", fetchRes });
                return 0;
            }

            balance = DecimalUtil.div(fetchRes.balance, Math.pow(10, 24));

        } catch (err) {
            LogUtil.error({ e: "getStiBalance(): " + err.message });
            return 0;
        }

        return balance;
    }

}
export const CoinBalanceService = new _CoinBalanceService();