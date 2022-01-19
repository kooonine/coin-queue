import { LogUtil, FetchUtil, CommonUtil, DecimalUtil } from "../lib";
import { Settings, ResultCode, Token } from "../models";
import { TransferService } from "./transfer.service";
import { UserWalletService } from "./userwallet.service";
import { TokenService } from "./token.service";

const BitcoinCore = require('bitcoin-core');
const Web3 = require('web3');
const RippleAPI = require('ripple-lib').RippleAPI;
const WebSocket = require('ws');
const { Api, JsonRpc, RpcError } = require('eosjs');
const fetch = require('node-fetch');

export class _CoinService {
    // ripple, eth 접속 리스트
    wsClientList = {};

    // EOS blockNum
    eosBlockNum = 0;

    public async connectEthWs(assetCode: string) {
        if (!assetCode) {
            LogUtil.error({ e: "connectEthWs(): param is undefined." });
            return { code: ResultCode.ERROR }
        }

        let ethClient = this.getEthClient();
        if (!ethClient) {
            LogUtil.error({ e: "connectEthWs(): ethClient is undefined." });
            return { code: ResultCode.ERROR }
        }

        let tokenInfoList = await TokenService.getTokenInfoList();

        // eth subscribe
        ethClient.eth.subscribe('newBlockHeaders', async (err, res) => {
            if (err) {
                LogUtil.error({ e: err.message })
                return;
            }

            LogUtil.info({ i: 'noti: ' + assetCode + '[' + res.hash + ']' });
            this.checkTransactions(assetCode, res.hash);
            await TransferService.checkDisapprovalTransfer(assetCode);

            // ERC20 기반 토큰 confirmations 확인            
            for (let i = 0; i < tokenInfoList.length; i++) {
                await TransferService.checkDisapprovalTransfer(tokenInfoList[i].assetCode);
            }
        });

        // ERC20 subscribe 
        for (let i = 0; i < tokenInfoList.length; i++) {
            await this.subscribeERC20(ethClient, tokenInfoList[i]);
        }
    }

    // 입/출금이 확정되었는지 확인
    public async isConfirmedTx(assetCode: string, txId: string) {
        if (!assetCode || !txId) {
            LogUtil.error({ e: "isConfirmedTx(): param is undefined." });
            return false;
        }

        // ERC20 토큰이면.. 
        let tokenInfo = await TokenService.getTokenInfo(assetCode);
        if (tokenInfo) {
            return await this.isConfirmedEthTx(assetCode, txId);
        }

        switch (assetCode) {
            case 'VENC':
            case 'BTC':
            case 'LTC':
            case 'QTUM':
            case 'BCH':
                return await this.isConfirmedBitcoinTx(assetCode, txId);
            case 'ETH':
                return await this.isConfirmedEthTx(assetCode, txId);
            case 'XMR':
                return await this.isConfirmedXmrTx(assetCode, txId);
            case 'ADA':
                return await this.isConfirmedAdaTx(assetCode, txId);
            case 'XRP':
                return await this.isConfirmedXrpTx(assetCode, txId);
            case 'BLOOD':
                return await this.isConfirmedBloodTx(assetCode, txId);
            case 'STI':
                return await this.isConfirmedStiTx(assetCode, txId);
        }

        return false;
    }

    // 코인 입금 확인
    public async checkTransactions(assetCode: string, blockHash?: string) {
        if (!assetCode) {
            LogUtil.error({ e: "checkTransactions(): param is undefined." });
            return { code: ResultCode.ERROR }
        }

        switch (assetCode) {
            case 'VENC':
            case 'BTC':
            case 'LTC':
            case 'QTUM':
            case 'BCH':
                return await this.checkBitcoinTxs(assetCode);
            case 'ETH':
                return await this.checkEthTxs(assetCode, blockHash);
            case 'XMR':
                return await this.checkXmrTxs(assetCode);
            case 'ADA':
                return await this.checkAdaTxs(assetCode);
            case 'XRP':
                return await this.checkXrpTxs(assetCode, blockHash);
            case 'BLOOD':
                return await this.checkBloodTxs(assetCode, blockHash);
            case 'STI':
                return await this.checkStiTxs(assetCode, blockHash);
        }

        return { code: ResultCode.ERROR };
    }

    public async getBitcoinTx(assetCode: string, txId: string) {
        if (!assetCode || !txId) {
            LogUtil.error({ e: "getBitcoinTx(): param is undefined." });
            return { code: ResultCode.ERROR }
        }

        let client = this.getBitcoinClient(assetCode);
        if (!client) {
            LogUtil.error({ e: "getBitcoinTx(): client is undefined." });
            return { code: ResultCode.ERROR }
        }

        let tx;
        try {
            tx = await client.getTransaction(txId);
        } catch (err) {
            LogUtil.error({ e: "getBitcoinTx(): " + err.message });
            return { code: ResultCode.ERROR }
        }

        return tx;
    }

    public async getEthTxReceipt(assetCode: string, txId: string) {
        if (!assetCode || !txId) {
            LogUtil.error({ e: "getEthTxReceipt(): param is undefined." });
            return { code: ResultCode.ERROR }
        }

        let client = this.getEthClient();
        if (!client) {
            LogUtil.error({ e: "getEthTxReceipt(): client is undefined." });
            return { code: ResultCode.ERROR }
        }

        let tx;
        try {
            tx = await client.eth.getTransactionReceipt(txId);
        } catch (err) {
            LogUtil.error({ e: "getEthTxReceipt(): " + err.message });
            return { code: ResultCode.ERROR }
        }

        return tx;
    }

    public getBitcoinClient(assetCode: string) {
        if (!assetCode) {
            LogUtil.error({ e: "getBitcoinClient(): assetCode is undefined." });
            return undefined;
        }

        let cfg = Settings.COIN_CONFIGS[assetCode];
        if (!cfg || cfg['type'] != 'bitcoin') {
            LogUtil.error({ e: "getBitcoinClient(): cfg is invalid.", cfg });
            return undefined;
        }

        let client;
        try {
            client = new BitcoinCore(cfg);
        } catch (err) {
            LogUtil.error({ e: 'getBitcoinClient()' + err.message });
            return undefined;
        }

        return client;
    }

