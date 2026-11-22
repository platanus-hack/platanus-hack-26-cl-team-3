export const color = {
  fondo: '#101215',
  superficie: '#1A1E23',
  superficieAlta: '#22282E',
  borde: '#2B3036',
  texto: '#F2F4F7',
  textoSuave: '#A7ADB4',
  textoTenue: '#949EA9',
  acento: '#00A3FC',
  acentoPresionado: '#0086CF',
  acentoTexto: '#08131C',
  acentoSuave: 'rgba(0, 163, 252, 0.14)',
  exito: '#3DDC84',
  exitoSuave: 'rgba(61, 220, 132, 0.16)',
  peligro: '#FF6B6B',
  velo: 'rgba(10, 12, 16, 0.72)',
} as const;

export const video = {
  panel: '#192228',
  control: '#26343d',
  borde: '#51616b',
  presionado: '#14537A',
  texto: '#edf2f4',
  textoSuave: '#cbd7dc',
  paso: '#A2DFFF',
  radio: 6,
  espacio: 8,
} as const;

export const espacio = { xs: 4, s: 8, m: 12, l: 16, xl: 24, xxl: 32 } as const;
export const radio = { s: 8, m: 12, l: 18, xl: 24 } as const;

export const tipo = {
  titulo: { fontSize: 28, fontWeight: '800' as const, color: color.texto, letterSpacing: -0.5 },
  subtitulo: { fontSize: 15, color: color.textoSuave },
  seccion: { fontSize: 13, fontWeight: '700' as const, color: color.textoTenue, letterSpacing: 1, textTransform: 'uppercase' as const },
  cuerpo: { fontSize: 15, color: color.texto, lineHeight: 22 },
  nota: { fontSize: 13, color: color.textoSuave, lineHeight: 19 },
};
