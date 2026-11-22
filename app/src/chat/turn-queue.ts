// The camera and text views share one active history and conversation identity.
let tail: Promise<unknown> = Promise.resolve();

export function withChatTurn<T>(work: () => Promise<T>): Promise<T> {
  const result = tail.then(work);
  tail = result.catch(() => {});
  return result;
}