    private async checkBitcoinTxs(assetCode: string) {
        if (!assetCode) {
            LogUtil.error({ e: "checkBitcoinTxs(): param is undefined." });
            return { code: ResultCode.ERROR }
        }

        // bitcoin은 block 생성 시, 입금된 건들에 대해서 unspentlist가 생긴다.
        let unspentList = await this.getBitcoinUnspentList(assetCode);
        if (!Array.isArray(unspentList) || unspentList.length == 0) {
            return { code: ResultCode.SUC }
        }

        LogUtil.info({ i: 'unspentList:' + assetCode + '(' + unspentList.length + ')' });

        // unspentList를 가지고 입금된 코인을 찾아 입금 신청.
        for (let i = 0; i < unspentList.length; i++) {

            // 이미 생성된 입금 내역이 있다면 continue
            let transfer = await TransferService.getTransferByTxinfo(unspentList[i].txid, unspentList[i].address, unspentList[i].amount);
            if (transfer) {
                continue;
            }

            // tx안의 받는 사람 주소가 회원 주소인지 체크
            let isMyAddress = await UserWalletService.isMyAddress(assetCode, unspentList[i].address);
            if (!isMyAddress) {
                continue;
            }

            // 입금된 txId를 api로 http get method 전송. 
            FetchUtil.get(Settings.API_SERVER + '/blk/' + assetCode + '/' + unspentList[i].txid + '/deposit/' + Settings.API_PRIVATE_KEY);
            LogUtil.info({ i: 'fetch: deposit' + assetCode + '[' + unspentList[i].txid + ']' }, true);
        }
        return { code: ResultCode.SUC }
    }

    // 비트코인 기반 코인들의 입금 확인을 위해 unspentlist를 가져온다.
    private async getBitcoinUnspentList(assetCode: string) {
        if (!assetCode) {
            LogUtil.error({ e: "getBitcoinUnspentList(): invalid param." });
            return [];
        }

        let unspentList = [];

        try {
            let client = this.getBitcoinClient(assetCode);
            if (!client) {
                LogUtil.error({ e: "getBitcoinUnspentList(): client is undefined." });
                return [];
            }

            let coinConfirmations = this.getCoinConfirmations(assetCode);

            unspentList = await client.listUnspent(0, coinConfirmations);

        } catch (err) {
            LogUtil.error({ e: 'getBitcoinUnspentList():' + err.message });
            return [];
        }

        return unspentList;
    }

    // 코인 별 확정 confirmations을 설정 값에서 가져온다. 만약 없다면 bitcoin의 confirmations 값을 리턴한다. ( = 6)
    private getCoinConfirmations(assetCode: string) {
        if (!assetCode) {
            LogUtil.error({ e: "getCoinConfirmations(): assetCode is undefined." });
            return 6;
        }

        let cfg = Settings.COIN_CONFIGS[assetCode];

        if (!cfg || !cfg.confirmations) {
            LogUtil.error({ e: "getCoinConfirmations(): cfg is undefined.", cfg });
            return 6;
        }

        return cfg.confirmations;
    }

    // Bitcoin 기반 코인 입/출금이 확정되었는지 확인
    private async isConfirmedBitcoinTx(assetCode: string, txId: string) {
        if (!assetCode || !txId) {
            LogUtil.error({ e: "isConfirmedBitcoinTx(): assetCode is undefined." });
            return false;
        }

        // 코인의 confirmations 값을 가져온다.
        let confirmations = this.getCoinConfirmations(assetCode);
        if (!confirmations) {
            LogUtil.error({ e: "isConfirmedBitcoinTx(): confirmations is undefined." });
            return false;
        }

        let tx = await this.getBitcoinTx(assetCode, txId);
        if (!tx || !tx.confirmations) {
            LogUtil.error({ e: "isConfirmedBitcoinTx(): tx is undefined." });
            return false;
        }

        LogUtil.info({ i: 'confirmCheck:' + assetCode + '(' + tx.confirmations + '/' + confirmations + ')[' + txId + ']' });
        // 입/출금 확정을 위한 confirmations 비교
        if (tx.confirmations < confirmations) {
            return false;
        }

        return true;
    }

    private async isConfirmedEthTx(assetCode: string, txId: string) {
        if (!assetCode || !txId) {
            LogUtil.error({ e: "isConfirmedEthTx(): assetCode is undefined.", assetCode, txId });
            return false;
        }

        let txReceipt = await this.getEthTxReceipt('ETH', txId);
        if (!txReceipt || !txReceipt.status) {
            LogUtil.info({ i: assetCode + 'confirmCheck:' + assetCode + '(status=0)[' + txId + ']' });
            return false;
        }

        let lastBlockNumber = await this.getEthLastBlock('ETH');
        let txConfirmations = lastBlockNumber - txReceipt.blockNumber;
        let coinConfirmations = this.getCoinConfirmations('ETH');

        LogUtil.info({ i: 'confirmCheck:' + assetCode + '(' + txConfirmations + '/' + coinConfirmations + ')[' + txId + ']' });

        if (txConfirmations < coinConfirmations) {
            return false;
        }

        return true;
    }

    private async getEthLastBlock(assetCode: string) {
        if (!assetCode) {
            LogUtil.error({ e: "getEthLastBlock(): assetCode is undefined." });
            return 0;
        }

        let client = this.getEthClient();
        if (!client) {
            LogUtil.error({ e: "getEthLastBlock(): client is undefined." });
            return 0;
        }

        let lastBlockNumber = 0;
        try {
            lastBlockNumber = await client.eth.getBlockNumber();
        } catch (err) {
            LogUtil.error({ e: "getEthLastBlock():" + err.message });
            return 0;
        }

        return lastBlockNumber;
    }

    public getEthClient() {

        if (this.wsClientList['ETH']) {
            return this.wsClientList['ETH'];
        }

        let cfg = Settings.COIN_CONFIGS['ETH'];

        if (!cfg || cfg.type != 'eth') {
            LogUtil.error({ e: "getEthClient(): cfg is invalid.", cfg });
            return undefined;
        }

        let client;
        try {
            client = new Web3("ws://" + cfg.host + ":" + cfg.wsPort);
            this.wsClientList['ETH'] = client;
        } catch (err) {
            LogUtil.error({ e: 'getEthClient()' + err.message });
            return undefined;
        }

        return this.wsClientList['ETH'];
    }

