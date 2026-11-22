export type TranscribeErrorKind = "config" | "auth" | "busy" | "upstream";

export class TranscribeError extends Error {
  constructor(readonly kind: TranscribeErrorKind, message: string = kind) {
    super(message);
  }
}
