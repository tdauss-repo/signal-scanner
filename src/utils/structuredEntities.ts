/** Shared bounded JSON-LD walker. Entity fields stay within their own record. */
export interface StructuredEntity {
  node: Record<string, unknown>
  types: string[]
  path: string
}
export const textValue = (value: unknown): string => typeof value === 'string' ? value.trim() : ''
export const schemaTypes = (value: unknown): string[] => (Array.isArray(value) ? value : [value]).filter((item): item is string => typeof item === 'string').map((item) => item.replace(/^https?:\/\/schema.org\//, ''))
export const isBusinessEntityType = (type: string) => /^(Organization|LocalBusiness|Corporation|EducationalOrganization|School|Preschool|CollegeOrUniversity|ChildCare|ProfessionalService|Store|Restaurant|FoodEstablishment|LodgingBusiness|Hotel|MedicalBusiness|MedicalOrganization|Dentist|Physician|HealthAndBeautyBusiness|AutoRepair|AutomotiveBusiness|HomeAndConstructionBusiness|Electrician|Plumber|RealEstateAgent|LegalService|FinancialService|SportsActivityLocation|ExerciseGym|EntertainmentBusiness|GovernmentOrganization|NGO|PerformingGroup|Library|Place)$/.test(type)
export function walkStructuredData(blocks: unknown[]): StructuredEntity[] {
  const nodes: StructuredEntity[] = []
  let budget = 2000
  const visit = (value: unknown, path: string, depth: number) => {
    if (!value || typeof value !== 'object' || depth > 14 || budget-- <= 0) return
    if (Array.isArray(value)) { value.slice(0, 200).forEach((item, index) => visit(item, `${path}[${index}]`, depth + 1)); return }
    const node = value as Record<string, unknown>
    nodes.push({ node, types: schemaTypes(node['@type']), path })
    Object.entries(node).slice(0, 100).forEach(([key, child]) => visit(child, `${path}.${key}`, depth + 1))
  }
  blocks.slice(0, 50).forEach((block, index) => visit(block, `$[${index}]`, 0))
  return nodes
}
export function resolveStructuredObject(value: unknown, nodes: StructuredEntity[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const object = value as Record<string, unknown>
  const id = textValue(object['@id'])
  const target = id ? nodes.find((entry) => entry.node !== object && entry.node['@id'] === id && Object.keys(entry.node).length > 1)?.node : undefined
  return { ...target, ...object }
}
export function parseJsonLdBlocks(html: string) {
  const blocks: unknown[] = []
  let invalid = 0
  const source = html.replace(/<!--[\s\S]*?-->/g, '')
  for (const match of [...source.matchAll(/<script\b[^>]*\btype\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].slice(0, 50)) {
    try { blocks.push(JSON.parse(match[1])) } catch { invalid++ }
  }
  return { blocks, invalid }
}

/** Follow an explicit single location relationship; never merge addresses from multiple locations. */
export function structuredEntityAddress(node: Record<string, unknown>, nodes: StructuredEntity[]) {
  const direct = resolveStructuredObject(node.address, nodes)
  if (Object.keys(direct).length) return direct
  const locations = (Array.isArray(node.location) ? node.location : [node.location]).map((value) => resolveStructuredObject(value, nodes))
  const addresses = locations.map((location) => resolveStructuredObject(location.address, nodes)).filter((address) => Object.keys(address).length > 0)
  return addresses.length === 1 ? addresses[0] : {}
}
