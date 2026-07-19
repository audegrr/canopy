import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const email = process.env.E2E_EMAIL
const password = process.env.E2E_PASSWORD

test.describe('authenticated critical path', () => {
  test.skip(!email || !password, 'Set E2E_EMAIL and E2E_PASSWORD to run authenticated checks.')

  test('a real user can create, edit and trash a page', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('Email').fill(email!)
    await page.getByLabel('Password').fill(password!)
    await page.getByRole('button', { name: /sign in/i }).click()
    await expect(page).toHaveURL(/\/app(?:\/|$)/, { timeout: 20_000 })
    await expect(page.getByText(/workspace/i).first()).toBeVisible({ timeout: 20_000 })
    const accessibility = await new AxeBuilder({ page }).analyze()
    expect(accessibility.violations.filter(violation => ['serious', 'critical'].includes(violation.impact || ''))).toEqual([])

    await page.getByTitle('New page').click()
    await expect(page).toHaveURL(/\/app\/page\/[0-9a-f-]+$/i, { timeout: 20_000 })
    const pageId = page.url().split('/').pop()!
    const title = `E2E ${Date.now()}`
    await page.locator('.page-title').fill(title)
    await expect(page.locator('.page-title')).toHaveText(title)
    await page.waitForTimeout(1_200)
    await page.locator(`[data-page-id="${pageId}"]`).click({ button: 'right' })
    await page.getByText('Delete', { exact: true }).click()
    await expect(page).toHaveURL(/\/app$/)
  })
})
