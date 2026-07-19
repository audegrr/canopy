import { expect, test } from '@playwright/test'

test('login is keyboard-accessible and links to signup', async ({ page }) => {
  await page.goto('/login')
  await expect(page.getByRole('heading', { name: 'Canopy' })).toBeVisible()
  await expect(page.getByLabel('Email')).toBeVisible()
  await expect(page.getByLabel('Password')).toBeVisible()
  await page.getByRole('link', { name: 'Sign up' }).click()
  await expect(page).toHaveURL(/\/signup$/)
  await expect(page.getByLabel('Full name')).toBeVisible()
})

test('signup exposes password requirements and returns to login', async ({ page }) => {
  await page.goto('/signup')
  const password = page.getByLabel('Password')
  await expect(password).toHaveAttribute('minlength', '8')
  await page.getByRole('link', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/login$/)
})
