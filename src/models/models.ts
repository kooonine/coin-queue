


// 결과 코드
export class ResultCode {
    static readonly SUC: number = 200;
    static readonly ERROR: number = 500;
}
export class Token {
    contract: string;
    decimal: number;
    assetCode: string;
    coinbase: string;
    password: string;
    basePw: string;
    useYn: boolean;    
    inDt: Date;    
}
