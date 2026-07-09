import type { AuditItem, BusinessProfile, EvidenceLink } from '../types/audit'
import {
  bingSearch,
  googleMapsSearch,
  googleSearch,
  makeSearchLinks,
  pageSpeedTest,
  richResultsTest,
} from '../utils/links'

const ownerUnverified =
  'Owner access unverified - confirm during onboarding. Public checks use generated links only.'

export const aiPlatforms = [
  { id: 'chatgpt', name: 'ChatGPT', url: 'https://chatgpt.com/' },
  { id: 'gemini', name: 'Gemini', url: 'https://gemini.google.com/' },
  { id: 'perplexity', name: 'Perplexity', url: 'https://www.perplexity.ai/' },
  { id: 'copilot', name: 'Copilot', url: 'https://copilot.microsoft.com/' },
  { id: 'claude', name: 'Claude', url: 'https://claude.ai/' },
  { id: 'grok', name: 'Grok', url: 'https://x.com/i/grok' },
] as const

export const aiPromptPack = (profile: BusinessProfile) => {
  const firstService =
    profile.primaryServices.split(',').map((service) => service.trim())[0] ||
    'local service provider'

  return [
    `Search the web. What does ${profile.businessName} do? Include the website, phone number, location or service area, services, and sources.`,
    `Search the web. Is ${profile.businessName} a real local business? What services does it offer? Cite sources.`,
    `Search the web. Find a ${firstService} near ${profile.targetLocation}. Does ${profile.businessName} appear as a recommendation or source?`,
    `Search the web. Compare ${profile.businessName} with other local businesses for: ${profile.primaryServices}. What information is missing or unclear?`,
    `Search the web. What is the official website and phone number for ${profile.businessName}? Check if it matches ${profile.website} and ${profile.phone}.`,
  ]
}

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
      fix: 'Claim or verify the profile, align name, address/service area, phone, website, primary category, and core services.',
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
      fix: 'Claim Bing Places and synchronize name, phone, website, services, and service area.',
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
      description: 'Guided public verification. Look for relevant directories, chamber pages, wedding/vendor profiles, and local mentions.',
      weight: 10,
      access: 'public',
      evidenceLinks: makeSearchLinks(
        profile,
        `${profile.businessName} chamber WeddingWire The Knot ${profile.serviceArea}`,
      ),
      fix: 'Build or refresh trusted local and industry citations that can corroborate the business for search and AI answers.',
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

  const keywordItems: AuditItem[] = profile.keywords
    .split('\n')
    .map((keyword) => keyword.trim())
    .filter(Boolean)
    .map((keyword, index) => ({
      id: `keyword-${index}`,
      area: 'keywords',
      label: keyword,
      description:
        'Auto-generated search visibility query. Open the evidence links and manually verify whether the business appears, competitors dominate, or content gaps are visible. Do not claim exact rankings unless verified.',
      weight: keyword.toLowerCase().includes(profile.businessName.toLowerCase())
        ? 7
        : 10,
      access: 'public',
      evidenceLinks: [
        { label: 'Google web', url: googleSearch(`${keyword} ${profile.targetLocation}`) },
        { label: 'Google Maps', url: googleMapsSearch(`${keyword} ${profile.targetLocation}`) },
        { label: 'Bing web', url: bingSearch(`${keyword} ${profile.targetLocation}`) },
      ],
      fix: 'Search visibility fix: strengthen the matching service page, internal links, listing categories, local citations, reviews, proximity/service-area signals, and supporting content.',
    }))

  const aiItems: AuditItem[] = aiPlatforms.map((platform, index) => ({
    id: `ai-${platform.id}`,
    area: 'ai',
    label: `${platform.name} answer visibility`,
    description:
      'Guided AI answer scan. Open the platform, paste generated prompts, and note if the business is mentioned, sourced, accurate, and recommended.',
    weight: index < 3 ? 12 : 8,
    access: 'public',
    evidenceLinks: [{ label: `Open ${platform.name}`, url: platform.url }],
    fix: 'AI answer/source clarity fix: improve source-of-truth pages, schema, listings, third-party citations, reviews, and concise service/location facts.',
  }))

  const voiceItems: AuditItem[] = [
    {
      id: 'voice-nap',
      area: 'voice',
      label: 'Voice assistants can resolve name, phone, and website',
      description:
        'Manual readiness check. Ask assistants for official contact details and compare them to the intake profile.',
      weight: 14,
      access: 'public',
      evidenceLinks: [
        { label: 'Google query', url: googleSearch(`${profile.businessName} phone website`) },
        { label: 'Bing query', url: bingSearch(`${profile.businessName} phone website`) },
      ],
      fix: 'Normalize NAP data across major listings, website schema, contact page, and trusted citations.',
    },
    {
      id: 'voice-near-me',
      area: 'voice',
      label: 'Near-me service questions have clear source answers',
      description:
        'Manual readiness check. Test conversational service and location queries without relying on scraped rankings.',
      weight: 12,
      access: 'public',
      evidenceLinks: [
        { label: 'Service query', url: googleSearch(`${profile.primaryServices.split(',')[0]} near ${profile.targetLocation}`) },
        { label: 'Maps query', url: googleMapsSearch(`${profile.primaryServices.split(',')[0]} near ${profile.targetLocation}`) },
      ],
      fix: 'Add FAQ content, service-area language, reviews, and profile categories that match conversational search intent.',
    },
    {
      id: 'voice-faq',
      area: 'voice',
      label: 'FAQ content answers booking and service-area questions',
      description:
        'Public check. Confirm the website answers common spoken questions about pricing, availability, service area, and session types.',
      weight: 10,
      access: 'public',
      evidenceLinks: websiteLinks,
      fix: 'Publish concise FAQs using natural question phrasing and mark them up where appropriate.',
    },
  ]

  return [...listingItems, ...websiteItems, ...keywordItems, ...aiItems, ...voiceItems]
}
