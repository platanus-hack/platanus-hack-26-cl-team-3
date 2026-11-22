type Permission = { granted: boolean; canAskAgain: boolean };

export const MICROPHONE_DENIED = 'Necesito permiso de micrófono. Toca el micrófono para reintentar.';
export const MICROPHONE_BLOCKED = 'El permiso está bloqueado. Toca el micrófono para abrir Ajustes.';

export function microphoneError(permission: Permission) {
  return permission.canAskAgain ? MICROPHONE_DENIED : MICROPHONE_BLOCKED;
}

// Android can pause the scanner while its permission activity is in front.
// Keep the prompt result across foreground changes within one listening session.
export function createMicrophonePermission(
  check: () => Promise<Permission>,
  request: () => Promise<Permission>,
) {
  let prompt: Promise<Permission> | undefined;
  return async (isActive: () => boolean) => {
    const current = await check();
    if (current.granted || !current.canAskAgain || !isActive()) return current;
    prompt ??= request().catch(error => {
      prompt = undefined;
      throw error;
    });
    await prompt;
    return check();
  };
}
