// @ts-check
// SonarSource's JavaScript/TypeScript rules (the analyser SonarQube runs on the
// server), usable locally: `npm run lint:sonar`. Kept apart from eslint.config.mjs
// so the everyday lint stays fast and its error budget unchanged.
import globals from 'globals';
import sonarjs from 'eslint-plugin-sonarjs';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'coverage/**', 'node_modules/**', '*.mjs'] },
  {
    files: ['src/**/*.ts', 'test/**/*.ts'],
    extends: [sonarjs.configs.recommended],
    languageOptions: {
      parser: tseslint.parser,
      globals: { ...globals.node, ...globals.jest },
      sourceType: 'commonjs',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    // Loaded only so that comments silencing the everyday linter's rules are
    // understood; none of its rules is switched on here.
    plugins: { '@typescript-eslint': tseslint.plugin },
    linterOptions: { reportUnusedDisableDirectives: 'off' },
  },
  {
    // SonarQube applies its production-code rules to production code only.
    // The same here: these make no sense for tests (exact values, fixed test
    // data, sorting to compare two lists, long arrange/act/assert functions).
    files: ['**/*.spec.ts', 'test/**/*.ts'],
    rules: {
      'sonarjs/cognitive-complexity': 'off',
      'sonarjs/deprecation': 'off',
      'sonarjs/no-alphabetical-sort': 'off',
      'sonarjs/no-floating-point-equality': 'off',
      'sonarjs/no-hardcoded-ip': 'off',
      'sonarjs/no-misleading-array-reverse': 'off',
      'sonarjs/no-nested-conditional': 'off',
      'sonarjs/pseudo-random': 'off',
      'sonarjs/void-use': 'off',
    },
  },
);
