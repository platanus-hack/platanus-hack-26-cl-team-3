export const CAPTION_CHARS = 70;
export const CAPTION_MIN_BREAK = 0.4;
export const READ_BASE_MS = 900;
export const READ_PER_WORD_MS = 300;

const BREAK = /[.,:;?!]$/;
const LIST_MARK = /^\d+[.)]$/;

export function captionChunks(text: string, max = CAPTION_CHARS): string[] {
  const chunks: string[] = [];
  for (const paragraph of text.split(/\n+/)) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    let start = 0;
    while (start < words.length) {
      let end = start;
      let length = -1;
      while (end < words.length && length + 1 + words[end].length <= max) {
        length += 1 + words[end].length;
        end += 1;
      }
      if (end === start) end = start + 1;
      else if (end < words.length) {
        let used = -1;
        let cut = 0;
        for (let k = start; k < end; k++) {
          used += 1 + words[k].length;
          if (BREAK.test(words[k]) && !LIST_MARK.test(words[k]) && used >= max * CAPTION_MIN_BREAK) cut = k + 1;
        }
        if (cut) end = cut;
      }
      chunks.push(words.slice(start, end).join(' '));
      start = end;
    }
  }
  return chunks;
}

export const readingMs = (chunk: string) => READ_BASE_MS + chunk.split(/\s+/).filter(Boolean).length * READ_PER_WORD_MS;

export const sourceLabel = (title: string) => title.split(/ — | \(/)[0].trim();
