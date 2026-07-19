import { expect, test } from '@playwright/test'

const email = process.env.E2E_EMAIL
const password = process.env.E2E_PASSWORD

test.describe('authenticated critical path', () => {
  test.skip(!email || !password, 'Set E2E_EMAIL and E2E_PASSWORD to run authenticated checks.')

  test('a real user can sign in and open the workspace', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('Email').fill(email!)
    await page.getByLabel('Password').fill(password!)
    await page.getByRole('button', { name: /sign in/i }).click()
    await expect(page).toHaveURL(/\/app(?:\/|$)/, { timeout: 20_000 })
    await expect(page.getByText(/workspace/i).first()).toBeVisible({ timeout: 20_000 })
  })
})
