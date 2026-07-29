import js from '@eslint/js'
import ts from 'typescript-eslint'
import vue from 'eslint-plugin-vue'
import prettier from 'eslint-config-prettier/flat'
import globals from 'globals'

export default ts.config(
  {
    ignores: [
      'dist/**',
      'examples/**',
      'public/**',
      'src/archive/**',
      'tests/archive/**',
      'vite.config.js',
      'vite.config.d.ts',
      'vite/*.js',
      'vite/*.d.ts',
      '_e2e-probe.cjs',
      'node_modules/**',
      '_eslint-*.json',
      // Standalone scripts; niet in tsconfig projectService.
      'scripts/**',
    ],
  },
  js.configs.recommended,
  ...ts.configs.recommendedTypeChecked,
  ...vue.configs['flat/recommended'],
  {
    files: ['**/*.{ts,vue}'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
        extraFileExtensions: ['.vue'],
      },
    },
  },
  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: {
        parser: ts.parser,
      },
    },
  },
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      // Codebase gebruikt _prefix voor bewust ongebruikte bindings (destructure / API-shape).
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
        },
      ],
      // OpenCV = any (geen officiële typings). no-unsafe-* zou elke cv.-aanroep markeren
      // (~240 plekken). Eigen typings later (audit A8); tot die tijd uit.
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      // OpenCV = any → Mat|null / OpenCV|undefined altijd “redundant”.
      '@typescript-eslint/no-redundant-type-constituents': 'off',
      // Veel async API-shapes (extractor/composable contracts) zonder interne await.
      '@typescript-eslint/require-await': 'off',
      // Destructuring van composable/method refs in Vue — false positives op this-binding.
      '@typescript-eslint/unbound-method': 'off',
    },
  },
  // Scripts / config zonder projectService-types.
  {
    files: ['**/*.{js,mjs,cjs}', 'eslint.config.js'],
    ...ts.configs.disableTypeChecked,
  },
  prettier,
)
