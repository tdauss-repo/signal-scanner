import { acquireInstagramProfileRuntime } from '../server/acquisitionRuntime.ts'
import type { BusinessProfileField, BusinessProfileState } from '../src/types/audit.ts'
import { assessSearchCapture } from '../src/utils/searchResultExtraction.ts'
import { canonicalMetaProfileUrl } from '../src/utils/metaPublicEvidence.ts'
import { normalizeWorkspaceProfile } from '../src/utils/workspaceProfile.ts'

const args = process.argv.slice(2)
const value = args.find((item) => !item.startsWith('--')) || ''
const flag = (name: string) => {
  const inline = args.find((item) => item.startsWith(`--${name}=`))
  return inline?.slice(name.length + 3) || ''
}

if (!value) {
  console.error('Usage: npm run diagnose:instagram-acquisition -- "<public-profile-url>" [--source=website|search] [--name="Business"] [--website="https://example.com"] [--phone="..."] [--address="..."]')
  process.exitCode = 1
} else {
  const sourceFlag = flag('source')
  const source = sourceFlag === 'website' ? 'website' : sourceFlag === 'search' ? 'search evidence' : 'none'
  const canonical = canonicalMetaProfileUrl('Instagram', value)
  try {
    const { capture } = await acquireInstagramProfileRuntime(value)
    const candidates = capture.normalizedSearchCandidates || []
    const profile = normalizeWorkspaceProfile({
      businessName: flag('name'), website: flag('website'), phone: flag('phone'), streetAddress: flag('address'),
    })
    const fields = ['businessName', 'website', 'phone', 'streetAddress'].filter((field) => profile[field as keyof typeof profile]) as BusinessProfileField[]
    const profileState: BusinessProfileState = { schemaVersion: 1, values: Object.fromEntries(fields.map((field) => [field, {
      value: profile[field], source: 'diagnostic argument', confidence: 'high', status: 'operator_reviewed', recordedAt: new Date().toISOString(),
    }])) as BusinessProfileState['values'] }
    const assessment = fields.length ? assessSearchCapture(capture, profile, profileState, 'Instagram', 'brand') : undefined
    const present = (field: string) => candidates.some((item) => item.fields[field as keyof typeof item.fields]) ? 'present' : 'absent'
    const restricted = ['login_required', 'access_restricted', 'challenge'].includes(capture.blocker || '')
    const decision = assessment?.instagramIdentityDecision?.decision === 'verified' ? 'verified'
      : restricted ? 'discovered_review'
        : ['failed', 'unavailable'].includes(capture.outcome) ? 'unavailable' : 'review_required'
    console.log(`Discovery source: ${source}`)
    console.log(`Profile URL: ${canonical || 'absent'}`)
    console.log(`Request attempted: ${capture.requestAttempted === false ? 'no' : 'yes'}`)
    console.log(`Provider: ${capture.provider}`)
    console.log(`HTTP: ${capture.statusCode ?? 'unavailable'}`)
    console.log(`Login/access restriction: ${restricted ? 'yes' : 'no'}`)
    console.log(`Public identity fields: name ${present('name')}; website ${present('website')}; address ${present('address')}; phone ${present('phone')}`)
    console.log(`Matched fields: ${assessment?.instagramIdentityDecision?.matchedSignals.map((item) => item.field).join(', ') || 'none'}`)
    console.log(`Effective decision: ${decision}`)
  } catch (error) {
    console.log(`Discovery source: ${source}`)
    console.log(`Profile URL: ${canonical || 'absent'}`)
    console.log('Request attempted: no')
    console.log('Provider: instagram-native-fetch')
    console.log('HTTP: unavailable')
    console.log('Login/access restriction: no')
    console.log('Public identity fields: name absent; website absent; address absent; phone absent')
    console.log('Matched fields: none')
    console.log('Effective decision: unavailable')
    console.log(`Reason: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  }
}
