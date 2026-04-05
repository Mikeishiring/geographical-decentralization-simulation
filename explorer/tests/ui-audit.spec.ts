import { expect, test, type Page } from '@playwright/test'

async function mockCuratedExplore(page: Page) {
  await page.route('**/api/health', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        anthropicEnabled: false,
      }),
    })
  })

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
  const queryInput = page.locator('input[type="text"]').first()

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

test('mobile paper toolbar keeps short note and guide labels in a dedicated second row', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')

  const modeSwitcher = page.getByRole('tablist', { name: 'Reading mode' })
  const guideButton = page.getByRole('button', { name: /Guide/ })
  const notesButton = page.getByRole('button', { name: /Notes/ })

  await expect(modeSwitcher).toBeVisible()
  await expect(guideButton).toBeVisible()
  await expect(notesButton).toBeVisible()

  const modeSwitcherBox = await modeSwitcher.boundingBox()
  const guideButtonBox = await guideButton.boundingBox()
  const notesButtonBox = await notesButton.boundingBox()

  expect(modeSwitcherBox).not.toBeNull()
  expect(guideButtonBox).not.toBeNull()
  expect(notesButtonBox).not.toBeNull()

  expect((notesButtonBox?.y ?? 0)).toBeGreaterThanOrEqual((modeSwitcherBox?.y ?? 0) + (modeSwitcherBox?.height ?? 0) - 1)
  expect(Math.abs((notesButtonBox?.y ?? 0) - (guideButtonBox?.y ?? 0))).toBeLessThan(3)
  expect((notesButtonBox?.x ?? 0)).toBeLessThan((guideButtonBox?.x ?? 0))
})

test('mobile guide keeps entry-point context within the initial viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')

  await page.getByRole('button', { name: /Guide/ }).click()

  const suggestedHeading = page.getByText('Suggested entry points').first()
  await expect(suggestedHeading).toBeVisible()

  const suggestedHeadingBox = await suggestedHeading.boundingBox()
  expect(suggestedHeadingBox).not.toBeNull()
  expect((suggestedHeadingBox?.y ?? 0) + (suggestedHeadingBox?.height ?? 0)).toBeLessThan(760)
})

test('mobile pdf mode keeps the explainer compact above the document', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.addInitScript(() => {
    window.localStorage.setItem('paper-reader-mode', 'paper')
  })
  await page.goto('/')

  const explainer = page.getByText('Public notes come from highlighted PDF text.').first()
  const firstPage = page.locator('[data-page="1"]').first()

  await expect(explainer).toBeVisible({ timeout: 60_000 })
  await expect(firstPage).toBeVisible({ timeout: 60_000 })

  const explainerBox = await explainer.boundingBox()
  const firstPageBox = await firstPage.boundingBox()

  expect(explainerBox).not.toBeNull()
  expect(firstPageBox).not.toBeNull()
  expect(explainerBox?.height ?? 0).toBeLessThan(70)
  expect((firstPageBox?.y ?? 0)).toBeLessThan(630)
})

test('paper reader toolbar sits close to the tab nav on initial load', async ({ page }) => {
  await page.goto('/')

  const tabNavShell = page.getByTestId('tab-nav-shell')
  const paperToolbar = page.getByTestId('paper-view-mode-bar')

  await expect(tabNavShell).toBeVisible()
  await expect(paperToolbar).toBeVisible()

  const tabNavShellBox = await tabNavShell.boundingBox()
  const paperToolbarBox = await paperToolbar.boundingBox()

  expect(tabNavShellBox).not.toBeNull()
  expect(paperToolbarBox).not.toBeNull()

  const loadGap = (paperToolbarBox?.y ?? 0) - ((tabNavShellBox?.y ?? 0) + (tabNavShellBox?.height ?? 0))
  expect(loadGap).toBeGreaterThanOrEqual(0)
  expect(loadGap).toBeLessThan(24)
})

