// @ts-check
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config({
        ignores: ['eslint.config.mjs'],
    },
    eslint.configs.recommended,
    ...tseslint.configs.recommendedTypeChecked,
    eslintPluginPrettierRecommended, {
        languageOptions: {
            globals: {
                ...globals.node,
                ...globals.jest,
            },
            sourceType: 'commonjs',
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname,
            },
        },
    }, {
        rules: {
            // Bug-finding rules: errors.
            '@typescript-eslint/no-floating-promises': 'error',
            '@typescript-eslint/no-misused-promises': 'error',

            // Legacy debt, tightened module by module: warnings for now.
            '@typescript-eslint/no-explicit-any': 'warn',
            '@typescript-eslint/no-unsafe-argument': 'warn',
            '@typescript-eslint/no-unsafe-assignment': 'warn',
            '@typescript-eslint/no-unsafe-member-access': 'warn',
            '@typescript-eslint/no-unsafe-call': 'warn',
            '@typescript-eslint/no-unsafe-return': 'warn',
            '@typescript-eslint/no-unsafe-enum-comparison': 'warn',
            '@typescript-eslint/no-unsafe-function-type': 'warn',
            '@typescript-eslint/no-unused-vars': 'warn',
            '@typescript-eslint/require-await': 'warn',
            '@typescript-eslint/no-unnecessary-type-assertion': 'warn',
            '@typescript-eslint/restrict-template-expressions': 'warn',
            '@typescript-eslint/no-base-to-string': 'warn',
            '@typescript-eslint/no-redundant-type-constituents': 'warn',
            '@typescript-eslint/no-require-imports': 'warn',
            '@typescript-eslint/prefer-promise-reject-errors': 'warn',
            '@typescript-eslint/unbound-method': 'warn',
            '@typescript-eslint/no-non-null-asserted-optional-chain': 'warn',
            '@typescript-eslint/no-empty-object-type': 'warn',
            'prettier/prettier': 'warn',
        },
    }, {
        // Tests pass async callbacks to middleware `next` and timers on purpose.
        files: ['**/*.spec.ts', 'test/**/*.ts'],
        rules: {
            '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: false }],
        },
    },
);