import type {
  AuditState,
  FixItem,
  PackageCommercialPricing,
  PackagePrice,
  PackagePricingState,
  PricingBillingType,
} from '../types/audit'
import { derivePackagePreparation } from './packagePreparation'

export type RecurringBillingType = Exclude<PricingBillingType, 'one_time'>

export interface EffectivePackageOffer {
  key: string
  name: string
  scopeClassification: 'starter' | 'separate'
  included: string[]
  pricing?: PackageCommercialPricing
}

export interface PackagePricingInput {
  oneTimeAmount: string
  recurringAmount: string
  recurringBillingType: RecurringBillingType
  customerPricingNote: string
  internalPricingNote: string
}

export type MoneyInputResult =
  | { state: 'absent' }
  | { state: 'valid'; amountCents: number }
  | { state: 'invalid'; message: string }

const supportedBillingTypes = new Set<PricingBillingType>(['one_time', 'monthly', 'annual', 'custom'])

export const parseUsdAmount = (input: string): MoneyInputResult => {
  const value = input.trim()
  if (!value) return { state: 'absent' }
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) return { state: 'invalid', message: 'Enter a non-negative USD amount with no more than two decimal places.' }
  const [dollars, fraction = ''] = value.split('.')
  const amountCents = Number(dollars) * 100 + Number(fraction.padEnd(2, '0'))
  if (!Number.isSafeInteger(amountCents) || amountCents < 0) return { state: 'invalid', message: 'Enter a supported USD amount.' }
  return { state: 'valid', amountCents }
}

export const formatUsdCents = (amountCents: number) => {
  const dollars = amountCents / 100
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: amountCents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(dollars)
}

export const formatPriceDisplay = (price: PackagePrice) => {
  const amount = formatUsdCents(price.amountCents)
  if (price.billingType === 'one_time') return `${amount} one-time`
  if (price.billingType === 'monthly') return `${amount}/month`
  if (price.billingType === 'annual') return `${amount}/year`
  return amount
}

const normalizedPackageName = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase()

export const packagePricingKey = (name: string, scopeClassification: 'starter' | 'separate') =>
  `${scopeClassification}:${normalizedPackageName(name)}`

const validPrice = (value: unknown): value is PackagePrice => {
  if (!value || typeof value !== 'object') return false
  const price = value as Partial<PackagePrice>
  return Number.isSafeInteger(price.amountCents) && Number(price.amountCents) >= 0
    && price.currency === 'USD' && supportedBillingTypes.has(price.billingType as PricingBillingType)
}

export const normalizePackagePricingState = (value: unknown): PackagePricingState | undefined => {
  if (!value || typeof value !== 'object') return undefined
  const source = value as Partial<PackagePricingState>
  if (source.currency !== 'USD' || !source.packages || typeof source.packages !== 'object') return undefined
  const packages: Record<string, PackageCommercialPricing> = {}
  for (const candidate of Object.values(source.packages)) {
    if (!candidate || typeof candidate !== 'object') continue
    const entry = candidate as Partial<PackageCommercialPricing>
    const packageName = typeof entry.packageName === 'string' ? entry.packageName.trim().replace(/\s+/g, ' ') : ''
    if (!packageName || !['starter', 'separate'].includes(entry.scopeClassification || '')) continue
    const scopeClassification = entry.scopeClassification as 'starter' | 'separate'
    const oneTimePrice = validPrice(entry.oneTimePrice) && entry.oneTimePrice.billingType === 'one_time' ? entry.oneTimePrice : undefined
    const recurringPrice = validPrice(entry.recurringPrice) && entry.recurringPrice.billingType !== 'one_time' ? entry.recurringPrice : undefined
    const customerPricingNote = typeof entry.customerPricingNote === 'string' ? entry.customerPricingNote.trim() : ''
    const internalPricingNote = typeof entry.internalPricingNote === 'string' ? entry.internalPricingNote.trim() : ''
    packages[packagePricingKey(packageName, scopeClassification)] = {
      packageName,
      scopeClassification,
      ...(oneTimePrice ? { oneTimePrice } : {}),
      ...(recurringPrice ? { recurringPrice } : {}),
      ...(customerPricingNote ? { customerPricingNote } : {}),
      ...(internalPricingNote ? { internalPricingNote } : {}),
    }
  }
  return { version: 1, currency: 'USD', packages }
}

export const deriveEffectivePackageOffers = (state: AuditState, fixes: FixItem[]): EffectivePackageOffer[] => {
  const preparation = derivePackagePreparation(state, fixes)
  const offers: Array<Omit<EffectivePackageOffer, 'pricing'>> = []
  if (preparation.starterItems.length) {
    offers.push({
      key: packagePricingKey('Starter Visibility Cleanup', 'starter'),
      name: 'Starter Visibility Cleanup',
      scopeClassification: 'starter',
      included: [...new Set(preparation.starterItems.map((item) => item.includedScope))],
    })
  }
  const separate = new Map<string, { name: string; included: string[] }>()
  for (const item of preparation.separateScopeItems) {
    const key = packagePricingKey(item.packageAssignment, 'separate')
    const group = separate.get(key) || { name: item.packageAssignment, included: [] }
    if (!group.included.includes(item.includedScope)) group.included.push(item.includedScope)
    separate.set(key, group)
  }
  for (const [key, group] of separate) offers.push({ key, name: group.name, scopeClassification: 'separate', included: group.included })
  return offers.map((offer) => ({ ...offer, pricing: state.packagePricing?.packages[offer.key] }))
}

export const buildPackageCommercialPricing = (
  offer: Pick<EffectivePackageOffer, 'name' | 'scopeClassification'>,
  input: PackagePricingInput,
): { pricing?: PackageCommercialPricing; errors: string[] } => {
  const oneTime = parseUsdAmount(input.oneTimeAmount)
  const recurring = parseUsdAmount(input.recurringAmount)
  const errors = [
    ...(oneTime.state === 'invalid' ? [`One-time price: ${oneTime.message}`] : []),
    ...(recurring.state === 'invalid' ? [`Recurring price: ${recurring.message}`] : []),
    ...(!['monthly', 'annual', 'custom'].includes(input.recurringBillingType) ? ['Recurring billing type is not supported.'] : []),
  ]
  if (errors.length) return { errors }
  const customerPricingNote = input.customerPricingNote.trim()
  const internalPricingNote = input.internalPricingNote.trim()
  return {
    pricing: {
      packageName: offer.name,
      scopeClassification: offer.scopeClassification,
      ...(oneTime.state === 'valid' ? { oneTimePrice: { amountCents: oneTime.amountCents, currency: 'USD', billingType: 'one_time' } as const } : {}),
      ...(recurring.state === 'valid' ? { recurringPrice: { amountCents: recurring.amountCents, currency: 'USD', billingType: input.recurringBillingType } } : {}),
      ...(customerPricingNote ? { customerPricingNote } : {}),
      ...(internalPricingNote ? { internalPricingNote } : {}),
    },
    errors: [],
  }
}

export const packagePricingIsComplete = (offers: EffectivePackageOffer[]) =>
  offers.length > 0 && offers.every((offer) => Boolean(offer.pricing?.oneTimePrice))

export const initialProjectTotal = (offers: EffectivePackageOffer[]): PackagePrice | undefined => {
  if (!packagePricingIsComplete(offers)) return undefined
  return {
    amountCents: offers.reduce((total, offer) => total + (offer.pricing?.oneTimePrice?.amountCents || 0), 0),
    currency: 'USD',
    billingType: 'one_time',
  }
}
