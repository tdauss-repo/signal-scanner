import type { BusinessProfile, EvidenceLink } from '../types/audit'

const encode = (value: string) => encodeURIComponent(value.trim())

export const googleSearch = (query: string) =>
  `https://www.google.com/search?q=${encode(query)}`

export const googleMapsSearch = (query: string) =>
  `https://www.google.com/maps/search/${encode(query)}`

export const bingSearch = (query: string) =>
  `https://www.bing.com/search?q=${encode(query)}`

export const duckDuckGoSearch = (query: string) =>
  `https://duckduckgo.com/?q=${encode(query)}`

export const richResultsTest = (url: string) =>
  `https://search.google.com/test/rich-results?url=${encode(url)}`

export const pageSpeedTest = (url: string) =>
  `https://pagespeed.web.dev/analysis?url=${encode(url)}`

export const makeSearchLinks = (
  profile: BusinessProfile,
  query: string,
): EvidenceLink[] => [
  { label: 'Google web', url: googleSearch(query) },
  {
    label: 'Google Maps',
    url: googleMapsSearch(`${profile.businessName} ${profile.serviceArea}`),
  },
  { label: 'Bing web', url: bingSearch(query) },
]
