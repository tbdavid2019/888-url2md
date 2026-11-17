import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';

export default [
    {
        ignores: [
            'build/**',
            'tests-build/**',
            'node_modules/**',
            'assets/**',
            'licensed/**',
            'data/**',
            'public/**',
            'deploy/**',
        ],
    },
    {
        files: ['src/**/*.ts', 'tests/**/*.ts'],
        linterOptions: {
            reportUnusedDisableDirectives: 'off',
        },
        languageOptions: {
            parser: tsParser,
            parserOptions: {
                ecmaVersion: 'latest',
                sourceType: 'module',
            },
        },
        plugins: {
            '@typescript-eslint': tsPlugin,
        },
        rules: {},
    },
    {
        files: ['bin/**/*.js', 'scripts/**/*.cjs', 'integrity-check.cjs'],
        linterOptions: {
            reportUnusedDisableDirectives: 'off',
        },
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'commonjs',
        },
        rules: {},
    },
];
