import { test, expect } from '@playwright/test';

test.describe('LazyTools Smoke Tests', () => {
  
  test.beforeEach(async ({ page }) => {
    // Navigate to homepage before each test
    await page.goto('/');
    // Clear storage to ensure clean slate. Every test starts in a fresh browser
    // context, so the home page is already showing its default view here.
    await page.evaluate(() => {
      sessionStorage.clear();
      localStorage.clear();
    });
    // Wait for the main page title to be correct
    await expect(page).toHaveTitle(/(Dev\s*Tools|Lazy\s*Tools)/i);
    // Wait for hydration to complete stably
    await page.waitForTimeout(1000);
  });

  test('should search and filter tools', async ({ page }) => {
    // Locate the search bar
    const searchBar = page.getByPlaceholder('Search tools...');
    await expect(searchBar).toBeVisible();

    // Verify other cards like "Base64 Encoder/Decoder" are visible initially
    const otherCard = page.locator('a', { hasText: 'Base64 Encoder/Decoder' }).first();
    await expect(otherCard).toBeVisible();

    // Type a search query for a specific tool
    await searchBar.fill('JSON Formatter');

    // Verify the JSON Formatter card is visible
    const jsonFormatterCard = page.locator('a', { hasText: 'JSON Formatter' }).first();
    await expect(jsonFormatterCard).toBeVisible();

    // Verify unrelated cards like "Base64 Encoder/Decoder" are not visible
    await expect(otherCard).not.toBeVisible();

    // Clear search and verify other cards reappear
    await searchBar.fill('');
    await expect(searchBar).toHaveValue('');
    // Wait a brief moment for state and DOM updates
    await page.waitForTimeout(500);
    await expect(otherCard).toBeVisible();
  });

  test('should favorite and unfavorite a tool', async ({ page }) => {
    // Target a specific tool card: JSON Formatter
    const jsonFormatterCard = page.locator('a', { hasText: 'JSON Formatter' }).first();
    await expect(jsonFormatterCard).toBeVisible();

    // Find the favorite button on this card
    const favoriteBtn = jsonFormatterCard.getByRole('button', { name: /add to favorites|remove from favorites/i });
    await expect(favoriteBtn).toBeVisible();
    
    // Ensure it starts as not favorited (default behavior)
    const labelBefore = await favoriteBtn.getAttribute('aria-label');
    expect(labelBefore).toBe('Add to favorites');

    // Click to favorite
    await favoriteBtn.click();

    // Verify aria-label changes to remove from favorites
    await expect(favoriteBtn).toHaveAttribute('aria-label', 'Remove from favorites');

    // Locate the Favorites filter button in the category header using anchored regex
    const favoritesFilterTab = page.getByRole('button', { name: /^favorites/i });
    await expect(favoritesFilterTab).toBeVisible();

    // Click the Favorites tab filter
    await favoritesFilterTab.click();
    await page.waitForTimeout(500); // Wait for filtering to take effect

    // Verify only the favorited tool (JSON Formatter) is shown in the list
    await expect(jsonFormatterCard).toBeVisible();
    
    // Unrelated tools (like Base64 Encoder/Decoder) should not be shown
    const otherCard = page.locator('a', { hasText: 'Base64 Encoder/Decoder' }).first();
    await expect(otherCard).not.toBeVisible();

    // Unfavorite it from the favorites list
    const unfavoriteBtn = jsonFormatterCard.getByRole('button', { name: /remove from favorites/i });
    await unfavoriteBtn.click();
    await page.waitForTimeout(500);

    // Verify that the empty favorites state is shown
    await expect(page.getByText('No favorite tools yet')).toBeVisible();
  });

  test('should open command palette, search, and navigate', async ({ page }) => {
    // Locate the command palette toggle button in the header
    const paletteTrigger = page.getByRole('button', { name: /search command palette/i });
    await expect(paletteTrigger).toBeVisible();
    await paletteTrigger.click();
    await page.waitForTimeout(500); // Wait for open animation

    // Verify the command palette dialog is opened
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Locate the search input inside the dialog
    const searchInput = dialog.getByPlaceholder('Search tools...');
    await expect(searchInput).toBeFocused();

    // Type query
    await searchInput.fill('JSON Formatter');
    await page.waitForTimeout(500); // Wait for filter to compute

    // Find the item in the list and click it directly
    const commandItem = dialog.locator('[cmdk-item]', { hasText: 'JSON Formatter' });
    await expect(commandItem).toBeVisible();
    await commandItem.click();

    // Verify navigation was successful
    await expect(page).toHaveURL(/\/tools\/json-formatter/);
    
    // Verify heading on the page
    const pageHeading = page.getByRole('heading', { level: 1 });
    await expect(pageHeading).toContainText('JSON Formatter');
  });

  test('should load the JSON Formatter page and format/minify JSON', async ({ page }) => {
    // Navigate directly to the JSON Formatter page
    await page.goto('/tools/json-formatter');
    await page.waitForTimeout(1000);

    // Wait for the tool inputs to render
    const inputArea = page.getByPlaceholder(/ada/i);
    await expect(inputArea).toBeVisible();

    // Check default outputs are not set/showing empty output placeholder
    const outputArea = page.getByPlaceholder(/Formatted output/i);
    await expect(outputArea).toBeVisible();
    await expect(outputArea).toHaveValue('');

    // Input invalid JSON and verify error message
    await inputArea.fill('{"invalid": json');
    const errorMessage = page.getByText(/Invalid JSON Syntax/i);
    await expect(errorMessage).toBeVisible();

    // Input valid JSON
    const validJson = '{"name":"John","age":30,"nested":{"active":true}}';
    await inputArea.fill(validJson);

    // Verify error message is gone
    await expect(errorMessage).not.toBeVisible();

    // Verify output is formatted (containing indent spaces and newlines)
    const expectedFormatted = JSON.stringify(JSON.parse(validJson), null, 2);
    await expect(outputArea).toHaveValue(expectedFormatted);

    // Click the Minify button
    const minifyButton = page.getByRole('button', { name: /minify/i });
    await expect(minifyButton).toBeVisible();
    await minifyButton.click();

    // Verify output is minified
    await expect(outputArea).toHaveValue(validJson);

    // Click the Clear button
    const clearButton = page.getByRole('button', { name: /clear/i });
    await expect(clearButton).toBeVisible();
    await clearButton.click();

    // Verify inputs are cleared
    await expect(inputArea).toHaveValue('');
    await expect(outputArea).toHaveValue('');
  });
});
