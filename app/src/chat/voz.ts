export type OpcionesVoz = { apiUrl: string; token?: string };

export const fuenteVoz = (frase: string, { apiUrl, token }: OpcionesVoz) => ({
  uri: `${apiUrl}/api/speak?text=${encodeURIComponent(frase)}`,
  headers: token ? { 'x-chat-token': token } : ({} as Record<string, string>),
});
