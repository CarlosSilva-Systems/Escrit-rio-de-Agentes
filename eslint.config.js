import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      'schemas/**',
      'assets/**',
      'assets-private/**',
      'spikes/**',
      'third_party/**',
      'docs/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
    },
  },
  {
    files: [
      'src/server/**',
      'src/cli/**',
      'src/shared/**',
      'scripts/**',
      'tests/**',
      '*.ts',
      '*.js',
    ],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: ['src/web/**'],
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    // Hook runtime scripts: plain CommonJS, no dependencies, no build.
    files: ['src/hook-runtime/**/*.cjs'],
    languageOptions: { sourceType: 'commonjs', globals: { ...globals.node } },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
);
