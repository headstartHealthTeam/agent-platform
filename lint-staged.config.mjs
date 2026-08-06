export default {
  '**/*.{ts,tsx,js,jsx,mjs,cjs}': [
    'eslint --fix --max-warnings 0',
    'prettier --write --ignore-path .prettierignore',
  ],
  '**/*.{json,md,yml,yaml}': ['prettier --write --ignore-path .prettierignore'],
};
