export const limpiarParaVoz = (texto: string): string =>
  texto
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\[\d+\]/g, "")
    .replace(/^[ \t]*(?:[-*•]\s+)/gm, "")
    .replace(/\*\*|__|`|#/g, "")
    .replace(/\s+/g, " ")
    .replace(/\s+([.,;:!?])/g, "$1")
    .trim();
