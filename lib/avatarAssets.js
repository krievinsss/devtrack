const V='20260826-3';
export const AVATAR_ASSETS={
  avatar_pixel:`/avatars/pixel-dev.svg?v=${V}`,
  avatar_bot:`/avatars/compile-bot.svg?v=${V}`,
  avatar_cat:`/avatars/keyboard-cat.svg?v=${V}`,
  avatar_wizard:`/avatars/code-wizard.svg?v=${V}`,
  avatar_sigma:`/avatars/sigma-core.svg?v=${V}`,
  avatar_67:`/avatars/six-seven.svg?v=${V}`,
  avatar_crashout:`/avatars/crashout.svg?v=${V}`,
  avatar_goated:`/avatars/goated.svg?v=${V}`,
  avatar_unc:`/avatars/unc.svg?v=${V}`,
  avatar_aura:`/avatars/aura-farmer.svg?v=${V}`,
  avatar_matrix:`/avatars/matrix-dev.svg?v=${V}`,
  avatar_void:`/avatars/void-king.svg?v=${V}`
};
export function avatarAsset(id){return AVATAR_ASSETS[id]||null}
export const AVATAR_BUILD=V;
