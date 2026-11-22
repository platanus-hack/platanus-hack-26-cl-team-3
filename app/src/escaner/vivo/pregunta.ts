export function juntarPregunta(pendiente: string, nueva: string): string {
  return [pendiente, nueva]
    .map((parte) => parte.trim())
    .filter(Boolean)
    .join(' ');
}