test('paper reader toolbar stays docked beneath the sticky tab nav', async ({ page }) => {
  await page.goto('/')
  await page.mouse.wheel(0, 500)

  const tabNavShell = page.getByTestId('tab-nav-shell')
  const paperToolbar = page.getByTestId('paper-view-mode-bar')
  const guideButton = page.getByRole('button', { name: /Reading guide|Guide/ })

  await expect(tabNavShell).toBeVisible()
  await expect(paperToolbar).toBeVisible()
  await expect(guideButton).toBeVisible()

  const tabNavShellBox = await tabNavShell.boundingBox()
  const paperToolbarBox = await paperToolbar.boundingBox()

  expect(tabNavShellBox).not.toBeNull()
  expect(paperToolbarBox).not.toBeNull()

  const stickyGap = (paperToolbarBox?.y ?? 0) - ((tabNavShellBox?.y ?? 0) + (tabNavShellBox?.height ?? 0))
  expect(stickyGap).toBeGreaterThanOrEqual(-2)
  expect(stickyGap).toBeLessThan(14)
})

test('html view contents rail clears the paper toolbar when scrolled', async ({ page }) => {
  await page.setViewportSize({ width: 1512, height: 982 })
  await page.addInitScript(() => {
    window.localStorage.setItem('paper-reader-mode', 'html')
  })
  await page.goto('/')
  await expect(page.getByText('Published figures you can inspect here')).toBeVisible()
  await page.mouse.wheel(0, 900)

  const paperToolbar = page.getByTestId('paper-view-mode-bar')
  const htmlContentsRail = page.getByTestId('paper-html-contents-rail')

  await expect(paperToolbar).toBeVisible()
  await expect(htmlContentsRail).toBeVisible()

  const paperToolbarBox = await paperToolbar.boundingBox()
  const htmlContentsRailBox = await htmlContentsRail.boundingBox()

  expect(paperToolbarBox).not.toBeNull()
  expect(htmlContentsRailBox).not.toBeNull()

  const stickyGap = (htmlContentsRailBox?.y ?? 0) - ((paperToolbarBox?.y ?? 0) + (paperToolbarBox?.height ?? 0))
  expect(stickyGap).toBeGreaterThanOrEqual(-2)
  expect(stickyGap).toBeLessThan(24)
})

test('pdf toolbar stays beneath the paper toolbar without overlap', async ({ page }) => {
  await page.setViewportSize({ width: 1512, height: 982 })
  await page.addInitScript(() => {
    window.localStorage.setItem('paper-reader-mode', 'paper')
  })
  await page.goto('/')
  await expect(page.getByText('Public community notes vs private PDF notes')).toBeVisible({ timeout: 60_000 })

  const paperToolbar = page.getByTestId('paper-view-mode-bar')
  const pdfToolbar = page.getByTestId('pdf-viewer-toolbar')

  await expect(paperToolbar).toBeVisible()
  await expect(pdfToolbar).toBeVisible({ timeout: 60_000 })

  const paperToolbarBox = await paperToolbar.boundingBox()
  const pdfToolbarBox = await pdfToolbar.boundingBox()

  expect(paperToolbarBox).not.toBeNull()
  expect(pdfToolbarBox).not.toBeNull()

  const stickyGap = (pdfToolbarBox?.y ?? 0) - ((paperToolbarBox?.y ?? 0) + (paperToolbarBox?.height ?? 0))
  expect(stickyGap).toBeGreaterThanOrEqual(-2)
  expect(stickyGap).toBeLessThan(16)
})

test('results evidence labels collapse threshold as critical regions', async ({ page }) => {
  await page.goto('/?tab=results')

  const mapHeading = page.getByRole('heading', { name: 'Validator Geography' })
  const thresholdCard = page.locator('div[title="Smallest number of regions whose outage collapses the network."]').first()

  await expect(mapHeading).toBeVisible({ timeout: 60_000 })
  await expect(thresholdCard).toBeVisible({ timeout: 60_000 })
  await expect(thresholdCard).toContainText('Critical regions')
  await expect(thresholdCard).not.toContainText('%')
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
