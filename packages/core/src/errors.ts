/**
 * Erros de domínio com código estável. Preferir `instanceof` / `error.code`
 * em vez de comparar `error.message` (frágil a typos e refactors).
 */
export class DomainError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "DomainError";
  }
}

export class InsufficientPointsError extends DomainError {
  constructor() {
    super("INSUFFICIENT_POINTS");
    this.name = "InsufficientPointsError";
  }
}

export function domainErrorCode(error: unknown): string | null {
  return error instanceof DomainError ? error.code : null;
}

/** Retorna o código se o erro for um DomainError com um dos códigos listados. */
export function matchDomainCode<T extends string>(
  error: unknown,
  codes: readonly T[]
): T | null {
  const code = domainErrorCode(error);
  if (code && (codes as readonly string[]).includes(code)) {
    return code as T;
  }
  return null;
}
