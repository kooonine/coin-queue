
import { ExpressRouter } from './router';
import { CoinService } from './services';
import { CoinBalanceService } from './services';

class _Main {
    constructor() {
        this.startRouter();
        // this.connectSti();
        this.test();
        // this.connectXrpWs();
        // this.connectEosWs();
        // this.connectBlood();
    }

    async startRouter() {
        ExpressRouter.init();
    }
    async test() {
        CoinBalanceService.getEthBalance();
    }

    async connectSti() {
        CoinService.connectSti();       
    }

    async connectEthWs() {
        // CoinService.connectEthWs('ETH');       
    }

    async connectXrpWs() {
        // CoinService.connectXrpWs();
    }

    async connectEosWs() {
        // CoinService.connectEosWs();
    }

    async connectBlood() {
        // CoinService.connectBlood();
    }
}

const Main = new _Main();