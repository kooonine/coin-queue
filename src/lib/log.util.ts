const winston = require('winston');
const fs = require('fs');
const logDirName = 'log';
const moment = require('moment')

if (!fs.existsSync(logDirName)) {
    fs.mkdirSync(logDirName);
}

class _LogUtil {
    errorLogger: any;
    infoLogger: any;
    prodLogger: any;
    errorLoggerInitDt: string;
    infoLoggerInitDt: string;
    prodLoggerInitDt: string;

    constructor() {
        this.initErrorLogger();
        this.initInfoLogger();
        this.initProdLogger();
    }

    initErrorLogger() {
        this.errorLogger = winston.createLogger({
            transports: [
                new winston.transports.File({
                    level: 'error',
                    filename: logDirName + '/' + moment().format('YYMMDD') + '-error.log'
                })
            ]
        });
        this.errorLoggerInitDt = new Date().toLocaleDateString();
    }

    initInfoLogger() {
        this.infoLogger = winston.createLogger({
            transports: [
                new winston.transports.File({
                    level: 'silly',
                    filename: logDirName + '/' + moment().format('YYMMDD') + '-info.log'
                })
            ]
        });
        this.infoLoggerInitDt = new Date().toLocaleDateString();
    }

    initProdLogger() {
        this.prodLogger = winston.createLogger({
            transports: [
                new winston.transports.File({
                    level: 'silly',
                    filename: logDirName + '/' + moment().format('YYMMDD') + '-prod.log'
                })
            ]
        });
        this.prodLoggerInitDt = new Date().toLocaleDateString();
    }

    error(error: {}) {
        if (!error) {
            return;
        }        
        console.log(error)

        if (new Date().toLocaleDateString() != this.errorLoggerInitDt || !this.errorLogger) {
            this.initErrorLogger();
        }

        error['ts'] = moment().format('YY-MM-DD HH:mm:ss');

        try {
            this.errorLogger.error(error);
        } catch (err) {
            console.log(err)
        }
    }

    info(info: {}, isProd: boolean = false, isTest: boolean = false) {
        if (!info) {
            return;
        }

        console.log(info)
        if (isTest) {
            // return;
        }

        if(isProd){
            this.prod(info);
        }

        if (new Date().toLocaleDateString() != this.infoLoggerInitDt || !this.infoLogger) {
            this.initInfoLogger();
        }

        info['ts'] = moment().format('YY-MM-DD HH:mm:ss');

        try {
            this.infoLogger.info(info);
        } catch (err) {
            console.log(err)
        }
    }

    prod(prod: {}) {
        if (!prod) {
            return;
        }
   
        if (new Date().toLocaleDateString() != this.prodLoggerInitDt || !this.prodLogger) {
            this.initProdLogger();
        }

        prod['ts'] = moment().format('YY-MM-DD HH:mm:ss');

        try {
            this.prodLogger.info(prod);
        } catch (err) {
            console.log(err)
        }
    }
}
export const LogUtil = new _LogUtil();