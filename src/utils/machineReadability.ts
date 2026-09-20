import { scanStateLabel } from './visibilityScanState'
import { evidenceFingerprint, matchesEvidenceFingerprint } from './evidenceFingerprint'
import type { AuditState, FixItem } from '../types/audit'
import type { MachineCheck, MachineReadabilityCapture, MachineReadabilityReport } from '../types/machineReadability'
import type { BusinessResultCandidate } from '../types/entityMatch'
import { matchBusinessCandidate, normalizedWords, reviewedProfileValue } from './entityMatcher'
import { host } from './presenceExtraction'
import { isBusinessEntityType, structuredEntityAddress, textValue, walkStructuredData } from './structuredEntities'

/** General (*) crawler rules for this path only. Bot-specific rules are exposed, not silently generalized. */
export function inspectRobots(robots: MachineReadabilityCapture['robots'] | undefined, pageUrl: string) {
  if (robots?.status === 406) return { result: 'unavailable' as const, conclusion: 'The robots.txt request returned HTTP 406. Targeted verification is required; this acquisition response does not establish that ordinary search crawlers are blocked.', evidence: ['HTTP 406', robots.requestedUrl] }
  if (!robots || robots.truncated || robots.error || !robots.status || robots.status < 200 || robots.status >= 300 || robots.text === undefined || /<html\b|<!doctype/i.test(robots.text)) return { result: 'unavailable' as const, conclusion: 'Crawler instructions were not captured as a usable robots text response.', evidence: robots ? [robots.error || `HTTP ${robots.status ?? 'unknown'}`, robots.requestedUrl] : [] }
  const groups: Array<{ agents: string[]; hasDirectives: boolean; rules: Array<{ allow: boolean; pattern: string }> }> = []
  let current: typeof groups[number] | undefined
  for (const line of robots.text.split(/\r?\n/)) {
    const match = line.replace(/#.*$/, '').trim().match(/^([a-z-]+)\s*:\s*(.*)$/i)
    if (!match) continue
    const [, rawKey, value] = match
    const key = rawKey.toLowerCase()
    if (key === 'user-agent') {
      if (!current || current.hasDirectives) { current = { agents: [], hasDirectives: false, rules: [] }; groups.push(current) }
      current.agents.push(value.toLowerCase())
    } else if (current && ['allow', 'disallow'].includes(key)) { current.hasDirectives = true; if (value) current.rules.push({ allow: key === 'allow', pattern: value }) }
  }
  if (robots.text.trim() && !groups.length && !/^\s*(#|sitemap:)/im.test(robots.text)) return { result: 'unavailable' as const, conclusion: 'The response could not be interpreted as crawler instructions.', evidence: [robots.requestedUrl] }
  const page = new URL(pageUrl)
  const path = `${page.pathname}${page.search}`
  const matchesPath = (pattern: string) => {
    // Literal segments and * only; never compile untrusted crawler rules into regexes.
    const anchored = pattern.endsWith('$')
    const parts = (anchored ? pattern.slice(0, -1) : pattern).split('*')
    if (!path.startsWith(parts[0])) return false
    let offset = parts[0].length
    if (parts.length === 1) return !anchored || offset === path.length
    for (const part of parts.slice(1, -1)) {
      const index = path.indexOf(part, offset)
      if (index < 0) return false
      offset = index + part.length
    }
    const last = parts.at(-1)!
    return anchored ? path.endsWith(last) && path.length - last.length >= offset : path.indexOf(last, offset) >= 0
  }
  const matching = groups.filter((group) => group.agents.includes('*')).flatMap((group) => group.rules).filter((rule) => matchesPath(rule.pattern))
    .sort((a, b) => b.pattern.replace(/[*$]/g, '').length - a.pattern.replace(/[*$]/g, '').length || Number(b.allow) - Number(a.allow))
  const disallowed = matching[0]?.allow === false
  const specific = groups.some((group) => group.agents.some((agent) => agent !== '*'))
  return { result: disallowed || specific ? 'needs_review' as const : 'observed' as const,
    conclusion: `${disallowed ? 'General crawler rules disallow the captured path.' : 'No general crawler block was identified for the captured path.'}${specific ? ' Named-agent groups are present and need separate interpretation.' : ''} This is not proof of indexing.`,
    evidence: [robots.requestedUrl, ...groups.map((group) => `${group.agents.join(', ')}: ${group.rules.map((rule) => `${rule.allow ? 'Allow' : 'Disallow'}: ${rule.pattern}`).join('; ')}`)] }
}

export function evaluateMachineReadability(state: AuditState): MachineReadabilityReport {
  const report: MachineReadabilityReport = { version: 1, profileKey: evidenceFingerprint(state.profile), profileReviewKey: evidenceFingerprint(state.businessProfile), analyzedAt: new Date().toISOString(), sourceUrl: state.profile.website,
    status: 'unavailable', checks: [], schemaTypes: [], entities: [], comparisons: [], evidenceReferences: [], conditions: [], answerTesting: 'not_performed' }
  const result = state.websiteAudit.latestAttempt
  if (!result?.ok || host(result.fetchedUrl) !== host(state.profile.website)) return report
  report.websiteEvidenceKey = evidenceFingerprint(result)
  report.sourceUrl = result.fetchedUrl
  report.acquisition = result.acquisition
  report.status = 'evidence_captured'
  const captured = result.machineReadabilityCapture
  const check = (id: string, group: MachineCheck['group'], outcome: MachineCheck['result'], conclusion: string, evidence: string[]) => report.checks.push({ id, group, result: outcome, conclusion, evidence })
  const text = captured?.visibleText || result.visibleTextSummary
  const words = normalizedWords(text)
  const observedPhrase = (phrase: string) => Boolean(phrase && words.includes(normalizedWords(phrase)))
  const reviewed = (field: Parameters<typeof reviewedProfileValue>[2]) => reviewedProfileValue(state.profile, state.businessProfile, field)
  const nameVisible = observedPhrase(reviewed('businessName'))
  const locationVisible = observedPhrase(reviewed('streetAddress')) || observedPhrase(reviewed('city'))
  const phoneVisible = Boolean(reviewed('phone') && text.replace(/\D/g, '').includes(reviewed('phone').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '')))
  const servicePhrases = [reviewed('primaryCategory'), ...reviewed('primaryServices').split(/[,;\n]/)].filter(Boolean)
  const serviceMatches = servicePhrases.filter(observedPhrase)
  const websiteAssociated = Boolean(reviewed('website') && host(reviewed('website')) === host(result.fetchedUrl))
  const identitySupported = nameVisible && websiteAssociated && (locationVisible || phoneVisible || serviceMatches.length > 0)

  const robots = inspectRobots(captured?.robots, result.fetchedUrl)
  check('robots-behavior', 'Technical accessibility', robots.result, robots.conclusion, robots.evidence)
  const directives = captured ? [...captured.metaRobots.map((tag) => `${tag.agent}: ${tag.content}`), captured.xRobotsTag].filter(Boolean) : []
  const noindex = directives.some((value) => /\bnoindex\b|\bnone\b/i.test(value))
  check('indexability', 'Technical accessibility', !captured ? 'unavailable' : noindex ? 'needs_review' : robots.result === 'observed' ? 'observed' : 'unavailable',
    !captured ? 'Page indexing directives were not captured in this audit version.' : noindex ? 'An explicit indexing restriction was observed; confirm its intended page and crawler scope.' : 'No explicit noindex was observed in captured page headers/metadata. Crawler access and actual indexing are separate questions.', directives)
  check('sitemap', 'Technical accessibility', result.sitemapAvailable ? 'observed' : 'unavailable', result.sitemapAvailable ? 'The sitemap endpoint responded successfully; document validity and search-engine use are not established.' : 'The audit did not establish sitemap availability; failure does not prove absence.', [new URL('/sitemap.xml', result.fetchedUrl).href])
  check('https', 'Technical accessibility', result.httpsAvailable ? 'observed' : 'needs_review', result.httpsAvailable ? 'A secure response was obtained by the transport check.' : 'The secure transport check did not complete successfully. Review the retained transport evidence; no cause is inferred here.', [JSON.stringify(result.transportEvidence || { httpsAvailable: result.httpsAvailable, httpsStatus: result.httpsStatus })])
  const browser = state.websiteAudit.browserObservation
  const currentBrowser = browser?.acquisition && browser.analyzedAt && host(browser.sourceUrl) === host(result.fetchedUrl) && Date.parse(browser.capturedAt) >= Date.parse(result.analyzedAt)
  check('rendered-accessibility', 'Technical accessibility', currentBrowser && browser.visibleText.trim() ? 'observed' : 'unavailable', currentBrowser ? 'A dated rendered observation is available; review source/render differences.' : 'No current rendered website observation is available. Source capture alone does not establish rendered behavior.', currentBrowser ? [browser.sourceUrl, browser.capturedAt, browser.visibleText.slice(0, 1000)] : [])
  const titles = captured?.titles || (result.title ? [result.title] : [])
  check('title', 'Page metadata', titles.length === 1 && titles[0].trim() ? 'observed' : 'needs_review', `${titles.length} title elements recorded in the captured response.`, titles)
  const descriptions = result.metaDescriptions
  check('description', 'Page metadata', !descriptions ? 'unavailable' : descriptions.length === 1 && descriptions[0].trim() ? 'observed' : 'needs_review', descriptions ? `${descriptions.length} homepage search-description elements captured.` : 'Description multiplicity was not captured.', descriptions || [result.metaDescription])
  const canonicals = captured?.canonicals || (result.canonicalUrl ? [result.canonicalUrl] : [])
  const canonicalConflicts = canonicals.some((url) => { try { const target = new URL(url, result.fetchedUrl); return host(target.href) !== host(result.fetchedUrl) || target.pathname.replace(/\/$/, '') !== new URL(result.fetchedUrl).pathname.replace(/\/$/, '') } catch { return true } })
  check('canonical', 'Page metadata', canonicals.length === 1 && !canonicalConflicts ? 'observed' : 'needs_review', canonicals.length === 1 && !canonicalConflicts ? 'The declared primary page address matches the captured host and path; scheme/redirect behavior remains in the transport evidence.' : 'The captured primary-address declarations need review for absence, multiplicity or a different target.', canonicals)
  check('social-metadata', 'Page metadata', !captured ? 'unavailable' : Object.keys(captured.openGraph).length ? 'observed' : 'not_observed', 'Related public sharing metadata, when present; its absence alone does not generate a finding.', captured ? [JSON.stringify(captured.openGraph)] : [])

  const nodes = walkStructuredData(result.jsonLdSchemaBlocks)
  report.schemaTypes = [...new Set(nodes.flatMap((entry) => entry.types))]
  const entities = nodes.filter((entry) => entry.types.some(isBusinessEntityType))
  for (const entry of entities) {
    const address = structuredEntityAddress(entry.node, nodes)
    const node = entry.node
    const fields: BusinessResultCandidate['fields'] = {}
    const facts = { name: node.name, streetAddress: address.streetAddress, locality: address.addressLocality, region: address.addressRegion, postalCode: address.postalCode, phone: node.telephone, website: node.url, category: node.category }
    for (const [key, value] of Object.entries(facts)) if (textValue(value)) fields[key as keyof typeof fields] = textValue(value)
    if (typeof node.address === 'string') fields.address = node.address
    const evidence = [{ sourceUrl: result.fetchedUrl, acquiredAt: result.analyzedAt, method: 'server_fetch' as const, provider: result.acquisition.provider, locator: entry.path, excerpt: JSON.stringify(node).slice(0, 4000) }]
    report.entities.push({ path: entry.path, types: entry.types, facts: { ...fields, ...(node['@id'] ? { entityId: node['@id'] } : {}), ...(Object.keys(address).length ? { address } : {}), ...(node.logo ? { logo: node.logo } : {}), ...(node.sameAs ? { sameAs: node.sameAs } : {}), ...(node.openingHours ? { openingHours: node.openingHours } : {}), ...(node.openingHoursSpecification ? { openingHoursSpecification: node.openingHoursSpecification } : {}), ...(node.location ? { location: node.location } : {}), ...(node.hasOfferCatalog ? { hasOfferCatalog: node.hasOfferCatalog } : {}), ...(node.makesOffer ? { makesOffer: node.makesOffer } : {}) } })
    report.evidenceReferences.push(...evidence)
    report.comparisons.push(matchBusinessCandidate({ id: entry.path, kind: 'structured_entity', fields, schemaTypes: entry.types, evidence }, state.profile, state.businessProfile))
  }
  const associated = report.comparisons.filter((comparison) => comparison.matchedFields.some((field) => field.field === 'name' || field.field === 'website'))
  const associatedEntities = report.entities.filter((entity) => associated.some((comparison) => comparison.candidate.id === entity.path))
  check('jsonld', 'Structured business information', result.jsonLdSchemaBlocks.length ? 'observed' : captured?.jsonLdParseErrors === 0 ? 'not_observed' : 'unavailable', 'Parsed structured-data blocks and schema types from this homepage response. Generic page/site schema does not describe a business entity completely.', [JSON.stringify(report.schemaTypes), `Parsed blocks: ${result.jsonLdSchemaBlocks.length}; invalid blocks: ${captured?.jsonLdParseErrors ?? 'not recorded'}`])
  check('business-entity', 'Structured business information', associated.length ? 'observed' : entities.length ? 'needs_review' : 'not_observed', associated.length ? 'A structured entity is associated with reviewed business identity fields; this does not imply completeness.' : entities.length ? 'Entity-like records are present but association with the reviewed business is unresolved.' : 'No supported business/organization entity was parsed in the captured homepage.', associated.length ? associated.map((match) => `${match.candidate.id}: ${JSON.stringify(match.candidate.fields)}`) : report.schemaTypes)
  for (const key of ['name', 'address', 'phone', 'website', 'logo', 'sameAs', 'openingHours', 'openingHoursSpecification'] as const) {
    const values = associatedEntities.flatMap((entity) => entity.facts[key] !== undefined ? [JSON.stringify(entity.facts[key])] : key === 'address' && entity.facts.streetAddress ? [JSON.stringify(entity.facts.streetAddress)] : [])
    check(`entity-${key}`, 'Structured business information', values.length ? 'observed' : 'not_observed', `${key}: ${values.length ? 'represented in an associated captured entity' : 'not observed in an associated captured entity'}. ${key.startsWith('openingHours') ? 'Public hours are captured, not owner-verified.' : 'An absent field alone is not a finding.'}`, values)
  }
  const relationships = nodes.flatMap((entry) => ['location', 'areaServed', 'provider', 'parentOrganization', 'department', 'subOrganization', 'hasOfferCatalog', 'makesOffer', 'serviceType'].filter((key) => entry.node[key] !== undefined).map((key) => `${entry.path}.${key}: ${JSON.stringify(entry.node[key]).slice(0, 1200)}`))
  check('entity-relationships', 'Structured business information', relationships.length ? 'observed' : 'not_observed', 'Explicit entity/location/service relationships recorded without inventing absent relationships.', relationships)
  check('visible-identity', 'Semantic clarity', nameVisible ? 'observed' : reviewed('businessName') ? 'needs_review' : 'unavailable', 'Reviewed business name in captured page content; metadata-only name matches do not prove visible identity.', nameVisible ? [reviewed('businessName')] : [])
  check('visible-location', 'Semantic clarity', locationVisible ? 'observed' : reviewed('city') || reviewed('streetAddress') ? 'needs_review' : 'unavailable', 'Only explicitly reviewed location phrases are compared with the captured text; other pages were not inferred.', locationVisible ? [reviewed('streetAddress'), reviewed('city')].filter(observedPhrase) : [])
  check('visible-services', 'Semantic clarity', serviceMatches.length ? 'observed' : servicePhrases.length ? 'needs_review' : 'unavailable', 'Reviewed service/category phrases observed on this page. Missing profile detail is not a business defect.', serviceMatches)
  check('content-structure', 'Semantic clarity', result.h1Text.length + result.h2Text.length ? 'observed' : 'not_observed', 'Heading content is recorded for review. A missing H1 alone does not generate a finding.', [...result.h1Text, ...result.h2Text])
  const links = captured?.internalLinks || result.serviceLinks.map((url) => ({ url, text: '' }))
  check('supporting-content', 'Semantic clarity', links.length ? 'observed' : 'not_observed', 'Observed internal links provide supporting paths; their destination content was not fetched by this check.', links.map((link) => `${link.text} ${link.url}`))
  const conflicts = associated.flatMap((comparison) => comparison.conflictingFields)
  check('profile-consistency', 'Profile consistency', conflicts.length ? 'needs_review' : associated.length ? 'observed' : 'unavailable', 'Only current reviewed profile fields are compared. Unreviewed or unobserved fields remain unknown; public facts never replace the profile.', associated.map((comparison) => JSON.stringify({ matched: comparison.matchedFields, conflicts: comparison.conflictingFields, missing: comparison.missingFields, unreviewedProfile: comparison.unreviewedProfileFields })))

  const knownGeneric = new Set(['WebSite', 'WebPage', 'AboutPage', 'ContactPage', 'CollectionPage', 'ItemPage', 'FAQPage', 'BreadcrumbList', 'ListItem', 'ImageObject', 'SearchAction', 'ReadAction', 'EntryPoint', 'Offer', 'Service', 'PostalAddress', 'GeoCoordinates', 'Question', 'Answer'])
  if (identitySupported && captured?.jsonLdParseErrors === 0 && !entities.length && report.schemaTypes.every((type) => knownGeneric.has(type))) {
    report.conditions.push({ id: 'missing_business_entity', evidence: [`The captured homepage identifies ${reviewed('businessName')} and corroborates reviewed contact, location or service facts.`, `Parsed schema types: ${report.schemaTypes.join(', ') || 'none'}. No business/organization entity was parsed in this response.`] })
  }
  if (identitySupported && associated.length && !associatedEntities.some((entity) => entity.facts.website || entity.facts.phone || entity.facts.address || entity.facts.streetAddress || entity.facts.location || entity.facts.entityId || entity.facts.sameAs)) {
    report.conditions.push({ id: 'incomplete_business_identity', evidence: ['The captured entity names the business but supplies no website, phone or address link, despite supported identity/contact/location content on the same page.'] })
  } else if (identitySupported && associated.length && reviewed('streetAddress') && locationVisible && !associatedEntities.some((entity) => entity.facts.address || entity.facts.streetAddress || entity.facts.location)) {
    report.conditions.push({ id: 'location_not_represented', evidence: ['A reviewed physical location is visible in the homepage content but not represented on its associated structured business entity.'] })
  }
  if (identitySupported && conflicts.length) report.conditions.push({ id: 'business_profile_conflict', evidence: conflicts.map((conflict) => `${conflict.field}: captured “${conflict.observed}”; reviewed profile “${conflict.expected}”. Confirm the correct value before changing either source.`) })
  return report
}

export function currentMachineReadability(state: AuditState) {
  const report = state.machineReadability
  if (!report || !matchesEvidenceFingerprint(report.profileKey, state.profile) || !matchesEvidenceFingerprint(report.profileReviewKey, state.businessProfile)) return undefined
  if (report.status === 'unavailable') return report
  if (!state.websiteAudit.latestAttempt?.ok || (!matchesEvidenceFingerprint(report.websiteEvidenceKey, state.websiteAudit.lastSuccessful) || !matchesEvidenceFingerprint(report.websiteEvidenceKey, state.websiteAudit.latestAttempt))) return undefined
  const browser = state.websiteAudit.browserObservation
  if (browser && host(browser.sourceUrl) === host(report.sourceUrl) && (!browser.acquisition || Date.parse(browser.capturedAt) > Date.parse(state.websiteAudit.lastSuccessful!.analyzedAt))) return undefined
  return report
}

/** Counts evaluated checks separately from usable evidence and unresolved checks; no score. */
export function summarizeMachineReadability(state: AuditState) {
  const report = currentMachineReadability(state)
  const checks = report?.status === 'evidence_captured' ? report.checks : []
  const scanState = report?.status === 'evidence_captured' ? 'evidence_captured' as const
    : state.machineReadability ? 'interactive_review_required' as const : 'not_checked' as const
  const evaluated = checks.length
  const evidence = checks.filter((check) => check.result !== 'unavailable').length
  const reviewRequired = checks.filter((check) => check.result === 'needs_review').length
  const unavailable = checks.filter((check) => check.result === 'unavailable').length
  return { scanState, statusLabel: scanStateLabel[scanState], evaluated, evidence, reviewRequired, unavailable,
    detail: `${evaluated} evaluated · ${evidence} with evidence · ${reviewRequired} need review · ${unavailable} unavailable` }
}

export const machineIdentityTitle = 'Incomplete machine-readable business identity'
const identityWhy = 'Search engines and AI systems use structured and visible information to understand which real-world organization a website represents. Clearer business identity signals can reduce ambiguity when those systems interpret the site. Improvements do not guarantee rankings or AI citations, or eligibility for rich results.'

const findingCopy = {
  missing_business_entity: [machineIdentityTitle, 'No explicit structured organization/business entity was observed that clearly identifies the real-world business and connects its confirmed location, contact information and related profiles.', 'Add an appropriate structured organization/business entity using confirmed business information. Choose an entity type appropriate to the actual organization rather than forcing a generic LocalBusiness type.'],
  incomplete_business_identity: [machineIdentityTitle, 'The captured business description names the business but leaves out supported contact, location and website connections.', 'Complete the business description using confirmed public identity and contact information.'],
  business_profile_conflict: ['Business information differs between site and profile', 'Some captured business details differ from the reviewed profile.', 'Confirm the correct facts and propose corrections to the specific inconsistent source.'],
  location_not_represented: ['Location information is incomplete for machines', 'The captured page shows a confirmed physical location, but its structured business description does not connect that location to the business.', 'Connect the confirmed location to the existing business description.'],
} as const
export function deriveMachineFindings(state: AuditState): FixItem[] {
  const report = currentMachineReadability(state)
  if (!report || report.status !== 'evidence_captured' || !report.acquisition) return []
  return report.conditions.map((condition) => {
    const [title, baseFound, recommendation] = findingCopy[condition.id]
    const found = condition.id === 'missing_business_entity' && report.schemaTypes.some((type) => ['WebSite', 'WebPage'].includes(type))
      ? `The website includes general page/website structured data, but no explicit structured organization/business entity was observed that clearly identifies the real-world business and connects its confirmed location, contact information and related profiles.` : baseFound
    const evidence = condition.evidence.join(' ')
    const verification = 'After approved implementation, refetch the homepage and parse JSON-LD. Verify the expected entity type and confirmed name/address/phone/URL fields against the approved proposal; do not invent unconfirmed fields. Verify that no contradictory structured identity was introduced. Rescan Machine Readability / AI Readiness and check for unrelated metadata or page regressions.'
    const change = `${recommendation} Use Organization or a more specific business type only when the reviewed profile supports it. Preserve valid existing page/site schema and entity identifiers; do not create a competing duplicate entity.`
    const access = ['Authorized CMS/SEO configuration or site-template access after scope and implementation approval']
    const expected = 'A consistent, connected description of the agreed business facts on the intended homepage, without duplicate/conflicting entity definitions.'
    const rollback = 'Export/back up the affected setting or template and prior page output. Restore that exact version and clear affected caches if validation or unrelated page behavior regresses.'
    return { id: `finding-machine-${condition.id}`, area: 'Machine Readability', sourceArea: 'ai_geo_readiness' as const, issue: title, fix: recommendation, status: 'partial' as const, priority: 'Medium' as const,
      reviewed: false, salesPackageFit: 'starter' as const, evidenceNote: evidence, evidenceSummary: evidence, evidenceSources: [report.sourceUrl], evidenceConfidence: 'scanner_detected_public_page' as const,
      whyItMatters: identityWhy, verificationMethod: verification,
      intelligence: { ruleVersion: 1 as const, checkId: `machine-${condition.id}`, condition: condition.id, evidence: { provenance: report.acquisition!, observations: condition.evidence, confidence: 'supported' as const }, lifecycle: 'Evidence captured' as const,
        customer: { title, found, why: identityWhy, recommendation, canRemediate: true,
          confirmation: 'Confirm the business facts, intended change, access and scope before implementation.', evidenceSummary: evidence, verificationSummary: 'After an approved change, we will fetch the homepage again, inspect its structured business information, confirm the organization type and agreed name, address, phone and website details, check for contradictory identity information, and rerun website readability checks.' },
        delivery: { technicalChange: change, steps: ['Confirm target entity and current profile facts.', 'Inspect existing JSON-LD emitters and stable entity IDs; draft the smallest correction.', 'Review the proposal, access, verification and rollback with the operator and customer. Stop before implementation.'], access, customerInput: ['Confirmed public facts and location relationships', 'Separate approval for the proposed implementation'], dependencies: ['Identify the responsible CMS/plugin/template and bounded implementation scope', 'No factual inference from public evidence alone'], scope: 'starter' as const },
        verification: { expectedState: expected, method: verification, criteria: ['Homepage refetched and JSON-LD parsed', 'Expected entity type matches the confirmed organization', 'Confirmed name/address/phone/URL fields match the approved proposal', 'No contradictory structured identity or duplicate entity introduced', 'Machine Readability / AI Readiness rescanned', 'Page behavior and unrelated metadata remain intact'] },
        remediation: { proposedChange: change, accessRequired: access, implementationMechanism: 'Bounded CMS/plugin configuration or existing template edit, selected only after access and emitter review', expectedPostChangeState: expected, verificationMethod: verification, rollbackRecovery: rollback, lifecycle: 'Evidence captured' as const },
      },
    }
  })
}
