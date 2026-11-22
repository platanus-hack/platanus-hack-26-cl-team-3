/**
 * Qué APK es: versión, número de compilación, commit y rama. El número de compilación y el commit los pone el CI (o
 * scripts/compilar-apk.sh en local); la versión de app.json casi no cambia, así que sola no sirve para rastrear.
 */
export interface BuildInfo {
  version?: string;
  /** versionCode de Android: el CI lo fija en 1.000.000 más el número de la ejecución. */
  build?: number | string;
  sha?: string;
  /** Rama o referencia que se compiló: «dev», «main», «feat/x» o «35/merge» (una PR). */
  branch?: string;
}

const clean = (value: string | undefined) => value?.trim() || undefined;

function channel(branch: string | undefined): string | undefined {
  const name = clean(branch);
  const pr = name && /^(\d+)\/merge$/.exec(name);
  return pr ? `PR ${pr[1]}` : name;
}

/** «Versión 0.8.0 · compilación 1000086 · 3eda3d6 · dev»: lo que falte se omite. */
export function describeBuild(info: BuildInfo): string {
  const parts: string[] = [];
  const version = clean(info.version);
  if (version) parts.push(`Versión ${version}`);
  if (info.build !== undefined && `${info.build}`.trim()) parts.push(`compilación ${info.build}`);
  const sha = clean(info.sha)?.slice(0, 7);
  if (sha) parts.push(sha);
  const branch = channel(info.branch);
  if (branch) parts.push(branch);
  return parts.join(' · ');
}
