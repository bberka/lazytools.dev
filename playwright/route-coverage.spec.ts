import { test, expect } from '@playwright/test';
import { toolCatalog } from '../src/lib/catalog';

test.describe('Route Coverage Tests', () => {
  // Every registry entry gets a route, hidden ones included
  for (const tool of toolCatalog.all()) {
    test(`should render tool page: ${tool.name} (${tool.id})`, async ({ page }, testInfo) => {
      // Skip on non-chromium browsers to keep tests fast
      test.skip(
        testInfo.project.name !== 'chromium',
        'Route coverage is verified on Chromium'
      );

      // Navigate to the tool's page
      const response = await page.goto(`/tools/${tool.id}`);
      
      // Assert that HTTP status is 200 (page exists and was resolved successfully)
      expect(response?.status()).toBe(200);

      // Verify that the tool name heading is visible on the page
      const heading = page.getByRole('heading', { name: tool.name }).first();
      await expect(heading).toBeVisible({ timeout: 5000 });
    });
  }
});
