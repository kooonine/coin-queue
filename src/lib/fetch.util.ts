import { LogUtil } from "./log.util";




const fetch = require('node-fetch');

class _FetchUtil {   
    
    async get(url: string){
        if(!url){
            LogUtil.error({ e: 'get(): param is undefined.', url });
            undefined;
        }
        
        try{
            let fetchRes = await fetch(url, {
                method: 'GET',
                headers: {
                    "Content-Type": "application/json; charset=utf-8"
                }
            });

            if(!fetchRes){
                LogUtil.error({ e: 'get(): fetchRes is undefined.', url });
                return undefined;
            }                        

            return fetchRes;
        }catch(err){
            LogUtil.error({ e: 'get(): ' + err.message });
            return undefined;
        }
        
    }

    async post(url: string, body: any){
        if(!url || !body){
            LogUtil.error({ e: 'post(): invalid param.', url, body });
            undefined;
        }

        try{
            let fetchRes = await fetch(url, {
                method: 'POST',
                headers: {
                    "Content-Type": "application/json; charset=utf-8"
                },                
                body: JSON.stringify(body)
            });

            if(!fetchRes){
                LogUtil.error({ e: 'post(): fetchRes is undefined.', url });
                return undefined;
            }

            let fetchResult = await fetchRes.json();

            if(!fetchResult){
                LogUtil.error({ e: 'post(): fetchResult is undefined.', url });
                return undefined;
            }

            return fetchResult;
        }catch(err){
            LogUtil.error({ e: 'post(): ' + err.message });
            return undefined;
        }
    }
   
}
export const FetchUtil = new _FetchUtil();