export class Settings {
    static readonly MONGO_URL = "mongodb://test.ventasbit.com:28017";
    static readonly MONGO_DB = "ventas-PROD";
    static readonly API_SERVER = "http://test.ventasbit:3000";
    static readonly API_PRIVATE_KEY = "Vent@sPriv@teKey12291!";
    static readonly COIN_CONFIGS = {
        "STI": {
            "port": 8113,
            "host": "192.168.216.128",
            "walletId": "4F1D58F337CB020CE0078BFCA2422B1EA32AAFFC22C34EF212D22C614E37023C",
            "account": "St7kmhggt5dpbb5caeii11gefwii65gpd6z1w86ojktnf96mjxcwc416pszi1",
            "type": "sti"            
        },
        "LTC": {
            "port": 19443,
            "username": "ventas",
            "host": "test.ventasbit.com",
            "password": "pw",
            "type": "bitcoin",
            "confirmations": 12
        },
        "BTC": {
            "port": 18443,
            "username": "ventas",
            "host": "test.ventasbit.com",
            "password": "pw",
            "type": "bitcoin",
            "confirmations": 2
        },
        "VENC": {
            "port": 13102,
            "username": "ventas",
            "host": "test.ventasbit.com",
            "password": "pw",
            "type": "bitcoin",
            "confirmations": 6
        },
        "ETH": {
            "rpcPort": 8545,
            "wsPort": 8546,
            "host": "qt1.ventasbit.com",
            "type": "eth",
            "confirmations": 24,
            "password": "ventassmqt4$"
        },
        "QTUM": {
            "port": 13889,
            "username": "ventas",
            "host": "test.ventasbit.com",
            "password": "pw",
            "type": "bitcoin",
            "confirmations": 16
        },
        "BCH": {
            "port": 18332,
            "username": "ventas",
            "host": "test.ventasbit.com",
            "password": "pw",
            "type": "bitcoin",
            "confirmations": 15
        },
        "XMR": {
            "port": 3112,
            "host": "qt2.ventasbit.com",
            "type": "xmr",
            "confirmations": 10
        },
        "ADA": {
            "port": 8090,
            "host": "test.ventasbit.com",
            "type": "ada",
            "walletId": "Ae2tdPwUPEZHcWinGHQdnh4htUGUbdQ9KFM7HmphmgqKx8H5wZcESdpZ6Xn",
            "accountIndex": 2147483648,
            "confirmations": 20
        },
        "XRP": {
            "wsPort": 6006,
            "host": "test.ventasbit.com",
            "accountId": "rDBqE7xvhY8UerZGV8wiZDnpc5bgztv3f3",
            "secret": "pw",
            "type": "xrp",
            "confirmations": 1
        },
        "BLOOD": {
            "host": "https://ventas01.blood.land",
            "apiKey": "VENTAS-IDc1A2Vs",
            "apiPwd": "pw",
            "type": "blood",
            "account": "ventas",
            "confirmations": 6
        }
    }
}