    private async checkEthTxs(assetCode: string, blockHash: string) {
        if (!assetCode || !blockHash) {
            return { code: ResultCode.ERROR }
        }

        let ethClient = this.getEthClient();
        if (!ethClient) {
            LogUtil.error({ e: "checkEthTxs(): ethClient is invalid.", assetCode });
            return { code: ResultCode.ERROR }
        }

        try {
            let block = await ethClient.eth.getBlock(blockHash);
            if (!block || !block.transactions) {
                LogUtil.error({ e: "checkEthTxs(): block is invalid.", assetCode });
                return { code: ResultCode.ERROR }
            }

            LogUtil.info({ i: 'txs : ' + assetCode + '(' + block.transactions.length + ')' });

            let userWalletList = await UserWalletService.getUserWalletListByAssetCode(assetCode);

            // transactions들 중에 회원의 address로 생긴 txId를 찾는다. 
            for (let i = 0; i < block.transactions.length; i++) {
                let transaction = await ethClient.eth.getTransaction(block.transactions[i]);

                // value가 없다는건 token 이동이므로 패스
                if (!transaction || !transaction.to || !transaction.value) {
                    continue;
                }

                for (let j = 0; j < userWalletList.length; j++) {
                    if (!userWalletList[j].address) {
                        continue;
                    }

                    // 이더리움의 경우, address 대소문자 혼용 사용이 가능하므로, 정확한 판별을 위해 소문자로 찾는다.
                    if (userWalletList[j].address.toLowerCase() == transaction.to.toLowerCase()) {
                        FetchUtil.get(Settings.API_SERVER + '/blk/' + assetCode + '/' + block.transactions[i] + '/deposit/' + Settings.API_PRIVATE_KEY);
                        LogUtil.info({ i: 'fetch: deposit' + assetCode + '[' + block.transactions[i] + ']' }, true);
                    }
                }
            }
        } catch (err) {
            LogUtil.error({ e: "checkEthTxs(): " + err.message });
            return { code: ResultCode.ERROR }
        }
    }

    private async checkXmrTxs(assetCode: string) {
        if (!assetCode || assetCode != 'XMR') {
            LogUtil.error({ e: "checkXmrTxs(): invalid param.", assetCode });
            return { code: ResultCode.ERROR };
        }

        try {
            let blockHeight = await this.getXmrBlockHeight();
            let coinConfirmations = this.getCoinConfirmations('XMR');
            let transferList = await this.getXmrInTransfers(blockHeight - coinConfirmations);

            if (!Array.isArray(transferList) || transferList.length == 0) {
                return { code: ResultCode.SUC }
            }

            LogUtil.info({ i: 'transferList:' + assetCode + '(' + transferList.length + ')' });

            for (let i = 0; i < transferList.length; i++) {
                let transfer = await TransferService.getTransferByTxinfo(transferList[i].txid, transferList[i].address, parseFloat((transferList[i].amount / 1000000000000).toFixed(8)));
                if (transfer) {
                    continue;
                }

                let isMyAddress = await UserWalletService.isMyAddress('XMR', transferList[i].address);
                if (!isMyAddress) {
                    continue;
                }

                FetchUtil.get(Settings.API_SERVER + '/blk/' + assetCode + '/' + transferList[i].txid + '/deposit/' + Settings.API_PRIVATE_KEY);
                LogUtil.info({ i: 'fetch: deposit' + assetCode + '[' + transferList[i].txid + ']' }, true);
            }

        } catch (err) {
            LogUtil.error({ e: "checkXmrTxs(): " + err.message });
            return { code: ResultCode.ERROR };
        }
    }
    private async getXmrBlockHeight() {

        let blockHeight = 0;
        let url = this.getXmrRPCUrl();

        try {

            let fetchRes = await FetchUtil.post(url, {
                jsonrpc: "2.0",
                id: "0",
                method: "getheight"
            });

            if (!fetchRes || fetchRes.error || !fetchRes.result || !Number(fetchRes.result.height)) {
                LogUtil.error({ e: "getXmrBlockHeight(): fetch result error.", fetchRes });
                return 0;
            }

            blockHeight = Number(fetchRes.result.height);
        } catch (err) {
            LogUtil.error({ e: "getXmrBlockHeight(): " + err.message });
            return 0;
        }

        return blockHeight;
    }

    private async getXmrInTransfers(minHeight: number) {
        if (!Number(minHeight)) {
            minHeight = 0;
        }


        let transferList = [];
        let url = this.getXmrRPCUrl();

        try {
            let fetchRes = await FetchUtil.post(url, {
                jsonrpc: "2.0",
                id: "0",
                method: "get_transfers",
                params: {
                    in: true,
                    filter_by_height: true,
                    min_height: minHeight
                }
            })

            if (!fetchRes || fetchRes.error || !fetchRes.result) {
                LogUtil.error({ e: "getXmrInTransfers(): fetch result error.", fetchRes });
                return [];
            }

            if (Array.isArray(fetchRes.result.in)) {
                transferList = fetchRes.result.in;
            }
        } catch (err) {
            LogUtil.error({ e: "getXmrInTransfers(): " + err.message });
            return [];
        }

        return transferList;
    }
    public getXmrRPCUrl() {

        let cfg = Settings.COIN_CONFIGS['XMR'];
        if (!cfg) {
            LogUtil.error({ e: "getXmrInTransfers(): cfg is invalid.", cfg });
            return undefined;
        }
        let url = 'http://' + cfg.host + ':' + cfg.port + '/json_rpc';

        return url;
    }

