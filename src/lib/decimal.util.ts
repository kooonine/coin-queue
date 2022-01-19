var bigdecimal = require("bigdecimal");

class _DecimalUtil {

    public sub(a: any, b: any, toString: boolean = false) {
        let decimalA = new bigdecimal.BigDecimal(String(a)).setScale(14, bigdecimal.BigDecimal.ROUND_HALF_UP);
        let decimalB = new bigdecimal.BigDecimal(String(b)).setScale(14, bigdecimal.BigDecimal.ROUND_HALF_UP);


        let result = decimalA.subtract(decimalB).setScale(14, bigdecimal.BigDecimal.ROUND_HALF_UP).toString();
        
        if(toString){
            return result;
        }
        
        return this.floorHighNumDecimalPoint(result);
    }
    public add(a: any, b: any, toString: boolean = false) {        
        let decimalA = new bigdecimal.BigDecimal(String(a)).setScale(14, bigdecimal.BigDecimal.ROUND_HALF_UP);
        let decimalB = new bigdecimal.BigDecimal(String(b)).setScale(14, bigdecimal.BigDecimal.ROUND_HALF_UP);

        let result = decimalA.add(decimalB).setScale(14, bigdecimal.BigDecimal.ROUND_HALF_UP).toString();
        
        if(toString){
            return result;
        }        
        return this.floorHighNumDecimalPoint(result);
    }
    public mul(a: any, b: any, toString: boolean = false) {
        let decimalA = new bigdecimal.BigDecimal(String(a)).setScale(14, bigdecimal.BigDecimal.ROUND_HALF_UP);
        let decimalB = new bigdecimal.BigDecimal(String(b)).setScale(14, bigdecimal.BigDecimal.ROUND_HALF_UP);

        let result =  decimalA.multiply(decimalB).setScale(14, bigdecimal.BigDecimal.ROUND_HALF_UP).toString();

        if(toString){
            return result;
        }
        
        return this.floorHighNumDecimalPoint(result);
    }
    public div(a: any, b: any, toString: boolean = false) {
        let decimalA = new bigdecimal.BigDecimal(String(a)).setScale(14, bigdecimal.BigDecimal.ROUND_HALF_UP);
        let decimalB = new bigdecimal.BigDecimal(String(b)).setScale(14, bigdecimal.BigDecimal.ROUND_HALF_UP);

        let result = decimalA.divide(decimalB, 14, bigdecimal.BigDecimal.ROUND_HALF_UP).toString();
        
        if(toString){
            return result;
        }
        
        return this.floorHighNumDecimalPoint(result);
    }

    // 특정 소숫점 자리수 이하 자르는 함수
    public floorDecimalPoint(num: any, place: number) {
        if (!Number(num) || (!Number(place) && place != 0)) {
            return num;
        }

        if (place > 9) {
            place = 9;
        } else if (place < -9) {
            place = -9;
        }

        let numStr = String(parseFloat(num.toFixed(9)));
        let commaIndex = numStr.indexOf('.');
        if (commaIndex == -1) {
            return num;
        }

        return Number(numStr.substring(0, commaIndex + place + 1));
    }
    
    public floorHighNumDecimalPoint(result: string){
        let commaIndex = result.indexOf('.');
        if (commaIndex == -1) {
            return Number(result);
        }

        let place = 8;

        if (Number(result) > 1000000000){
            place = 5;
        } else if (Number(result) > 100000000){
            place = 6;
        } else if (Number(result) > 10000000){
            place = 7;
        }        
        
        return Number(result.substring(0, commaIndex + place + 1));
    }
}
export const DecimalUtil = new _DecimalUtil();