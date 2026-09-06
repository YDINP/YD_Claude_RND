export {
  GameManifestSchema,
  parseGameManifest,
  toGameSummary,
  type GameManifest,
} from './manifest.js'
export type { AudioBus, GameClient, GameContext, HapticKind, Signal } from './context.js'

export {
  ArtFxFileSchema,
  FrameLayoutSchema,
  FrameWindowSchema,
  FX_DEFAULT_KEY,
  FX_EFFECT_FIELDS,
  FX_TYPES,
  FxEffectSchema,
  FxMapSchema,
  FxSymbolSchema,
  ReelBackdropSchema,
  SFX_KEYS,
  SfxSchema,
  SheetMapSchema,
  SheetSymbolSchema,
  THEME_DEFAULT_PALETTE,
  THEME_DEFAULT_VERSION,
  ThemeFileSchema,
  ThemePaletteSchema,
  ThemeTransitionsSchema,
  emptyTheme,
  sheetAtlasPath,
  themeAssetRefs,
  type ArtFxFile,
  type FrameLayout,
  type FrameWindow,
  type FxEffect,
  type FxMap,
  type FxSymbol,
  type FxType,
  type ReelBackdrop,
  type SfxKey,
  type SheetMap,
  type SheetSymbol,
  type ThemeAssetRef,
  type ThemeFile,
  type ThemePalette,
  type ThemeTransitions,
} from './theme.js'

export {
  ASSET_KINDS,
  ASSET_SIZES,
  PromptAssetSchema,
  PromptsFileError,
  PromptsFileSchema,
  findDuplicateAssetId,
  parsePromptsFile,
  type AssetKind,
  type AssetSize,
  type PromptAsset,
  type PromptsFile,
} from './prompts.js'

export {
  GamePackError,
  PACK_FILES,
  REQUIRED_PACK_FILES,
  createMemorySource,
  formatProblem,
  hasErrors,
  inspectGamePack,
  packProblem,
  type GamePack,
  type PackFileKey,
  type PackInspection,
  type PackProblem,
  type PackSource,
  type ProblemLevel,
} from './pack.js'

export {
  checkGamePack,
  normalizePackPath,
  parseGamePack,
  resolveThemePath,
  thumbnailPackPath,
  validateGamePack,
  type ValidateOptions,
} from './validate.js'

export {
  GAME_ID_PATTERN,
  SCAFFOLD_FILES,
  TEMPLATE_ID,
  isValidGameId,
  scaffoldGamePack,
  titleFromId,
  type ScaffoldResult,
} from './scaffold.js'

export {
  CHECK_USAGE,
  formatReport,
  formatTotals,
  parseCheckArgs,
  shouldFail,
  summarizeReport,
  type CheckCliOptions,
  type PackReport,
} from './checkReport.js'
