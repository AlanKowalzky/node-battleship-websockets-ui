import globals from 'globals';
import tseslint from 'typescript-eslint';
import pluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import eslintJs from '@eslint/js';

export default tseslint.config(
  {
    // Globally ignored files
    ignores: [
      'node_modules/',
      'dist/',
      'front/',
      '.prettierrc.cjs',
      'eslint.config.js',
    ],
  },
  eslintJs.configs.recommended, // ESLint's recommended rules
  ...tseslint.configs.recommended, // TypeScript-ESLint's recommended rules
  pluginPrettierRecommended, // Integrates Prettier, must be last
  {
    // Custom configurations
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node, // Node.js global variables
        ...globals.es2021, // ES2021 global variables
      },
      parser: tseslint.parser, // Use TypeScript parser
      parserOptions: {
        project: './tsconfig.json', // Path to your tsconfig.json
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Your custom rules can go here
      'prettier/prettier': 'error',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      // Add or override rules as needed
      // e.g., if you still want to allow console.log for now:
      // "no-console": "off",
    },
  }
);
