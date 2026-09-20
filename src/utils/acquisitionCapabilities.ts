import type { SearchDestination } from '../types/audit'

export type AcquisitionProductionStatus = 'production' | 'manual_fallback'
export type AcquisitionShape = 'structured_then_browser' | 'native_fetch_then_browser' | 'manual'

export interface DestinationAcquisitionCapability {
  destination: SearchDestination
  preferredProvider: string
  fallbackProvider: string
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
    destination: 'Apple Maps', preferredProvider: 'Operator public observation', fallbackProvider: 'Open Apple Maps search',
    productionStatus: 'manual_fallback', shape: 'manual', automaticFound: false, automaticNotFound: false,
    blockerTypes: ['application shell without place evidence', 'interaction required', 'no live-validated structured provider'],
  },
  {
    destination: 'Yelp', preferredProvider: 'Operator public observation', fallbackProvider: 'Open Yelp search',
    productionStatus: 'manual_fallback', shape: 'manual', automaticFound: false, automaticNotFound: false,
    blockerTypes: ['HTTP 403 or access restriction', 'challenge page', 'no live-validated provider adapter'],
  },
  {
    destination: 'Facebook', preferredProvider: 'Operator public observation', fallbackProvider: 'Open Facebook search',
    productionStatus: 'manual_fallback', shape: 'manual', automaticFound: false, automaticNotFound: false,
    blockerTypes: ['login wall', 'public result not inspectable', 'no live-validated provider adapter'],
  },
  {
    destination: 'DuckDuckGo', preferredProvider: 'Operator public observation', fallbackProvider: 'Open DuckDuckGo search',
    productionStatus: 'manual_fallback', shape: 'manual', automaticFound: false, automaticNotFound: false,
    blockerTypes: ['current native acquisition not live-validated', 'Bright Data SERP adapter not yet production-integrated'],
  },
  {
    destination: 'Instagram', preferredProvider: 'Operator public observation', fallbackProvider: 'Open Instagram search',
    productionStatus: 'manual_fallback', shape: 'manual', automaticFound: false, automaticNotFound: false,
    blockerTypes: ['login wall', 'public profile unavailable', 'no live-validated provider adapter'],
  },
]

export const destinationAcquisitionCapability = (destination: SearchDestination) =>
  destinationAcquisitionCapabilities.find((capability) => capability.destination === destination)!
