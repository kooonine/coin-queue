import { UserWalletCollection } from "../collections";
import { LogUtil } from "../lib";

export class _UserWalletService {


    public async isMyAddress(assetCode: string, address: string) {
        if (!assetCode || !address) {
            return false;
        }

        let userWallet;
        let userWalletCollection;
        try {
            userWalletCollection = await UserWalletCollection.getInstance();
            userWallet = await userWalletCollection.findOne({ assetCode: assetCode, address: address });

            if (!userWallet) {
                return false;
            }
        } catch (err) {
            LogUtil.error({ e: 'isMyAddress(): ' + err.message })
            return false;
        }

        return true;
    }

    public async isMyEthAddress(assetCode: string, address: string) {
        if (!assetCode || !address) {
            return false;
        }

        let userWallet;
        let userWalletCollection;
        try {
            userWalletCollection = await UserWalletCollection.getInstance();
            userWallet = await userWalletCollection.findOne({ assetCode: assetCode, address: { $regex: address, $options: 'i' } });

            if (!userWallet) {
                return false;
            }
        } catch (err) {
            LogUtil.error({ e: 'isMyAddress(): ' + err.message })
            return false;
        }

        return true;
    }

    public async getUserWalletListByAssetCode(assetCode: string) {
        if (!assetCode) {
            return [];
        }

        let userWalletList;
        let userWalletCollection;
        try {
            userWalletCollection = await UserWalletCollection.getInstance();
            userWalletList = await userWalletCollection.find({ assetCode: assetCode, address: { $ne: '' } }).toArray();

            if (!userWalletList) {
                return [];
            }
        } catch (err) {
            LogUtil.error({ e: 'getUserWalletListByAssetCode(): ' + err.message })
            return [];
        }

        return userWalletList;
    }

    public async getAddressList(assetCode: string) {
        if (!assetCode) {
            LogUtil.error({ e: 'getAddressList(): assetCode is undefined. ' });
            return [];
        }

        let userWalletCollection;
        let addressList = []
        try {

            userWalletCollection = await UserWalletCollection.getInstance();
            addressList = await userWalletCollection.find({ assetCode: assetCode, address: { $ne: '' } }).toArray();
        } catch (err) {
            LogUtil.error({ e: 'getAddressList(): ' + err.message, assetCode });
            return [];
        }

        return addressList;
    }

}
export const UserWalletService = new _UserWalletService();