    private async isConfirmedXmrTx(assetCode: string, txId: string) {
        if (!assetCode || !txId) {
            LogUtil.error({ e: "isConfirmedXmrTx(): assetCode is undefined." });
            return false;
        }

        // 코인의 confirmations 값을 가져온다.
        let confirmations = this.getCoinConfirmations(assetCode);
        if (!confirmations) {
            LogUtil.error({ e: "isConfirmedXmrTx(): confirmations is undefined." });
            return false;
        }

        let tx = await this.getXmrTx(assetCode, txId);
        if (!tx) {
            LogUtil.error({ e: "isConfirmedXmrTx(): tx is undefined.", tx });
            return false;
        }

        if (tx.type == 'pending') {
            LogUtil.info({ i: 'confirmCheck:' + assetCode + '(pending)[' + txId + ']' });
            return false;
        }

        LogUtil.info({ i: 'confirmCheck:' + assetCode + '(' + tx.confirmations + '/' + confirmations + ')[' + txId + ']' });
        // 입/출금 확정을 위한 confirmations 비교
        if (tx.confirmations < confirmations) {
            return false;
        }

        return true;
    }

    private async getXmrTx(assetCode: string, txId: string) {
        if (!assetCode || !txId) {
            LogUtil.error({ e: "getXmrTx(): param is undefined." });
            return undefined;
        }

        let url = this.getXmrRPCUrl();
        let tx;

        try {

            let fetchRes = await FetchUtil.post(url, {
                jsonrpc: "2.0",
                id: "0",
                method: "get_transfer_by_txid",
                params: {
                    txid: txId
                }
            })

            if (!fetchRes || fetchRes.error || !fetchRes.result || !fetchRes.result.transfer) {
                LogUtil.error({ e: "getXmrTx(): fetch result error.", fetchRes });
                return undefined;
            }

            tx = fetchRes.result.transfer;

        } catch (err) {
            LogUtil.error({ e: "getXmrTx(): " + err.message });
            return undefined;
        }

        return tx;
    }

    private async checkAdaTxs(assetCode: string) {
        if (!assetCode || assetCode != 'ADA') {
            LogUtil.error({ e: "checkAdaTxs(): invalid param.", assetCode });
            return { code: ResultCode.ERROR };
        }
        try {
            let transferList = await this.getAdaTransferList('ADA');

            LogUtil.info({ i: 'transferList:' + assetCode + '(' + transferList.length + ')' });

            for (let i = 0; i < transferList.length; i++) {
                if (transferList[i].direction != 'incoming') {
                    continue;
                }
                let outputList = transferList[i].outputs;

                for (let j = 0; j < outputList.length; j++) {
                    let transfer = await TransferService.getTransferByTxinfo(transferList[i].id, outputList[j].address, outputList[j].amount / 1000000);
                    if (transfer) {
                        continue;
                    }

                    let isMyAddress = await UserWalletService.isMyAddress('ADA', outputList[j].address);
                    if (!isMyAddress) {
                        continue;
                    }

                    FetchUtil.get(Settings.API_SERVER + '/blk/' + assetCode + '/' + transferList[i].id + '/deposit/' + Settings.API_PRIVATE_KEY);
                    LogUtil.info({ i: 'fetch: deposit' + assetCode + '[' + transferList[i].id + ']' }, true);
                }
            }
        } catch (err) {
            LogUtil.error({ e: "checkAdaTxs(): " + err.message });
            return { code: ResultCode.ERROR };
        }

        return { code: ResultCode.SUC };
    }

    private async getAdaTransferList(assetCode: string) {
        if (!assetCode || assetCode != 'ADA') {
            LogUtil.error({ e: "getAdaTransferList(): invalid param.", assetCode });
            return [];
        }

        let cfg = Settings.COIN_CONFIGS['ADA'];
        if (!cfg || !cfg.accountIndex || !cfg.walletId || !cfg.host || !cfg.host) {
            LogUtil.error({ e: "getAdaTransferList(): cfg is invalid.", cfg });
            return undefined;
        }

        let twoHoursBefore = new Date(new Date().getTime() - 3600000).toISOString();
        twoHoursBefore = twoHoursBefore.slice(0, -1);

        let url = 'http://' + cfg.host + ':' + cfg.port + '/api/v1/transactions?'
            + 'wallet_id=' + cfg.walletId
            + '&account_index=' + cfg.accountIndex
            + '&created_at=GTE[' + twoHoursBefore + ']';

        let transferList = [];
        try {

            let fetchRes = await FetchUtil.get(url);
            if (!fetchRes) {
                LogUtil.error({ e: "getAdaTransferList(): fetchRes param.", fetchRes });
                return [];
            }

            let fetchResJson = await fetchRes.json()
            if (!fetchResJson || fetchResJson.status != 'success' || !Array.isArray(fetchResJson.data)) {
                LogUtil.error({ e: "getAdaTransferList(): fetchResJson param.", fetchRes });
                return [];
            }

            transferList = fetchResJson.data;
        } catch (err) {
            LogUtil.error({ e: "getAdaTransferList(): " + err.message });
            return [];
        }

        return transferList;
    }

    private async isConfirmedAdaTx(assetCode: string, txId: string) {
        if (!assetCode || !txId) {
            LogUtil.error({ e: "isConfirmedAdaTx(): assetCode is undefined." });
            return false;
        }

        // 코인의 confirmations 값을 가져온다.
        let confirmations = this.getCoinConfirmations(assetCode);
        if (!confirmations) {
            LogUtil.error({ e: "isConfirmedAdaTx(): confirmations is undefined." });
            return false;
        }

        let tx = await this.getAdaTx('ADA', txId);
        if (!tx) {
            LogUtil.error({ e: "isConfirmedAdaTx(): tx is undefined.", tx });
            return false;
        }

        LogUtil.info({ i: 'confirmCheck:' + assetCode + '(' + tx.confirmations + '/' + confirmations + ')[' + txId + ']' });

        // 입/출금 확정을 위한 confirmations 비교
        if (tx.confirmations < confirmations) {
            return false;
        }

        return true;
    }

