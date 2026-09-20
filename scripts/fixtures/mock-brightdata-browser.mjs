export const chromium = {
  async connectOverCDP() {
    return {
      async newPage() {
        return {
          async goto() { return { status: () => 200 } },
          async waitForLoadState() {},
          async evaluate() {
            return {
              title: 'Example Studio - Google Search',
              visibleText: 'Example Studio example.com',
              resultRegionInspected: true,
              organic: [{ title: 'Example Studio', resultUrl: 'https://example.com/', displayedUrl: 'example.com', description: 'Official website', rank: 1 }],
              local: [],
            }
          },
          url() { return 'https://www.google.com/search?q=Example+Studio&gl=us&hl=en' },
        }
      },
      async close() {},
    }
  },
}
