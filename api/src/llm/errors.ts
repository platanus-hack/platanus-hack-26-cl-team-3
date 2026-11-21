export type ProviderErrorCode = "provider" | "credit";

export class ProviderError extends Error {
  readonly code: ProviderErrorCode;

  constructor(message: string, code: ProviderErrorCode = "provider") {
    super(message);
    this.code = code;
  }
}
