export enum ErrorCode {
  E001_NO_SESSION        = 'E001_NO_SESSION',
  E002_DEVICE_OFFLINE    = 'E002_DEVICE_OFFLINE',
  E003_APP_NOT_FOUND     = 'E003_APP_NOT_FOUND',
  E004_DRIVER_MISSING    = 'E004_DRIVER_MISSING',
  E005_CONFIG_CORRUPT    = 'E005_CONFIG_CORRUPT',
  E006_TS_COMPILE_FAIL   = 'E006_TS_COMPILE_FAIL',
  E007_AMBIGUITY         = 'E007_AMBIGUITY',
  E008_PRECONDITION_FAIL = 'E008_PRECONDITION_FAIL',
}

export class AppForgeError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly remediation: string[]
  ) {
    super(message);
    this.name = 'AppForgeError';
  }
}
