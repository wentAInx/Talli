export class ServiceError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ServiceError";
  }
}

export function assertService(
  condition: unknown,
  code: string,
  message: string,
): asserts condition {
  if (!condition) {
    throw new ServiceError(code, message);
  }
}
