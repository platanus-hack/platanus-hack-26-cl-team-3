// Metro empaqueta los .onnx como assets (metro.config.js); require() devuelve su id de asset.
declare module '*.onnx' {
  const asset: number;
  export default asset;
}
