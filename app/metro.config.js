// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
// El modelo de reconocimiento (assets/modelo/*.onnx) se empaqueta como asset del APK.
config.resolver.assetExts.push('onnx');

module.exports = config;
