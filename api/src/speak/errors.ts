export type SpeakErrorKind = "config" | "auth" | "busy" | "upstream";

export class SpeakError extends Error {
  constructor(readonly kind: SpeakErrorKind, message: string = kind) {
    super(message);
  }
}
