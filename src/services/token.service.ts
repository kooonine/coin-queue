import { LogUtil } from "../lib";
import { TokenCollection } from "../collections/token.collection";






export class _TokenService {


    public async getTokenInfo(assetCode: string) {
        if (!assetCode) {
            LogUtil.error({ e: 'getTokenInfo(): param is undefined. ', assetCode })
            return undefined;
        }

        let token;

        try {
            let tokenCollection = await TokenCollection.getInstance();
            token = await tokenCollection.findOne({ assetCode: assetCode, useYn: true });

        } catch (err) {
            LogUtil.error({ e: 'getTokenInfo(): ' + err.message });
            return undefined;
        }

        return token;
    }

    public async getTokenInfoList(){
        let tokenInfoList;

        try {
            let tokenCollection = await TokenCollection.getInstance();
            tokenInfoList = await tokenCollection.find({ useYn: true }).toArray();

        } catch (err) {
            LogUtil.error({ e: 'getTokenInfo(): ' + err.message });
            return [];
        }

        return tokenInfoList;
    }

}
export const TokenService = new _TokenService();