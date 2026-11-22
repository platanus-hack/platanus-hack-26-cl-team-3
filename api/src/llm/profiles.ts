import type { Profile } from "../chat/contract";

export const profiles: Profile[] = [
  { id: "sonnet", name: "Claude Sonnet 5.5", model: "claude-sonnet-5-5", isDefault: true },
  { id: "opus", name: "Claude Opus 5.5", model: "claude-opus-5-5" },
  { id: "haiku", name: "Claude Haiku 5.5", model: "claude-haiku-5-5" },
];

export function resolveProfile(id: unknown): Profile | undefined {
  if (id === undefined || id === null) return profiles.find((p) => p.isDefault);
  return profiles.find((p) => p.id === id);
}
