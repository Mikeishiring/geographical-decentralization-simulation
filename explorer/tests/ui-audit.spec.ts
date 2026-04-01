import { expect, test, type Page } from '@playwright/test'

async function mockCuratedExplore(page: Page) {
  await page.route('**/api/explore', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        summary: 'SSP adds an external supplier hop while MSP keeps block building local to the proposer.',
        blocks: [
          {
            type: 'insight',
            title: 'Latency-critical path',
            text: 'SSP inserts an external builder-supplier path, while MSP keeps the proposer on the local path.',
          },
        ],
        followUps: ['How does this change concentration pressure?'],
        model: 'playwright-curated',
        cached: true,
        provenance: {
          source: 'curated',
          label: 'Curated paper answer',
          detail: 'Stubbed for deterministic UI coverage.',
          canonical: true,
        },
      }),
    })
  })
}

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
  await mockCuratedExplore(page)
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
  const noteId = 'mock-note-1'
  const noteTitle = 'Playwright seeded community note'
  const replyBody = `Reply authored through Playwright ${Date.now()}`
  const replies: Array<{
    id: string
    explorationId: string
    author: string
    body: string
    createdAt: string
    votes: number
  }> = []

  const buildExploration = () => ({
    id: noteId,
    query: 'Playwright seeded community note query',
    summary: 'Playwright seeded note summary.',
    blocks: [
      {
        type: 'insight',
        title: 'Seeded note',
        text: 'This note is seeded inside the e2e harness so reply rendering can be verified deterministically.',
      },
    ],
    followUps: [],
    model: 'playwright-community',
    cached: true,
    source: 'generated',
    votes: 12,
    createdAt: '2026-04-01T12:00:00.000Z',
    paradigmTags: ['External', 'Local'],
    experimentTags: ['SE4'],
    verified: true,
    surface: 'reading',
    replies,
    publication: {
      published: true,
      title: noteTitle,
      takeaway: 'Seeded note for deterministic reply coverage.',
      author: 'Seeded author',
      publishedAt: '2026-04-01T12:00:00.000Z',
      featured: false,
      editorNote: '',
    },
  })

  await page.route('**/api/explorations?**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([buildExploration()]),
    })
  })

  await page.route(`**/api/explorations/${noteId}`, async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(buildExploration()),
    })
  })

  await page.route(`**/api/explorations/${noteId}/replies`, async route => {
    const payload = route.request().postDataJSON() as { author?: string; body?: string }
    const reply = {
      id: `reply-${replies.length + 1}`,
      explorationId: noteId,
      author: payload.author?.trim() || 'Anonymous',
      body: payload.body?.trim() ?? '',
      createdAt: '2026-04-01T12:30:00.000Z',
      votes: 0,
    }
    replies.push(reply)
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify(reply),
    })
  })

  await page.goto(`/?tab=community&eid=${noteId}`)

  const noteCard = page.locator(`[id="community-note-${noteId}"]`)
  await expect(noteCard).toBeVisible({ timeout: 20_000 })
  const replyButton = noteCard.getByRole('button', { name: 'Reply', exact: true })
  await expect(replyButton).toBeVisible({ timeout: 20_000 })
  await replyButton.click()
  await noteCard.getByPlaceholder('Your name (optional)').fill('Reply author')
  await noteCard.getByPlaceholder('Reply to this note...').fill(replyBody)
  await noteCard.getByRole('button', { name: 'Send' }).click()

  await expect(noteCard.locator('span').filter({ hasText: /^Reply author$/ })).toBeVisible()
  await expect(noteCard.locator('p').filter({ hasText: replyBody })).toBeVisible()

  await page.reload()

  const reloadedCard = page.locator(`[id="community-note-${noteId}"]`)
  await expect(reloadedCard).toBeVisible({ timeout: 20_000 })
  await expect(reloadedCard.locator('span').filter({ hasText: /^Reply author$/ })).toBeVisible()
  await expect(reloadedCard.locator('p').filter({ hasText: replyBody })).toBeVisible()
})
