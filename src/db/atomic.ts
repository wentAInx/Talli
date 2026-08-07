const ATOMIC_DB_PATTERN = /^-?\d+$/;

export class PersistenceIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PersistenceIntegrityError";
  }
}

export function atomicToDb(amount: bigint): string {
  return amount.toString();
}

export function assertAtomicDbText(value: string): string {
  if (!ATOMIC_DB_PATTERN.test(value)) {
    throw new PersistenceIntegrityError(
      "Persisted atomic amount must be signed base-10 integer text.",
    );
  }
  return value;
}

export function atomicFromDb(value: string): bigint {
  return BigInt(assertAtomicDbText(value));
}
