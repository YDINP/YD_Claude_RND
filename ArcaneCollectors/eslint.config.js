import globals from 'globals';
import eslintConfigPrettier from 'eslint-config-prettier';

export default [
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        Phaser: 'readonly',
      },
    },
    rules: {
      // === 기본 품질 규칙 ===
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always'],
      'no-var': 'error',
      'prefer-const': 'warn',
      'no-shadow': ['warn', { builtinGlobals: false, hoist: 'functions' }],

      // === Phaser/게임 개발 특화 규칙 ===
      'no-loss-of-precision': 'error',
      'no-template-curly-in-string': 'warn',
      'no-unreachable': 'error',
      'no-duplicate-case': 'error',
      'no-self-assign': 'error',
      'no-self-compare': 'error',
      'no-constant-binary-expression': 'error',
      'default-case-last': 'warn',
      'grouped-accessor-pairs': 'warn',
      'no-constructor-return': 'error',
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-wrappers': 'error',
      'no-throw-literal': 'error',
      'prefer-template': 'warn',
    },
  },
  {
    ignores: ['dist/', 'node_modules/', '.serena/', '*.config.js'],
  },
  eslintConfigPrettier,
];
