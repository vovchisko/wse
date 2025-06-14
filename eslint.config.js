import js from '@eslint/js'

export default [
  {
    name: 'app/files-to-lint',
    files: ['**/*.{js,mjs}'],
  },

  {
    name: 'app/files-to-ignore',
    ignores: ['**/node_modules/**'],
  },

  js.configs.recommended,

  {
    name: 'app/custom-rules',
    languageOptions: {
      globals: {
        ...js.configs.recommended.languageOptions.globals,
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        global: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
      },
    },
    rules: {
      // Keep it simple - no absurd rules
    },
  },
]
