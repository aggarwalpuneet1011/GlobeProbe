const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);
// Bundled sound effects are .ogg files.
if (!config.resolver.assetExts.includes('ogg')) config.resolver.assetExts.push('ogg');
module.exports = config;
