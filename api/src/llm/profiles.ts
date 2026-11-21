import type { Profile } from "../chat/contract";

export const profiles: Profile[] = [
  { id: "opus", name: "Claude Opus 5.5", model: "anthropic/claude-opus-5.5", isDefault: true },
];

export function resolveProfile(id: unknown): Profile | undefined {
  if (id === undefined || id === null) return profiles.find((p) => p.isDefault);
  return profiles.find((p) => p.id === id);
}