    private async getAdaTx(assetCode: string, txId: string) {
        if (!assetCode || assetCode != 'ADA' || !txId) {
            LogUtil.error({ e: "getAdaTx(): invalid param.", assetCode, txId });
            return undefined;
        }

        let cfg = Settings.COIN_CONFIGS['ADA'];
        if (!cfg || !cfg.accountIndex || !cfg.walletId || !cfg.host || !cfg.host) {
            LogUtil.error({ e: "getAdaTx(): cfg is invalid.", cfg });
            return undefined;
        }

        let url = 'http://' + cfg.host + ':' + cfg.port + '/api/v1/transactions?'
            + 'wallet_id=' + cfg.walletId
            + '&account_index=' + cfg.accountIndex
            + '&id=' + txId;

        let tx;
        try {

            let fetchRes = await FetchUtil.get(url);
            if (!fetchRes) {
                LogUtil.error({ e: "getAdaTx(): fetchRes param.", fetchRes });
                return undefined;
            }

            let fetchResJson = await fetchRes.json()
            if (!fetchResJson || fetchResJson.status != 'success' || !Array.isArray(fetchResJson.data)) {
                LogUtil.error({ e: "getAdaTx(): fetchResJson param.", fetchRes });
                return undefined;
            }

            tx = fetchResJson.data[0];
        } catch (err) {
            LogUtil.error({ e: "getAdaTx(): " + err.message });
            return undefined;
        }

        return tx;
    }

    // 리플 서버 접속 및  tx notify
    public async connectXrpWs() {
        let xrpClient = await this.getXrpClient();
        if (!xrpClient) {
            LogUtil.error({ e: "connectXrpWs(): xrpClient is undefined." });
            return { code: ResultCode.ERROR };
        }

        xrpClient.connection.on('transaction', async (tx) => {
            if (!tx || !tx.transaction || !tx.meta) {
                LogUtil.error({ e: 'invalid tx.', tx })
                return;
            }

            LogUtil.info({ i: 'noti: XRP' + '[' + tx.transaction.hash + ']' });

            if (tx.transaction.Account == 'rDBqE7xvhY8UerZGV8wiZDnpc5bgztv3f3') {
                return TransferService.checkDisapprovalTransfer('XRP');
            }

            // 트랜잭션 타입을 설정하여 입금 확인
            if (tx.transaction.TransactionType === 'Payment' && tx.meta.TransactionResult === 'tesSUCCESS') {
                return this.checkTransactions('XRP', tx.transaction.hash);
            }
        })

        // 트랜잭션들을 구독
        xrpClient.request('subscribe', {
            accounts: ["rDBqE7xvhY8UerZGV8wiZDnpc5bgztv3f3"]
        });
    };

    // 리플 RPC 통신 연결
    public async getXrpClient() {
        try {
            if (this.wsClientList['XRP'] && this.wsClientList['XRP'].isConnected()) {
                return this.wsClientList['XRP'];
            }
        } catch (err) {
            LogUtil.error({ e: 'getXrpClient(): ' + err.message })
        }

        let cfg = Settings.COIN_CONFIGS['XRP'];
        if (!cfg || cfg.type != 'xrp' || !cfg.host || !cfg.wsPort) {
            LogUtil.error({ e: "getXrpClient(): cfg is invalid.", cfg });
            return undefined;
        }

        try {
            let client = new RippleAPI({ server: "ws://" + cfg.host + ":" + cfg.wsPort });

            client.on('error', (errorCode, errorMessage) => {
                LogUtil.error({ e: errorCode + ': ' + errorMessage });
            });
            client.on('connected', () => {
                LogUtil.info({ i: '<< xrp ws connected >>' });
            })
            client.on('disconnected', (code) => {
                LogUtil.error({ e: '<< xrp ws disconnected >> code: ' + code });
            })

            await client.connect();
            this.wsClientList['XRP'] = client;
        } catch (err) {
            LogUtil.error({ e: 'getXrpClient()' + err.message });
            return undefined;
        }

        return this.wsClientList['XRP'];
    }

    // 리플 입금 확인
    public async checkXrpTxs(assetCode: string, txId: string) {
        if (!assetCode || !txId) {
            LogUtil.error({ e: "checkXrpTxs(): param is undefined." });
            return { code: ResultCode.ERROR };
        }

        try {
            let tx = await this.getXrpTx(assetCode, txId);
            if (!tx || tx.type != 'payment' || !tx.specification || !tx.specification.destination) {
                LogUtil.error({ e: "checkXrpTxs(): tx is invalid.", assetCode });
                return { code: ResultCode.ERROR }
            }

            let destTag = String(tx.specification.destination.tag);

            if (!await UserWalletService.isMyAddress(assetCode, destTag)) {
                return { code: ResultCode.ERROR }
            }

            FetchUtil.get(Settings.API_SERVER + '/blk/' + assetCode + '/' + txId + '/deposit/' + Settings.API_PRIVATE_KEY);
            LogUtil.info({ i: 'fetch: deposit' + assetCode + '[' + txId + ']' }, true);

        } catch (err) {
            LogUtil.error({ e: "checkXrpTxs(): " + err.message });
            return { code: ResultCode.ERROR }
        }

        return { code: ResultCode.SUC };
    }

    // 리플 입/출금 확정 확인
    public async isConfirmedXrpTx(assetCode: string, txId: string) {
        if (!assetCode || !txId) {
            LogUtil.error({ e: "isConfirmedXrpTx(): assetCode is undefined." });
            return false;
        }

        let xrpClient = await this.getXrpClient();
        if (!xrpClient) {
            LogUtil.error({ e: "isConfirmedXrpTx(): xrpClient is undefined." });
            return { code: ResultCode.ERROR };
        };

        let tx = await this.getXrpTx(assetCode, txId);
        if (!tx || !tx.outcome || tx.outcome.result != 'tesSUCCESS') {
            LogUtil.error({ e: "isConfirmedXrpTx(): tx is undefined.", tx });
            return { code: ResultCode.ERROR };
        }

        LogUtil.info({ i: 'confirmCheck:' + assetCode + '(checked)[' + txId + ']' });

        return true;
    }

