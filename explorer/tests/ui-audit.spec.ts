import { expect, test, type APIRequestContext } from '@playwright/test'

const API_BASE_URL = 'http://127.0.0.1:3201/api'

async function createPublishedExploration(request: APIRequestContext) {
  const nonce = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

  const createResponse = await request.post(`${API_BASE_URL}/explorations`, {
    data: {
      query: `Playwright reply coverage ${nonce}`,
      summary: `Playwright published note ${nonce}`,
      blocks: [
        {
          type: 'insight',
          title: 'Playwright coverage note',
          text: `Published for UI reply coverage ${nonce}.`,
        },
      ],
      followUps: [],
      model: 'playwright',
      cached: false,
      surface: 'reading',
    },
  })
  expect(createResponse.ok()).toBeTruthy()
  const created = await createResponse.json() as { id: string }

  const publishResponse = await request.post(`${API_BASE_URL}/explorations/${created.id}/publish`, {
    data: {
      title: `Playwright note ${nonce}`,
      takeaway: `Testing reply persistence ${nonce}`,
      author: 'Seeded author',
    },
  })
  expect(publishResponse.ok()).toBeTruthy()

  return {
    id: created.id,
    title: `Playwright note ${nonce}`,
    replyBody: `Reply authored through Playwright ${nonce}`,
  }
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

  const askButton = page.getByRole('button', { name: 'Ask', exact: true })
  const queryInput = page.getByPlaceholder('Ask about a mechanism, paradox, comparison, or implication...')

  await expect(askButton).toBeVisible()
  await expect(askButton).toBeDisabled()

  await queryInput.fill('How does SSP compare to MSP?')
  await expect(askButton).toBeEnabled()
  await Promise.all([
    page.waitForResponse(
      response =>
        response.url().includes('/api/explore')
        && response.request().method() === 'POST'
        && response.ok(),
      { timeout: 45_000 },
    ),
    askButton.click(),
  ])

  const shareNoteButton = page.getByRole('button', { name: 'Share as a community note' })
  await expect(shareNoteButton).toBeVisible({ timeout: 20_000 })
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

test('community replies preserve author and persist after reload', async ({ page, request }) => {
  const note = await createPublishedExploration(request)

  await page.goto('/?tab=community')
  await Promise.all([
    page.waitForResponse(
      response =>
        response.url().includes('/api/explorations?')
        && response.url().includes(encodeURIComponent(note.title))
        && response.request().method() === 'GET'
        && response.ok(),
      { timeout: 20_000 },
    ),
    page.getByPlaceholder('Search titles, takeaways, authors, paradigms...').fill(note.title),
  ])

  const noteCard = page.locator('[id^="community-note-"]').filter({ hasText: note.title }).first()
  await expect(noteCard).toBeVisible({ timeout: 20_000 })
  await expect(noteCard.getByText(note.title)).toBeVisible()

  await noteCard.getByRole('button', { name: /Expand note|Collapse note/ }).click()
  await noteCard.getByRole('button', { name: 'Reply' }).click()
  await noteCard.getByPlaceholder('Your name (optional)').fill('Reply author')
  await noteCard.getByPlaceholder('Reply to this note...').fill(note.replyBody)
  await noteCard.getByRole('button', { name: 'Send' }).click()

  await expect(noteCard.getByText('Reply author')).toBeVisible()
  await expect(noteCard.getByText(note.replyBody)).toBeVisible()

  await page.reload()
  await Promise.all([
    page.waitForResponse(
      response =>
        response.url().includes('/api/explorations?')
        && response.url().includes(encodeURIComponent(note.title))
        && response.request().method() === 'GET'
        && response.ok(),
      { timeout: 20_000 },
    ),
    page.getByPlaceholder('Search titles, takeaways, authors, paradigms...').fill(note.title),
  ])

  const reloadedCard = page.locator('[id^="community-note-"]').filter({ hasText: note.title }).first()
  await expect(reloadedCard).toBeVisible()
  await reloadedCard.getByRole('button', { name: /Expand note|Collapse note/ }).click()
  await expect(reloadedCard.getByText('Reply author')).toBeVisible()
  await expect(reloadedCard.getByText(note.replyBody)).toBeVisible()
})
