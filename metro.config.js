const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);
// Bundled sound effects are .ogg files.
if (!config.resolver.assetExts.includes('ogg')) config.resolver.assetExts.push('ogg');

// One copy of three. With package exports on (Expo SDK 53+), our `import 'three'` resolves to build/three.module.js while
// @react-three/fiber's CommonJS build `require('three')` resolves to build/three.cjs. Two copies mean fiber's native texture-loader
// patch lands on a copy the app never uses ("Property 'document' doesn't exist" in TextureLoader). Force every import to the same file.
const threeEntry = require.resolve('three');
const upstreamResolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'three') return { type: 'sourceFile', filePath: threeEntry };
  return (upstreamResolve ?? context.resolveRequest)(context, moduleName, platform);
};
module.exports = config;
