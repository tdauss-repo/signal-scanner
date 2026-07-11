import type { AuditItem, BusinessProfile, EvidenceLink } from '../types/audit'
import { buildDirectorySuggestions } from '../utils/directorySuggestions'
import {
  bingSearch,
  googleSearch,
  makeSearchLinks,
  pageSpeedTest,
  richResultsTest,
} from '../utils/links'
import {
  buildSearchVisibilityQueries,
  searchVisibilityQueryToAuditItem,
} from '../utils/searchVisibility'
import {
  buildVoicePromptTests,
  buildVoiceReadinessCategories,
  buildVoiceSourceReadinessGroups,
  voiceCategoryToAuditItem,
  voicePromptToAuditItem,
} from '../utils/voiceReadiness'

const ownerUnverified =
  'Owner access unverified - confirm during onboarding. Public checks use generated links only.'

const hasMultiContactContext = (profile: BusinessProfile) =>
  (profile.phoneNumbers ?? []).filter(
    (record) => record.isValidPublicContact && record.number.trim(),
  ).length > 1 || Boolean(profile.contactStructureNote?.trim())

export const aiPlatforms = [
  { id: 'chatgpt', name: 'ChatGPT', url: 'https://chatgpt.com/' },
  { id: 'gemini', name: 'Gemini', url: 'https://gemini.google.com/' },
  { id: 'perplexity', name: 'Perplexity', url: 'https://www.perplexity.ai/' },
  { id: 'copilot', name: 'Copilot', url: 'https://copilot.microsoft.com/' },
  { id: 'claude', name: 'Claude', url: 'https://claude.ai/' },
  { id: 'grok', name: 'Grok', url: 'https://x.com/i/grok' },
] as const

