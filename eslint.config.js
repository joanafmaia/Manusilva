import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    ignores: ['pwa/js/vendor/**', 'node_modules/**'],
  },
  js.configs.recommended,
  {
    files: ['pwa/js/**/*.js', 'pwa/api/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-console': 'off',
    },
  },
  {
    files: ['pwa/api/**/*.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
      },
    },
  },
];
