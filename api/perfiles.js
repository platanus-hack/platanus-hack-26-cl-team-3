export const perfiles = [
  { id: "opus", nombre: "Claude Opus 5.5", modelo: "anthropic/claude-opus-5.5", por_defecto: true },
];

export function resolverPerfil(id) {
  if (id === undefined || id === null) return perfiles.find((p) => p.por_defecto);
  return perfiles.find((p) => p.id === id);
}
