module.exports = {
  root: true,
  env: {
    browser: true,
    es2022: true,
    node: true
  },
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended', 'plugin:react-hooks/recommended'],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: ['./tsconfig.node.json', './tsconfig.renderer.json'],
    tsconfigRootDir: __dirname,
    ecmaVersion: 'latest',
    sourceType: 'module'
  },
  plugins: ['@typescript-eslint', 'react-refresh'],
  ignorePatterns: ['dist', 'dist-electron'],
  rules: {
    'react-refresh/only-export-components': ['warn', { allowConstantExport: true }]
  }
};

