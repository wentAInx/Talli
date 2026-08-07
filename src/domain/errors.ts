export class DomainValidationError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "DomainValidationError";
  }
}

export function assertDomain(
  condition: unknown,
  code: string,
  message: string,
): asserts condition {
  if (!condition) {
    throw new DomainValidationError(code, message);
  }
}
