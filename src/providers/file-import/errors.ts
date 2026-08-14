export type FileImportErrorCode =
  | "FILE_TOO_LARGE"
  | "TOO_MANY_ROWS"
  | "TEXT_FIELD_TOO_LONG"
  | "DECODE_FAILED"
  | "MALFORMED_FILE"
  | "UNSUPPORTED_FORMAT"
  | "INVALID_CONFIG"
  | "INVALID_DATE"
  | "INVALID_AMOUNT"
  | "CURRENCY_MISMATCH"
  | "ACCOUNT_MISMATCH"
  | "XML_DTD_FORBIDDEN"
  | "XML_ENTITY_FORBIDDEN"
  | "XML_XINCLUDE_FORBIDDEN";

export class FileImportError extends Error {
  readonly code: FileImportErrorCode;

  constructor(code: FileImportErrorCode, message: string) {
    super(message);
    this.name = "FileImportError";
    this.code = code;
  }
}

export function fileImportFailure(
  code: FileImportErrorCode,
  message: string,
): never {
  throw new FileImportError(code, message);
}
