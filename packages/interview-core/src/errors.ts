/** Expected, client-attributable failures. Anything else is an unexpected server error. */
export type DomainErrorKind = "not_found" | "conflict" | "limit" | "quota" | "transition" | "invalid";

export class DomainError extends Error {
  constructor(readonly kind: DomainErrorKind, message: string) {
    super(message);
    this.name = "DomainError";
  }
}
