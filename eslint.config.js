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
                // Node.js globals
                process: 'readonly',
                // Jest globals
                jest: 'readonly',
                describe: 'readonly',
                test: 'readonly',
                expect: 'readonly',
                beforeEach: 'readonly'
            }
        }
    }
];