    // 리플 tx확인
    public async getXrpTx(assetCode: string, txId: string) {
        if (!assetCode || !txId) {
            LogUtil.error({ e: "getXrpTx(): param is undefined." });
            return { code: ResultCode.ERROR }
        }

        let xrpClient = await this.getXrpClient();
        if (!xrpClient) {
            LogUtil.error({ e: "getXrpTx(): client is undefined." });
            return { code: ResultCode.ERROR }
        }

        let tx;
        try {
            tx = await xrpClient.getTransaction(txId);
        } catch (err) {
            LogUtil.error({ e: "getXrpTx(): " + err.message });
            return { code: ResultCode.ERROR }
        }

        return tx;
    }

    // EOS ws 통신 연결
    public async getEosWsClient() {
        try {
            if (this.wsClientList['EOSws'] && this.wsClientList['EOSws'].isConnected()) {
                return this.wsClientList['EOSws'];
            }
        } catch (err) {
            LogUtil.error({ e: 'getEosClient(): ' + err.message })
        }

        let cfg = Settings.COIN_CONFIGS['EOS'];
        if (!cfg || cfg.type != 'eos' || !cfg.wsHost || !cfg.apiKey) {
            LogUtil.error({ e: "getEosClient(): cfg is invalid.", cfg });
            return undefined;
        }

        try {
            let client = new WebSocket("wss://" + cfg.wsHost + "/v1/ws?apikey=" + cfg.apiKey);
            this.wsClientList['EOSws'] = client;
        } catch (err) {
            LogUtil.error({ e: 'getEosClient()' + err.message });
            return undefined;
        }

        return this.wsClientList['EOSws'];
    }

    // EOS RPC 통신 연결
    public async getEosClient() {
        try {
            if (this.wsClientList['EOSjs']) {
                return this.wsClientList['EOSjs'];
            }
        } catch (err) {
            LogUtil.error({ e: 'getEosClient(): ' + err.message })
        }

        let cfg = Settings.COIN_CONFIGS['EOS'];
        if (!cfg || cfg.type != 'eos' || !cfg.rpcHost) {
            LogUtil.error({ e: "getEosClient(): cfg is invalid.", cfg });
            return undefined;
        }

        try {
            let client = new JsonRpc(cfg.rpcHost, { fetch });
            this.wsClientList['EOSjs'] = client;
        } catch (err) {
            LogUtil.error({ e: 'getEosClient()' + err.message });
            return undefined;
        }

        return this.wsClientList['EOSjs'];
    }

    // EOS tx notify
    public async connectEosWs() {
        //let eosClient = await this.getEosWsClient();
        let eosClient = await this.getEosClient();
        if (!eosClient) {
            LogUtil.error({ e: "connectEosWs(): eosClient is undefined." });
            return { code: ResultCode.ERROR };
        }

        // // 블록 감시 함수를 통해 tranfer noti
        // setInterval(async () => {
        //     let block_info = await eosClient.get_info();

        //     let block = await eosClient.get_block(block_info.head_block_num);

        //     for (let i = 0; i < block.transactions.length; i++) {
        //         let tx = block.transactions[i].trx.transaction
        //         if (!tx || !tx.actions) {
        //             continue;
        //         }
        //         for (let j = 0; j < tx.actions.length; j++) {
        //             if (tx.actions[j].name === 'transfer') {
        //                 console.log(tx.actions[j]);
        //             }
        //         }
        //     }
        // }, 100);

        // EOSPark explore 사이트 제공 API
        // eosClient.on('open', ()=> {
        //     eosClient.send(JSON.stringify({
        //         "msg_type": "subscribe_contract",
        //         "name": "eosio.token"
        //     }));
        // })

        // eosClient.on('message', async (msg) => {

        //     await TransferService.checkDisapprovalTransfer('EOS');

        //     let tx = JSON.parse(msg);

        //     if (tx.data.actions) {
        //         let desTo;
        //         for (let i = 0; i < tx.data.actions.length; i++) {
        //             desTo = tx.data.actions[i].data.to;
        //             if (!desTo || desTo == undefined) {
        //                 continue;
        //             }
        //             console.log(desTo);
        //         }
        //         if (tx.msg_type === 'data') {
        //             LogUtil.info({ i: 'noti: EOS' + '[' + tx.data.trx_id + ']' });
        //             this.eosBlockNum = tx.data.block_num;
        //             this.checkTransactions('EOS', tx.data.trx_id);
        //         }  
        //     }
        // })
    }

    // EOS 입금 확인
    public async checkEosTxs(assetCode: string, txId: string) {
        if (!assetCode || !txId) {
            LogUtil.error({ e: "checkEosTxs(): param is undefined." });
            return { code: ResultCode.ERROR };
        }

        try {
            let tx = await this.getEosTx(assetCode, txId, this.eosBlockNum);

            if (!tx || !tx.trx || !tx.trx.trx || !tx.trx.trx.actions) {
                LogUtil.error({ e: "checkEosTxs(): tx is invalid.", assetCode });
                return { code: ResultCode.ERROR };
            }
            if (tx.trx.trx.actions[0].name === 'transfer') {

                if (!await UserWalletService.isMyAddress(assetCode, tx.trx.trx.actions[0].data.memo)) {
                    return { code: ResultCode.ERROR };
                }

                FetchUtil.get(Settings.API_SERVER + '/blk/' + assetCode + '/' + txId + '/deposit/' + Settings.API_PRIVATE_KEY);
                LogUtil.info({ i: 'fetch: deposit' + assetCode + '[' + txId + ']' }, true);
            }
        } catch (err) {
            LogUtil.error({ e: "checkEosTxs(): " + err.message });
            return { code: ResultCode.ERROR }
        }

        return { code: ResultCode.SUC };
    }

    // EOS tx확인
    public async getEosTx(assetCode: string, txId: string, blockNum: any) {
        if (!assetCode || !txId || !blockNum) {
            LogUtil.error({ e: "getEosTx(): param is undefined." });
            return { code: ResultCode.ERROR }
        }

        let eosClient = await this.getEosClient();
        if (!eosClient) {
            LogUtil.error({ e: "getEosTx(): client is undefined." });
            return { code: ResultCode.ERROR }
        }

        let tx;
        try {
            tx = await eosClient.history_get_transaction(txId, blockNum);
        } catch (err) {
            LogUtil.error({ e: "getEosTx(): " + err.message });
            return { code: ResultCode.ERROR }
        }

        return tx;
    }

