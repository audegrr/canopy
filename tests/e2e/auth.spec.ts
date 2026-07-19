import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

async function expectNoSeriousAccessibilityIssues(page: import('@playwright/test').Page) {
  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations.filter(violation => ['serious', 'critical'].includes(violation.impact || ''))).toEqual([])
}

test('login is keyboard-accessible and links to signup', async ({ page }) => {
  await page.goto('/login')
  await expect(page.getByRole('heading', { name: 'Canopy' })).toBeVisible()
  await expect(page.getByLabel('Email')).toBeVisible()
  await expect(page.getByLabel('Password')).toBeVisible()
  await expectNoSeriousAccessibilityIssues(page)
  await page.getByRole('link', { name: 'Sign up' }).click()
  await expect(page).toHaveURL(/\/signup$/)
  await expect(page.getByLabel('Full name')).toBeVisible()
})

test('signup exposes password requirements and returns to login', async ({ page }) => {
  await page.goto('/signup')
  const password = page.getByLabel('Password')
  await expect(password).toHaveAttribute('minlength', '8')
  await expectNoSeriousAccessibilityIssues(page)
  await page.getByRole('link', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/login$/)
})
