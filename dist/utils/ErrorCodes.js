export var ErrorCode;
(function (ErrorCode) {
    ErrorCode["E001_NO_SESSION"] = "E001_NO_SESSION";
    ErrorCode["E002_DEVICE_OFFLINE"] = "E002_DEVICE_OFFLINE";
    ErrorCode["E003_APP_NOT_FOUND"] = "E003_APP_NOT_FOUND";
    ErrorCode["E004_DRIVER_MISSING"] = "E004_DRIVER_MISSING";
    ErrorCode["E005_CONFIG_CORRUPT"] = "E005_CONFIG_CORRUPT";
    ErrorCode["E006_TS_COMPILE_FAIL"] = "E006_TS_COMPILE_FAIL";
    ErrorCode["E007_AMBIGUITY"] = "E007_AMBIGUITY";
    ErrorCode["E008_PRECONDITION_FAIL"] = "E008_PRECONDITION_FAIL";
})(ErrorCode || (ErrorCode = {}));
export class AppForgeError extends Error {
    code;
    remediation;
    constructor(code, message, remediation) {
        super(message);
        this.code = code;
        this.remediation = remediation;
        this.name = 'AppForgeError';
    }
}
