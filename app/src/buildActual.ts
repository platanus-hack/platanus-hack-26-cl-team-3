import Constants from 'expo-constants';

import type { BuildInfo } from './version';

/**
 * La del APK que está corriendo. La versión y el número de compilación salen de app.json tal como estaba al compilar
 * (el CI cambia el versionCode antes de compilar). El commit y la rama llegan como EXPO_PUBLIC_BUILD_SHA y
 * EXPO_PUBLIC_BUILD_BRANCH, que scripts/compilar-apk.sh deja puestas; Expo las copia al código al empaquetar, por eso se
 * escriben tal cual y no se pueden leer dinámicamente.
 */
export const buildActual = (): BuildInfo => ({
  version: Constants.expoConfig?.version,
  build: Constants.expoConfig?.android?.versionCode,
  sha: process.env.EXPO_PUBLIC_BUILD_SHA,
  branch: process.env.EXPO_PUBLIC_BUILD_BRANCH,
});
