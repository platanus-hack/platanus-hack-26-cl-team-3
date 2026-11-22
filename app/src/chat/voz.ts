export type OpcionesVoz = { apiUrl: string; token?: string; voz?: string };

export const fuenteVoz = (frase: string, { apiUrl, token, voz }: OpcionesVoz) => ({
  uri: `${apiUrl}/api/speak?text=${encodeURIComponent(frase)}${voz ? `&voz=${encodeURIComponent(voz)}` : ''}`,
  headers: token ? { 'x-chat-token': token } : ({} as Record<string, string>),
});
