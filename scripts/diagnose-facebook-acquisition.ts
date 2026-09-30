import { acquireFacebookPageRuntime } from '../server/acquisitionRuntime.ts'
import type { BusinessProfileField, BusinessProfileState } from '../src/types/audit.ts'
import { assessSearchCapture } from '../src/utils/searchResultExtraction.ts'
import { normalizeWorkspaceProfile } from '../src/utils/workspaceProfile.ts'

const args = process.argv.slice(2)
const value = args.find((item) => !item.startsWith('--')) || ''
const flag = (name: string) => {
  const inline = args.find((item) => item.startsWith(`--${name}=`))
  return inline?.slice(name.length + 3) || ''
}

if (!value) {
  console.error('Usage: npm run diagnose:facebook-acquisition -- "<public-profile-url>" [--source=website|search] [--name="Business"] [--website="https://example.com"] [--phone="..."] [--address="..."]')
  process.exitCode = 1
} else {
  const started = Date.now()
  try {
    const { capture } = await acquireFacebookPageRuntime(value)
    const candidate = capture.normalizedSearchCandidates?.[0]
    const source = flag('source') || 'none'
    const profile = normalizeWorkspaceProfile({
      businessName: flag('name'), website: flag('website'), phone: flag('phone'), streetAddress: flag('address'),
    })
    const fields = ['businessName', 'website', 'phone', 'streetAddress'].filter((field) => profile[field as keyof typeof profile]) as BusinessProfileField[]
    const profileState: BusinessProfileState = { schemaVersion: 1, values: Object.fromEntries(fields.map((field) => [field, {
      value: profile[field], source: 'diagnostic argument', confidence: 'high', status: 'operator_reviewed', recordedAt: new Date().toISOString(),
    }])) as BusinessProfileState['values'] }
    const assessment = fields.length ? assessSearchCapture(capture, profile, profileState, 'Facebook', 'brand') : undefined
    const present = (field: string) => candidate?.fields[field as keyof typeof candidate.fields] ? 'present' : 'absent'
    console.log(`Profile discovery source: ${source}`)
    console.log(`Public request attempted: ${capture.requestAttempted === false ? 'no' : 'yes'}`)
    console.log(`Provider: ${capture.provider}`)
    console.log(`HTTP: ${capture.statusCode ?? 'unavailable'}`)
    console.log(`Blocker: ${capture.blocker || 'none'}`)
    console.log(`Elapsed: ${Date.now() - started} ms`)
    console.log(`Login/access restriction: ${['login_required', 'access_restricted', 'challenge'].includes(capture.blocker || '') ? 'yes' : 'no'}`)
    console.log(`Structured identity fields: name ${present('name')}; address ${present('address')}; phone ${present('phone')}; website ${present('website')}`)
    console.log(`Matched fields: ${assessment?.facebookIdentityDecision?.matchedSignals.map((item) => item.field).join(', ') || 'not evaluated'}`)
    console.log(`Effective decision: ${assessment?.facebookIdentityDecision?.decision === 'verified' ? 'verified' : capture.outcome === 'blocked' ? 'discovered_review' : ['failed', 'unavailable'].includes(capture.outcome) ? 'unavailable' : assessment ? 'review_required' : 'reviewed identity arguments required'}`)
  } catch (error) {
    console.log('Profile discovery source: none')
    console.log('Public request attempted: no')
    console.log('Provider: facebook-native-fetch')
    console.log('HTTP: unavailable')
    console.log('Blocker: runtime_exception')
    console.log(`Login/access restriction: no`)
    console.log(`Effective decision: unavailable`)
    console.log(`Reason: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  }
}
