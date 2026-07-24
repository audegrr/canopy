import { expect, test } from '@playwright/test'

const email = process.env.E2E_EMAIL
const password = process.env.E2E_PASSWORD

// Regression coverage for a bug where the slash command menu's keydown
// handler read stale React state (frozen by how useEditor(options, deps)
// applies editorProps) — typed letters after "/" fell through to plain text
// insertion instead of filtering the menu. jsdom can't reproduce this
// reliably (it doesn't implement real contenteditable/ProseMirror editing
// behavior), so this needs a real browser via Playwright rather than a
// vitest/jsdom unit test.
test.describe('editor slash command menu', () => {
  test.skip(!email || !password, 'Set E2E_EMAIL and E2E_PASSWORD to run authenticated checks.')

  test('filters commands as you type instead of inserting the query as text', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('Email').fill(email!)
    await page.getByLabel('Password').fill(password!)
    await page.getByRole('button', { name: /sign in/i }).click()
    await expect(page).toHaveURL(/\/app(?:\/|$)/, { timeout: 20_000 })

    await page.getByTitle('New page').click()
    await expect(page).toHaveURL(/\/app\/page\/[0-9a-f-]+$/i, { timeout: 20_000 })
    const pageId = page.url().split('/').pop()!

    const editorBody = page.locator('.ProseMirror')
    const menu = page.locator('.slash-menu')

    await editorBody.click()
    await page.keyboard.type('/im')

    // The typed query stays as literal text in the doc while the menu filters
    // on it — this is the exact behavior the bug broke (it either stayed
    // stuck on the full unfiltered list, or the letters were consumed with
    // no filtering happening at all).
    await expect(editorBody).toHaveText('/im')
    await expect(menu.locator('.slash-menu-item')).toHaveCount(1)
    await expect(menu.locator('.slash-menu-item')).toHaveText(/Image/)

    await page.keyboard.press('Escape')
    await expect(menu).toBeHidden()
    for (let i = 0; i < '/im'.length; i++) await page.keyboard.press('Backspace')

    // A second query, selected by click, should filter down and then insert
    // the matching block (proving selection still works end-to-end).
    await page.keyboard.type('/quote')
    await expect(menu.locator('.slash-menu-item')).toHaveCount(1)
    await expect(menu.locator('.slash-menu-item')).toHaveText(/Quote/)
    await menu.locator('.slash-menu-item').first().click()
    await expect(editorBody.locator('blockquote')).toBeVisible()
    await expect(editorBody).not.toContainText('/quote')

    await page.locator(`[data-page-id="${pageId}"]`).click({ button: 'right' })
    await page.getByText('Delete', { exact: true }).click()
  })
})