    // EOS 입/출금 확정 확인
    public async isConfirmedEosTx(assetCode: string, txId: string) {
        if (!assetCode || !txId) {
            LogUtil.error({ e: "isConfirmedEosTx(): assetCode is undefined." });
            return false;
        }

        let txReceipt = await this.getEosTx(assetCode, txId, this.eosBlockNum);
        if (!txReceipt || !txReceipt.trx.receipt || !txReceipt.trx.receipt.status) {
            LogUtil.info({ i: assetCode + 'confirmCheck:' + assetCode + '(status=0)[' + txId + ']' });
            return false;
        }

        let lastBlockNumber = await this.getEosLastBlock(assetCode);
        let txConfirmations = lastBlockNumber - txReceipt.block_num;
        let coinConfirmations = this.getCoinConfirmations(assetCode);

        LogUtil.info({ i: 'confirmCheck:' + assetCode + '(' + txConfirmations + '/' + coinConfirmations + ')[' + txId + ']' });

        if (txConfirmations < coinConfirmations) {
            return false;
        }

        return true;
    }

    // EOS getBlock_Num
    public async getEosLastBlock(assetCode: string) {
        if (!assetCode) {
            LogUtil.error({ e: "getEosLastBlock(): assetCode is undefined." });
            return 0;
        }
        let eosClient = await this.getEosClient();
        if (!eosClient) {
            LogUtil.error({ e: "getEosLastBlock(): client is undefined." });
            return { code: ResultCode.ERROR }
        }

        let lastBlockNumber;
        try {
            let lastBlock = await eosClient.get_info();
            lastBlockNumber = lastBlock.head_block_num;
        } catch (err) {
            LogUtil.error({ e: "getEosLastBlock():" + err.message });
            return 0;
        }

        return lastBlockNumber;
    }

    // BLOOD block tx noti
    public async connectBlood() {

        let cfg = Settings.COIN_CONFIGS['BLOOD'];
        if (!cfg || !cfg.host || !cfg.apiKey || !cfg.account) {
            LogUtil.error({ e: "getBloodRPCUrl(): cfg is invalid.", cfg });
            return undefined;
        }

        // block noti
        setInterval(async () => {
            await TransferService.checkDisapprovalTransfer('BLOOD');
        }, 300000);
    }

    // BLOOD 입금 확인
    public async checkBloodTxs(assetCode: string, txId: string) {
        if (!assetCode || !txId) {
            LogUtil.error({ e: "checkBloodTxs(): param is undefined." });
            return { code: ResultCode.ERROR };
        }

        try {
            let tx = await this.getBloodTx(assetCode, txId);

            if (!tx || !tx.result || !tx.result.confirmed || !Array.isArray(tx.result.receiver_addresses)) {
                LogUtil.error({ e: "checkBloodTxs(): tx is invalid.", tx });
                return { code: ResultCode.ERROR };
            }

            // receiver_addresses의 마지막 객체는 송금자가 잔돈을 돌려받는 주소 정보
            let receiverLength = tx.result.receiver_addresses.length > 1 ? tx.result.receiver_addresses.length - 1 : tx.result.receiver_addresses.length;
            for (let i = 0; i < receiverLength; i++) {
                let toAddress = tx.result.receiver_addresses[i].addresses;
                let amount = tx.result.receiver_addresses[i].amount / 100000;

                if (!toAddress || !amount) {
                    LogUtil.error({ e: "checkBloodTxs(): tx is invalid.", tx });
                    continue;
                }

                if (await TransferService.getTransferByTxinfo(txId, toAddress, amount)) {
                    continue;
                }

                if (!await UserWalletService.isMyAddress(assetCode, toAddress)) {
                    continue;
                }

                FetchUtil.get(Settings.API_SERVER + '/blk/' + assetCode + '/' + txId + '/deposit/' + Settings.API_PRIVATE_KEY);
                LogUtil.info({ i: 'fetch: deposit' + assetCode + '[' + txId + ']' }, true);
            }
        } catch (err) {
            LogUtil.error({ e: "checkBloodTxs(): " + err.message });
            return { code: ResultCode.ERROR }
        }

        return { code: ResultCode.SUC };
    }

    // BLOOD tx 확인
    public async getBloodTx(assetCode: string, txId: string) {
        if (!assetCode || !txId) {
            LogUtil.error({ e: "getBloodTx(): param is undefined." });
            return { code: ResultCode.ERROR }
        }

        let cfg = Settings.COIN_CONFIGS['BLOOD'];
        if (!cfg || !cfg.host || !cfg.apiKey) {
            LogUtil.error({ e: "getBloodRPCUrl(): cfg is invalid.", cfg });
            return undefined;
        }

        let tx;
        try {
            tx = await FetchUtil.post(cfg.host, {
                method: "gettransaction",
                params: [
                    txId
                ],
                id: 1,
                jsonrpc: "1.0",
                apikey: cfg.apiKey
            })
        } catch (err) {
            LogUtil.error({ e: "getBloodTx(): " + err.message });
            return { code: ResultCode.ERROR }
        }

        return tx;
    }

    // BLOOD 입/출금 확정 확인
    public async isConfirmedBloodTx(assetCode: string, txId: string) {
        if (!assetCode || !txId) {
            LogUtil.error({ e: "isConfirmedBloodTx(): assetCode is undefined." });
            return false;
        }

        let tx = await this.getBloodTx(assetCode, txId);
        if (!tx || !tx.result || !tx.result.confirmations) {
            LogUtil.info({ i: assetCode + 'confirmCheck:' + assetCode + '(status=0)[' + txId + ']' });
            return false;
        }

        // txConfirmations은 따로 카운트가 되는지 알아서 카운트가 됨
        let txConfirmations = tx.result.confirmations;
        let coinConfirmations = this.getCoinConfirmations(assetCode);

        LogUtil.info({ i: 'confirmCheck:' + assetCode + '(' + txConfirmations + '/' + coinConfirmations + ')[' + txId + ']' });

        if (txConfirmations < coinConfirmations) {
            return false;
        }

        return true;
    }

