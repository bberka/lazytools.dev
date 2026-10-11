import { defineConfig } from '@playwright/test';

// Unit tests for pure logic. They import modules directly and need no
// browser and no dev server, so they can run while `npm run dev` is busy.
export default defineConfig({
  testDir: './tests/unit',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: 'list',
});
