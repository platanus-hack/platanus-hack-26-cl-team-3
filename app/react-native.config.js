// onnxruntime-react-native trae un `unimodule.json` (formato viejo de Expo). Con él, el autolinking de Expo lo trata como
// «módulo Expo» y, al tener además su propio build.gradle, lo EXCLUYE del autolinking de React Native
// (expo-modules-autolinking/build/reactNativeConfig/androidResolver.js). Resultado: OnnxruntimePackage no se registraba,
// NativeModules.Onnxruntime era undefined y la app se cerraba al abrir «Escanear capó».
// Declarar aquí su configuración hace que el autolinking de React Native lo registre.
module.exports = {
  dependencies: {
    'onnxruntime-react-native': {
      platforms: {
        android: {
          packageImportPath: 'import ai.onnxruntime.reactnative.OnnxruntimePackage;',
          packageInstance: 'new OnnxruntimePackage()',
        },
      },
    },
  },
};