    // STI 시작
    public async connectSti() {
        
        console.log('세가새턴');
        let a = DecimalUtil.mul(2, 100000000).toFixed() + "0000000000" 
        let b= DecimalUtil.mul(2.0, 100000000).toFixed() + "0000000000" 
        let c= DecimalUtil.mul(2.01, 100000000).toFixed() + "0000000000" 

        let d= DecimalUtil.mul(4.99, 100000000).toFixed() + "0000000000" 
        let e= DecimalUtil.mul(4.990, 100000000).toFixed() + "0000000000" 
        console.log(a);
        console.log(b);
        
        console.log(c);
        console.log(d);
        console.log(e);
        
        // let stiClient = this.getStiClient()
        // if (!stiClient) {
        //     LogUtil.error({ e: "connectStiWs(): ethClient is undefined." });
        //     return { code: ResultCode.ERROR }
        // }
    
    }
    public async getStiClient() {
        
        let cfg = Settings.COIN_CONFIGS['STI'];
        if (!cfg || !cfg.host || !cfg.account) {
            LogUtil.error({ e: "getSTIUrl(): cfg is invalid.", cfg });
            return undefined;
        }
        let url = 'http://' + cfg.host + ':' + cfg.port;
        let fetchRes = await FetchUtil.post(url, {
            action: "account_info", 
            account: cfg.account
        });
        await TransferService.checkDisapprovalTransfer('STI');
        // let fetchRes = await FetchUtil.get("http://192.168.216.128:8113");
        console.log('★★★★★★★★★★★★★★★ vvv ★★★★★★★★★★★★★★★');
        console.log(fetchRes);
        return fetchRes;
        
    }
    // STI 입금 확인
    public async checkStiTxs(assetCode: string, txId: string) {
        if (!assetCode || !txId) {
            LogUtil.error({ e: "checkStiTxs(): param is undefined." });
            return { code: ResultCode.ERROR };
        }

        try {
            let tx = await this.getStiTx(assetCode, txId);

            if (!tx || !tx.block_account || !Array.isArray(tx.result.receiver_addresses)) {
                LogUtil.error({ e: "checkStiTxs(): tx is invalid.", tx });
                return { code: ResultCode.ERROR };
            }
            let cfg = Settings.COIN_CONFIGS['STI'];
            let url = 'http://' + cfg.host + ':' + cfg.port;
            let fetchRes = await FetchUtil.post(url, {
                action: "blocks_info",
                hashes: [txId]
            });
            

            let toAddress = JSON.parse(fetchRes.blocks[txId].contents).link_as_account;
            let amount = fetchRes.blocks[txId].amount;

            if (!toAddress || !amount) {
                LogUtil.error({ e: "checkStiTxs(): tx is invalid.", tx });
            }
            
            LogUtil.info({ i: 'fetch: deposit' + assetCode + '[' + txId + ']' }, true);

        } catch (err) {
            LogUtil.error({ e: "checkStiTxs(): " + err.message });
            return { code: ResultCode.ERROR }
        }

        return { code: ResultCode.SUC };
    }
    
    // STI tx 확인
    public async getStiTx(assetCode: string, txId: string) {
        if (!assetCode || !txId) {
            LogUtil.error({ e: "getStiTx(): param is undefined." });
            return { code: ResultCode.ERROR }
        }

        let cfg = Settings.COIN_CONFIGS['STI'];
        if (!cfg || !cfg.host || !cfg.port) {
            LogUtil.error({ e: "getStiUrl(): cfg is invalid.", cfg });
            return undefined;
        }

        let tx;
        let url = 'http://' + cfg.host + ':' + cfg.port;
        try {
            tx = await FetchUtil.post(url, {
            action: "blocks_info",
            hashes: [txId]
            });

        } catch (err) {
            LogUtil.error({ e: "getStiTx(): " + err.message });
            return { code: ResultCode.ERROR }
        }

        return tx;
    }
    
    // STI 입/출금 확정 확인
    public async isConfirmedStiTx(assetCode: string, txId: string) {
        if (!assetCode || !txId) {
            LogUtil.error({ e: "isConfirmedStiTx(): assetCode is undefined." });
            return false;
        }
    
        let tx = await this.getStiTx(assetCode, txId);
        if (!tx || !tx.result ) {
            LogUtil.info({ i: assetCode + 'confirmCheck:' + assetCode + '(status=0)[' + txId + ']' });
            return false;
        }
    
        let coinConfirmations = this.getCoinConfirmations(assetCode);
    
        LogUtil.info({ i: 'confirmCheck:' + assetCode + '(' + coinConfirmations + ')[' + txId + ']' });
    
        return true;
    }

    private async subscribeERC20(ethClient: any, tokenInfo: Token) {
        if (!ethClient || !tokenInfo || !tokenInfo.assetCode || !tokenInfo.contract) {
            LogUtil.error({ e: 'subscribeERC20: param is undefined.', ethClient, tokenInfo });
            return;
        }

        ethClient.eth.subscribe('logs', { address: tokenInfo.contract }, async (err, res) => {
            if (err) {
                LogUtil.error({ e: err.message })
                return;
            }

            if (!res || !Array.isArray(res.topics) || !res.data || !res.topics[2] || !res.transactionHash) {
                LogUtil.error({ e: tokenInfo.assetCode + ' subscribe: res is invalid.', res })
                return;
            }

            let toAddress = CommonUtil.parseERC20ToAddress(res.topics[2]);
            if (!toAddress) {
                LogUtil.error({ e: tokenInfo.assetCode + ' subscribe: toAddress is invalid.', toAddress });
                return;
            }
            let txId = res.transactionHash;

            if (await UserWalletService.isMyEthAddress(tokenInfo.assetCode, toAddress)) {
                FetchUtil.get(Settings.API_SERVER + '/blk/' + tokenInfo.assetCode + '/' + txId + '/deposit/' + Settings.API_PRIVATE_KEY);
                LogUtil.info({ i: 'fetch: deposit' + tokenInfo.assetCode + '[' + txId + ']' }, true);
            }
        })

        LogUtil.info({ i: 'subscribeERC20: subscribed(' + tokenInfo.assetCode + ')' });
    }
}
export const CoinService = new _CoinService();