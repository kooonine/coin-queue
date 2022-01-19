import { LogUtil, FetchUtil } from "../lib";
import { CoinService } from "./coin.service";
import { Settings } from "../models";
import { UserWalletService } from "./userwallet.service";
import { TokenService } from "./token.service";


export class _CoinAddressService {

    public async getNewAddress(assetCode: string, userId: string) {
        console.log('1');
        console.log(assetCode);
        console.log(userId)
        if (!assetCode || !userId) {
            LogUtil.error({ e: "getNewAddress(): invalid param.", assetCode, userId });
            return undefined;
        }

        // ERC20 토큰이면.. 
        let tokenInfo = await TokenService.getTokenInfo(assetCode);
        console.log(tokenInfo);
        
        if(tokenInfo){
            return await this.getEthNewAddress();
        }

        switch (assetCode) {
            case 'VENC':
            case 'BTC':
            case 'LTC':
            case 'QTUM':
            case 'BCH':
                return await this.getBitcoinNewAddress(assetCode, userId);
            case 'ETH':            
                return await this.getEthNewAddress();
            case 'XMR':
                return await this.getXmrNewAddress(userId);
            case 'ADA':
                return await this.getAdaNewAddress();
            case 'XRP':
                return await this.getXrpNewAddress();            
            case 'STI':
                return await this.getStiNewAddress();                
        }
    }

    private async getBitcoinNewAddress(assetCode: string, userId: string) {
        if (!assetCode || !userId) {
            LogUtil.error({ e: "getBitcoinNewAddress(): invalid param.", assetCode, userId });
            return undefined;
        }

        let address;
        let client;

        try {
            client = CoinService.getBitcoinClient(assetCode);
            if (!client) {
                LogUtil.error({ e: "getBitcoinNewAddress(): client is undefined." });
                return undefined;
            }            

            address = await client.getNewAddress(userId);

        } catch (err) {
            LogUtil.error({ e: 'getBitcoinNewAddress' + err.message });
            return undefined;
        }

        return address;
    }

    private async getEthNewAddress() {
        let client = CoinService.getEthClient();
        if (!client) {
            LogUtil.error({ e: "getEthNewAddress(): client is undefined." });
            return undefined;
        }

        let newAddress;
        try {

            let cfg = Settings.COIN_CONFIGS['ETH'];
            let ethPassword;
            if (!cfg || !cfg.password) {
                ethPassword = 'ventassmqt4$';
            }
            ethPassword = cfg.password;
            newAddress = await client.eth.personal.newAccount(ethPassword);

        } catch (err) {
            LogUtil.error({ e: "getEthNewAddress(): " + err.message });
            return undefined;
        }

        return newAddress;
    }

    private async getXmrNewAddress(userId: string) {
        if (!userId) {
            LogUtil.error({ e: "getXmrNewAddress(): invalid param." });
            return undefined;
        }

        let address;
        let url = CoinService.getXmrRPCUrl();

        try {
            let fetchRes = await FetchUtil.post(url, {
                jsonrpc: "2.0",
                id: "0",
                method: "create_address",
                params: {
                    account_index: 0,
                    label: userId
                }
            })

            if (!fetchRes || !fetchRes.result || !fetchRes.result.address) {
                LogUtil.error({ e: 'getXmrNewAddress(): result is undefined.', fetchRes });
                return undefined;
            }
            address = fetchRes.result.address;

        } catch (err) {
            LogUtil.error({ e: 'getXmrNewAddress' + err.message });
            return undefined;
        }

        return address;
    }

    private async getAdaNewAddress() {

        let cfg = Settings.COIN_CONFIGS['ADA'];
        if (!cfg || !cfg.port || !cfg.host || !cfg.accountIndex || !cfg.walletId) {
            LogUtil.error({ e: "getAdaNewAddress(): cfg is undefined.", cfg });
            return undefined;
        }

        let url = 'http://' + cfg.host + ':' + cfg.port + '/api/v1/addresses';
        let address;

        try {
            let fetchRes = await FetchUtil.post(url, {
                accountIndex: cfg.accountIndex,
                walletId: cfg.walletId
            })

            if (!fetchRes || fetchRes.status != 'success' || !fetchRes.data || fetchRes.data.used) {
                LogUtil.error({ e: 'getAdaNewAddress(): result is undefined.', fetchRes });
                return undefined;
            }
            address = fetchRes.data.id;

        } catch (err) {
            LogUtil.error({ e: 'getAdaNewAddress()' + err.message });
            return undefined;
        }

        return address;
    }

    private async getXrpNewAddress() {
        let destTag = (Math.random() * 1000000000).toFixed();
        
        if (await UserWalletService.isMyAddress('XRP', destTag)) {
            destTag = (Math.random() * 1000000000).toFixed();
        }

        return destTag;
    }

    private async getBloodNewAddress() {

        let cfg = Settings.COIN_CONFIGS['BLOOD'];
        if (!cfg || !cfg.host || !cfg.apiKey || !cfg.account) {
            LogUtil.error({ e: "getBloodNewAddress(): cfg is undefined.", cfg });
            return undefined;
        }
        
        let newAddress;
        try {           

            let fetchRes = await FetchUtil.post(cfg.host, {
                method: "getnewaddress",
                params: [
                    cfg.account
                ],
                id: 1,
                jsonrpc: "1.0",
                apikey: cfg.apiKey
            });

            if (!fetchRes || !fetchRes.result) {
                LogUtil.error({ e: 'getBloodNewAddress(): result is undefined.', fetchRes });
                return undefined;
            }

            newAddress = fetchRes.result;

        } catch (err) {
            LogUtil.error({ e: "getBloodUrl(): " + err.message });
            return undefined;
        } 

        return newAddress;
    }

    private async getStiNewAddress() {
        console.log('sti여기들어오나');
        
        let cfg = Settings.COIN_CONFIGS['STI'];
        if (!cfg || !cfg.port || !cfg.host || !cfg.walletId) {
            LogUtil.error({ e: "getStiNewAddress(): cfg is undefined.", cfg });
            return undefined;
        }

        let url = 'http://' + cfg.host + ':' + cfg.port;
        let address;    
        try {
            let fetchRes = await FetchUtil.post(url, {
                action: "account_create",
                wallet: cfg.walletId
            })
            
            if (!fetchRes || !fetchRes.account) {
                LogUtil.error({ e: 'getStiNewAddress(): result is undefined.', fetchRes });
                return undefined;
            }
            address = fetchRes.account;

        } catch (err) {
            LogUtil.error({ e: 'getStiNewAddress()' + err.message });
            return undefined;
        }
        console.log('지갑이 만들어지나');
        console.log(address);
        
        return address;
    }

}
export const CoinAddressService = new _CoinAddressService();