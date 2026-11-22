// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

const path = require('node:path');
const config = getDefaultConfig(__dirname);
config.watchFolders.push(path.resolve(__dirname, '../api/src/data/fuse-catalog'));
// El modelo de reconocimiento (assets/modelo/*.onnx) se empaqueta como asset del APK.
config.resolver.assetExts.push('onnx');

module.exports = config;
