import jsdoc from 'eslint-plugin-jsdoc';

export default [
    {
        files: ['**/*.js'],
        plugins: {
            jsdoc: jsdoc
        },
        rules: {
            'no-undef': 'error',
            'no-redeclare': 'error',
            'jsdoc/check-param-names': 'error',
            'jsdoc/check-types': 'error',
            'jsdoc/require-param-type': 'error',
            'jsdoc/require-returns-type': 'error',
            'jsdoc/valid-types': 'error'
        },
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {
                console: 'readonly',
                imports: 'readonly',
                global: 'readonly',
                globalThis: 'readonly',
                // Node.js / Standard Web globals
                process: 'readonly',
                setTimeout: 'readonly',
                clearTimeout: 'readonly',
                setInterval: 'readonly',
                clearInterval: 'readonly',
                URL: 'readonly',
                URLSearchParams: 'readonly',
                Buffer: 'readonly',
                // Jest globals
                jest: 'readonly',
                describe: 'readonly',
                test: 'readonly',
                it: 'readonly',
                expect: 'readonly',
                beforeEach: 'readonly',
                afterEach: 'readonly',
                beforeAll: 'readonly',
                afterAll: 'readonly'
            }
        }
    }
];