export const buildAuditItems = (profile: BusinessProfile): AuditItem[] => {
  const listingItems: AuditItem[] = [
    {
      id: 'listing-google',
      area: 'listings',
      label: 'Google Business Profile and Maps presence',
      description: `${ownerUnverified} Guided listings verification for public NAP, category, website, photos, reviews, profile completeness, and whether owner/admin access exists.`,
      weight: 18,
      access: 'owner-authorized',
      evidenceLinks: [
        ...makeSearchLinks(
          profile,
          `site:google.com/maps ${profile.businessName} ${profile.phone}`,
        ),
        { label: 'Owner portal', url: 'https://business.google.com/' },
      ],
      fix: hasMultiContactContext(profile)
        ? 'Claim or verify the profile, align name, address/service area, website, primary category, and core services. If the platform requires one number, use the preferred primary listing number while keeping owner-specific numbers clearly labeled on the website.'
        : 'Claim or verify the profile, align name, address/service area, phone, website, primary category, and core services.',
    },
    {
      id: 'listing-apple',
      area: 'listings',
      label: 'Apple Business Connect / Apple Maps listing',
      description: `${ownerUnverified} Guided listings verification for whether Apple Maps shows the correct public business details.`,
      weight: 14,
      access: 'owner-authorized',
      evidenceLinks: [
        ...makeSearchLinks(
          profile,
          `${profile.businessName} ${profile.serviceArea} Apple Maps`,
        ),
        { label: 'Owner portal', url: 'https://business.apple.com/' },
      ],
      fix: 'Create or update Apple Business Connect so iPhone and Siri experiences have the correct source data.',
    },
    {
      id: 'listing-bing',
      area: 'listings',
      label: 'Bing Places and Bing Maps consistency',
      description: `${ownerUnverified} Guided listings verification for public details and whether owner access is available.`,
      weight: 12,
      access: 'owner-authorized',
      evidenceLinks: [
        { label: 'Bing web', url: bingSearch(`${profile.businessName} ${profile.serviceArea} Bing Maps`) },
        { label: 'Owner portal', url: 'https://www.bingplaces.com/' },
      ],
      fix: hasMultiContactContext(profile)
        ? 'Claim Bing Places and synchronize name, website, services, and service area. Use one preferred primary listing number where required, and keep valid owner contact numbers clearly labeled on the website.'
        : 'Claim Bing Places and synchronize name, phone, website, services, and service area.',
    },
    {
      id: 'listing-yelp',
      area: 'listings',
      label: 'Yelp public listing and review signal',
      description: 'Guided public verification. Check profile accuracy, categories, review quality, and whether stale details exist.',
      weight: 8,
      access: 'public',
      evidenceLinks: makeSearchLinks(
        profile,
        `site:yelp.com ${profile.businessName} ${profile.serviceArea}`,
      ),
      fix: 'Correct the public profile and add current service descriptions and photos where owner access is available.',
    },
    {
      id: 'listing-facebook-instagram',
      area: 'listings',
      label: 'Facebook and Instagram business identity',
      description: 'Guided public verification unless the owner grants access. Verify that social profiles make services, location, and contact path obvious.',
      weight: 8,
      access: 'public',
      evidenceLinks: [
        { label: 'Facebook search', url: googleSearch(`site:facebook.com ${profile.businessName} ${profile.serviceArea}`) },
        { label: 'Instagram search', url: googleSearch(`site:instagram.com ${profile.businessName}`) },
      ],
      fix: 'Align profile names, bios, website links, location language, and recent proof of work.',
    },
    {
      id: 'listing-industry-local',
      area: 'listings',
      label: 'Industry and local directory citations',
      description:
        'Guided public verification. Suggested optional directories are generated from the business profile, services, local market, and service areas. Default owner/admin access status is Unverified - public listing only.',
      weight: 10,
      access: 'public',
      evidenceLinks: buildDirectorySuggestions(profile).map((directory) => ({
        label: directory.directoryName,
        url: directory.manualSearchUrl,
      })),
      fix: 'Review only the optional directories that apply. Activate or verify relevant listings manually, keep owner/admin access marked unverified unless confirmed by the business owner, and ignore suggestions that do not fit.',
    },
  ]

  const websiteLinks: EvidenceLink[] = [
    { label: 'Open site', url: profile.website },
    { label: 'Rich Results', url: richResultsTest(profile.website) },
    { label: 'PageSpeed', url: pageSpeedTest(profile.website) },
  ]

  const websiteItems: AuditItem[] = [
    {
      id: 'website-title',
      area: 'website',
      label: 'Homepage title quality',
      description: 'Authorized website scan. Confirm the title includes a useful business, service, or local intent signal.',
      weight: 10,
      access: 'public',
      evidenceLinks: websiteLinks,
      fix: 'Rewrite the homepage title around the business name, primary service, and local service area.',
    },
    {
      id: 'website-meta-description',
      area: 'website',
      label: 'Meta description quality',
      description: 'Authorized website scan. Check whether the homepage meta description is present and descriptive.',
      weight: 8,
      access: 'public',
      evidenceLinks: websiteLinks,
      fix: 'Add a concise meta description that explains the business, core services, location, and next step.',
    },
    {
      id: 'website-homepage-clarity',
      area: 'website',
      label: 'Homepage SEO clarity',
      description: 'Authorized website scan. Evaluate whether the homepage provides enough business, service, location, contact, structured data, and FAQ context for search engines, AI answer engines, and customers.',
      weight: 16,
      access: 'public',
      evidenceLinks: websiteLinks,
      fix: 'Improve homepage SEO clarity by strengthening the page title, meta description, visible intro copy, service-area wording, internal links to dedicated service pages, structured data, and FAQ content. This can usually be done without changing the visual hero design.',
    },
    {
      id: 'website-service-pages',
      area: 'website',
      label: 'Service pages/content indicators',
      description: 'Authorized website scan. Look for homepage content and links indicating major services are covered.',
      weight: 14,
      access: 'public',
      evidenceLinks: websiteLinks,
      fix: 'Create or strengthen dedicated service pages with examples, FAQs, internal links, and booking calls to action.',
    },
    {
      id: 'website-local-content',
      area: 'website',
      label: 'Service-area copy',
      description: 'Authorized website scan. Confirm local place names, service-area language, and local proof appear naturally.',
      weight: 12,
      access: 'public',
      evidenceLinks: websiteLinks,
      fix: 'Add natural service-area copy, local project examples, venue/location references, and customer proof.',
    },
    {
      id: 'website-schema',
      area: 'website',
      label: 'LocalBusiness/ProfessionalService schema',
      description: 'Authorized website scan. Test for JSON-LD schema that identifies the business and services.',
      weight: 12,
      access: 'public',
      evidenceLinks: websiteLinks,
      fix: 'Add valid schema for the business, services, FAQs, reviews/testimonials, images, and contact details.',
    },
    {
      id: 'website-faq',
      area: 'website',
      label: 'FAQ schema/content',
      description: 'Authorized website scan. Look for FAQ schema or visible FAQ-style content that supports conversational queries.',
      weight: 8,
      access: 'public',
      evidenceLinks: websiteLinks,
      fix: 'Publish concise FAQs using natural question phrasing and mark them up where appropriate.',
    },
    {
      id: 'website-mobile-conversion',
      area: 'website',
      label: 'Contact info visibility',
      description: 'Authorized website scan. Confirm phone matches and contact or booking links are visible in homepage HTML.',
      weight: 12,
      access: 'public',
      evidenceLinks: websiteLinks,
      fix: 'Improve mobile calls to action, contact forms, tap-to-call links, and booking flow clarity.',
    },
    {
      id: 'website-social-links',
      area: 'website',
      label: 'Social profile links',
      description: 'Authorized website scan. Detect whether official social profile links are present from the homepage.',
      weight: 6,
      access: 'public',
      evidenceLinks: websiteLinks,
      fix: 'Link to official social profiles from the website so customers and AI systems can corroborate the business identity.',
    },
    {
      id: 'website-sitemap-robots',
      area: 'website',
      label: 'Sitemap/robots presence',
      description: 'Authorized website scan. Check whether sitemap.xml and robots.txt are available on the same domain.',
      weight: 8,
      access: 'public',
      evidenceLinks: websiteLinks,
      fix: 'Publish sitemap.xml and robots.txt so search systems can discover and understand crawlable pages.',
    },
  ]

  const keywordItems: AuditItem[] = buildSearchVisibilityQueries(profile).map(
    searchVisibilityQueryToAuditItem,
  )

  const aiItems: AuditItem[] = aiPlatforms.map((platform) => ({
      id: `ai-${platform.id}`,
      area: 'ai',
      label: `${platform.name} answer visibility`,
      description:
        'Guided manual test. Copy the consolidated prompt into this AI answer platform, then summarize whether the platform identifies the business, services, location, sources, and missing signals.',
      weight: 10,
      access: 'public',
      evidenceLinks: [{ label: platform.name, url: platform.url }],
      fix: 'AI answer/source clarity fix: improve source-of-truth pages, schema, listings, third-party citations, reviews, and concise service/location facts.',
    }))

  const voiceItems: AuditItem[] = [
    ...buildVoiceSourceReadinessGroups(profile, {}).map(voiceCategoryToAuditItem),
    ...buildVoiceReadinessCategories(profile, {}).map(voiceCategoryToAuditItem),
    ...buildVoicePromptTests(profile).map(voicePromptToAuditItem),
  ]

  return [...listingItems, ...websiteItems, ...keywordItems, ...aiItems, ...voiceItems]
}
