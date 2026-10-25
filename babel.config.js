module.exports = function (api) {
  api.cache(true);
  // babel-preset-expo (SDK 54) auto-adds the Reanimated / Worklets plugin when the packages are installed.
  return { presets: ['babel-preset-expo'] };
};
