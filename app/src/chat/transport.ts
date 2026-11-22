import type { AnthropicMessage } from './contract';

// Reserve space for request options inside the API's one MiB body limit.
const HISTORY_BUDGET = 1000 * 1024;
const encoder = new TextEncoder();

export function fitsInitialImport(messages: AnthropicMessage[]) {
  return messages.length <= 200 && encoder.encode(JSON.stringify(messages)).length <= HISTORY_BUDGET;
}

export function localContext(messages: AnthropicMessage[]) {
  let start = messages.length - 1;
  let bytes = encoder.encode(JSON.stringify(messages[start])).length;
  while (start > Math.max(0, messages.length - 30)) {
    bytes += encoder.encode(JSON.stringify(messages[start - 1])).length + 1;
    if (bytes > HISTORY_BUDGET) break;
    start--;
  }
  while (start < messages.length - 1) {
    const message = messages[start];
    if (message.role === 'user' && (typeof message.content === 'string' || message.content.some(block => block.type !== 'tool_result'))) break;
    start++;
  }
  return messages.slice(start);
}
