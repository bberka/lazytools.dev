import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

const ignoredPaths = [
  '.next/**',
  'out/**',
  'node_modules/**',
  'next-env.d.ts',
];

const eslintConfig = [
  ...nextVitals,
  ...nextTypescript,
  {
    rules: {
      'react-hooks/immutability': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
  {
    // Node scripts run by CI are CommonJS.
    files: ['scripts/**/*.js'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    ignores: ignoredPaths,
  },
];

export default eslintConfig;
