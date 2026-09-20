import type { SearchDestination } from '../types/audit'

export type AcquisitionProductionStatus = 'production' | 'manual_fallback'
export type AcquisitionShape = 'structured_then_browser' | 'native_fetch_then_browser' | 'manual'

export interface DestinationAcquisitionCapability {
  destination: SearchDestination
  preferredProvider: string
  fallbackProvider: string
  provingProvider?: string
  productionStatus: AcquisitionProductionStatus
  shape: AcquisitionShape
  automaticFound: boolean
  automaticNotFound: boolean
  blockerTypes: string[]
}

/**
 * Operational source of truth for the acquisition routes used by a visibility
 * scan. A manual fallback entry is intentionally not a promise that the
 * generic fetch/browser ladder can interpret that destination automatically.
 */
export const destinationAcquisitionCapabilities: DestinationAcquisitionCapability[] = [
  {
    destination: 'Google Search', preferredProvider: 'Bright Data SERP API', fallbackProvider: 'Bright Data Browser API',
    productionStatus: 'production', shape: 'structured_then_browser', automaticFound: true, automaticNotFound: true,
    blockerTypes: ['provider failure', 'challenge or unusual traffic', 'malformed or insufficient result region'],
  },
  {
    destination: 'Google Maps', preferredProvider: 'Bright Data Maps parsed acquisition', fallbackProvider: 'Bright Data Browser API',
    productionStatus: 'production', shape: 'structured_then_browser', automaticFound: true, automaticNotFound: true,
    blockerTypes: ['provider failure', 'challenge or consent wall', 'map shell without an inspected place region'],
  },
  {
    destination: 'Bing Search', preferredProvider: 'Found Local server fetch', fallbackProvider: 'Found Local rendered browser',
    productionStatus: 'production', shape: 'native_fetch_then_browser', automaticFound: true, automaticNotFound: true,
    blockerTypes: ['transport failure', 'challenge or access restriction', 'result region not inspected'],
  },
  {
    destination: 'Apple Maps', preferredProvider: 'Operator public observation', fallbackProvider: 'Open Apple Maps search', provingProvider: 'Bright Data Browser API',
    productionStatus: 'manual_fallback', shape: 'manual', automaticFound: false, automaticNotFound: false,
    blockerTypes: ['Bright Data target permission restriction', 'application shell without place evidence', 'provider access expansion required'],
  },
  {
    destination: 'Yelp', preferredProvider: 'Operator public observation', fallbackProvider: 'Open Yelp search', provingProvider: 'Bright Data Browser API',
    productionStatus: 'manual_fallback', shape: 'manual', automaticFound: false, automaticNotFound: false,
    blockerTypes: ['search endpoint HTTP 403', 'challenge page', 'direct discovered-profile path not yet live-validated'],
  },
  {
    destination: 'Facebook', preferredProvider: 'Operator public observation', fallbackProvider: 'Open Facebook search', provingProvider: 'Bright Data Browser API',
    productionStatus: 'manual_fallback', shape: 'manual', automaticFound: false, automaticNotFound: false,
    blockerTypes: ['login wall', 'public result not inspectable', 'Browser API path not yet live-validated'],
  },
  {
    destination: 'DuckDuckGo', preferredProvider: 'Operator public observation', fallbackProvider: 'Open DuckDuckGo search', provingProvider: 'Bright Data SERP API',
    productionStatus: 'manual_fallback', shape: 'manual', automaticFound: false, automaticNotFound: false,
    blockerTypes: ['provider upstream 5xx', 'structured SERP path not yet repeatable', 'malformed or missing result region'],
  },
  {
    destination: 'Instagram', preferredProvider: 'Operator public observation', fallbackProvider: 'Open Instagram search', provingProvider: 'Bright Data Browser API',
    productionStatus: 'manual_fallback', shape: 'manual', automaticFound: false, automaticNotFound: false,
    blockerTypes: ['login wall', 'public profile unavailable', 'Browser API path not yet live-validated'],
  },
]

export const destinationAcquisitionCapability = (destination: SearchDestination) =>
  destinationAcquisitionCapabilities.find((capability) => capability.destination === destination)!
