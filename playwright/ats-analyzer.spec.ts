import { test, expect } from '@playwright/test';

test.describe('ATS analyzer language support', () => {
  test('lets users choose résumé and job-description analysis languages', async ({ page }) => {
    await page.goto('/tools/resume-ats-analyzer');

    const resumeLanguage = page.getByRole('combobox', { name: 'Resume language' });
    const jobDescriptionLanguage = page.getByRole('combobox', {
      name: 'Job description language',
    });

    await expect(resumeLanguage).toBeVisible();
    await expect(jobDescriptionLanguage).toBeVisible();

    await resumeLanguage.click();
    await page.getByRole('option', { name: 'Türkçe' }).click();
    await expect(resumeLanguage).toContainText('Türkçe');

    await jobDescriptionLanguage.click();
    await page.getByRole('option', { name: 'Deutsch' }).last().click();
    await expect(jobDescriptionLanguage).toContainText('Deutsch');
  });
});
