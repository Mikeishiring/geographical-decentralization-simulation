import { expect, test, type Page } from '@playwright/test'

async function askCuratedQuestion(page: Page) {
  const askButton = page.getByRole('button', { name: 'Ask', exact: true })
  const queryInput = page.getByPlaceholder('Ask about a mechanism, paradox, comparison, or implication...')

  await expect(askButton).toBeVisible()
  await expect(askButton).toBeDisabled()

  await queryInput.fill('How does SSP compare to MSP?')
  await expect(askButton).toBeEnabled()
  await askButton.click()
  await expect(page.getByRole('button', { name: 'Share as a community note' })).toBeVisible({ timeout: 75_000 })
}

test('tab keyboard navigation keeps focus and exposes hints', async ({ page }) => {
  await page.goto('/')

  const agentTab = page.getByRole('tab', { name: 'Agent' })
  const communityTab = page.getByRole('tab', { name: 'Community' })
  const paperTab = page.getByRole('tab', { name: 'Paper' })

  await agentTab.focus()
  await expect(page.getByText('Ask questions and run autonomous research loops')).toBeVisible()

  await agentTab.press('End')
  await expect(communityTab).toBeFocused()
  await expect(communityTab).toHaveAttribute('aria-selected', 'true')

  await communityTab.press('Home')
  await expect(paperTab).toBeFocused()
  await expect(paperTab).toHaveAttribute('aria-selected', 'true')
})

test('agent ask CTA stays visible and publish can proceed as-is', async ({ page }) => {
  await page.goto('/?tab=agent')
  await askCuratedQuestion(page)

  const shareNoteButton = page.getByRole('button', { name: 'Share as a community note' })
  await shareNoteButton.click()

  await expect(page.getByRole('button', { name: 'Publish note' })).toBeEnabled()
  await expect(page.getByText('Publishing as-is will use the suggested title and takeaway.')).toBeVisible()
})

test('mobile paper toolbar keeps short note and guide labels', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')

  await expect(page.getByRole('button', { name: /Guide/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Notes/ })).toBeVisible()
})

test('community replies preserve author and persist after reload', async ({ page }) => {
  const uniqueTitle = `Playwright reply note ${Date.now()}`
  const replyBody = `Reply authored through Playwright ${Date.now()}`

  await page.goto('/?tab=agent')
  await askCuratedQuestion(page)

  await page.getByRole('button', { name: 'Share as a community note' }).click()
  await page.getByLabel('Title').fill(uniqueTitle)
  await page.getByLabel('Name (optional)').fill('Seeded author')
  await page.getByRole('button', { name: 'Publish note' }).click()

  const viewCommunityButton = page.getByRole('button', { name: /View in Community|View published/ })
  await expect(viewCommunityButton).toBeVisible({ timeout: 20_000 })
  await viewCommunityButton.click()

  const noteCard = page.locator('[id^="community-note-"]').filter({ hasText: uniqueTitle }).first()
  await expect(noteCard).toBeVisible({ timeout: 20_000 })

  await noteCard.getByRole('button', { name: 'Reply' }).click()
  await noteCard.getByPlaceholder('Your name (optional)').fill('Reply author')
  await noteCard.getByPlaceholder('Reply to this note...').fill(replyBody)
  await noteCard.getByRole('button', { name: 'Send' }).click()

  await expect(noteCard.getByText('Reply author')).toBeVisible()
  await expect(noteCard.getByText(replyBody)).toBeVisible()

  await page.reload()

  const reloadedCard = page.locator('[id^="community-note-"]').filter({ hasText: uniqueTitle }).first()
  await expect(reloadedCard).toBeVisible({ timeout: 20_000 })
  await expect(reloadedCard.getByText('Reply author')).toBeVisible()
  await expect(reloadedCard.getByText(replyBody)).toBeVisible()
})
