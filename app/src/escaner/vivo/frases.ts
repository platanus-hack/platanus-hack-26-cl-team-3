const MIN_FRASE = 20;

const finDeFrase = (texto: string, i: number) => {
  const c = texto[i];
  if (c === '\n') return true;
  if (c !== '.' && c !== '!' && c !== '?') return false;
  if (!/\s/.test(texto[i + 1] ?? '')) return false;
  if (c !== '.') return true;
  const inicioLinea = texto.lastIndexOf('\n', i - 1) + 1;
  return !/^\s*\d+$/.test(texto.slice(inicioLinea, i));
};

const unir = (a: string, b: string) => (a ? `${a} ${b}` : b);

export function crearCortador() {
  let previo = '';
  let cursor = 0;
  let junta = '';

  const reiniciar = () => {
    previo = '';
    cursor = 0;
    junta = '';
  };

  return {
    push(texto: string): string[] {
      if (!texto.startsWith(previo)) reiniciar();
      previo = texto;
      const frases: string[] = [];
      for (let i = cursor; i < texto.length; i++) {
        if (!finDeFrase(texto, i)) continue;
        const fin = texto[i] === '\n' ? i : i + 1;
        const frase = texto.slice(cursor, fin).trim();
        cursor = fin;
        if (!frase) continue;
        junta = unir(junta, frase);
        if (junta.length >= MIN_FRASE) {
          frases.push(junta);
          junta = '';
        }
      }
      return frases;
    },
    terminar(): string[] {
      const resto = unir(junta, previo.slice(cursor).trim()).trim();
      reiniciar();
      return resto ? [resto] : [];
    },
  };
}
