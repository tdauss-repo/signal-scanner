import type { FindingIntelligence } from '../types/findingIntelligence'

type Guidance = Pick<FindingIntelligence, 'customer' | 'delivery' | 'verification'>
/** Versioned deterministic guidance. Detection must supply real evidence separately.
 * Hosting migration/custom development is NOT implicitly included in Starter.
 */
export const findingKnowledge = {
  secureConnection: {
    customer: {
      title: 'Secure website connection',
      found: 'The recorded website checks show a problem with the secure connection or the path from the ordinary address to the secure address.',
      why: 'Visitors, browsers and search platforms expect a usable secure website. This is a connection foundation, not a promise of better rankings.',
      recommendation: 'Restore a usable HTTPS connection and make the secure version the primary website address.',
      canRemediate: true,
      confirmation: 'Confirm the intended website address and authorize hosting/site access and the agreed scope before any change.',
      evidenceSummary: '',
      verificationSummary: 'We will check that the secure site works, the ordinary address leads to it, and important pages load correctly after the change.',
    },
    delivery: {
      technicalChange: 'Correct TLS and secure-address configuration after confirming the specific cause.',
      steps: ['Inspect hosting TLS configuration and certificate hostname, chain and expiry; do not assume the cause.', 'Back up current configuration. Check site URLs (including WordPress URLs only if WordPress is actually used).', 'Check HTTP-to-HTTPS redirect and canonical URLs. Correct only the agreed settings; avoid redirect loops.', 'Review critical mixed content and internal links after the secure page works. Restore the backup if checks fail.'],
      access: ['Authorized hosting/TLS administration', 'Authorized CMS/site configuration access if needed'],
      customerInput: ['Intended canonical domain', 'Change approval and acceptable maintenance window'],
      dependencies: ['Confirm root cause and access first', 'Migration, renewal charges and custom development require separate scope approval'],
      scope: 'starter',
    },
    verification: {
      expectedState: 'A usable secure homepage with the intended secure canonical address.',
      method: 'Re-fetch HTTP and HTTPS with certificate validation, inspect redirects/canonical output, review rendered critical content, then rescan.',
      criteria: ['Valid TLS for the intended hostname', 'Usable HTTPS response', 'HTTP redirects to the intended HTTPS URL', 'Canonical and internal links use intended secure addresses', 'No critical mixed-content failure in a browser'],
    },
  },
  duplicateDescription: {
    customer: {
      title: 'Homepage search description',
      found: 'The captured homepage contains more than one search-description element.',
      why: 'Search platforms should receive one clear intentional description of the page. They may still choose their own search-result wording.',
      recommendation: 'Remove conflicting descriptions and retain one intentional homepage description.',
      canRemediate: true,
      confirmation: 'Confirm which description should remain and approve site/theme/plugin access before changes.',
      evidenceSummary: '',
      verificationSummary: 'We will check the page again to confirm that only the agreed description remains, without the unwanted text.',
    },
    delivery: {
      technicalChange: 'Remove duplicate meta-description output at its source; do not add another tag.',
      steps: ['Identify which theme, plugin or framework emits each tag.', 'Back up the relevant settings/template. Preserve the owner-approved intentional description.', 'Disable/remove only the conflicting output, including placeholder text if actually observed. Clear applicable page caches.', 'Compare source and rendered output; restore prior settings/template if unrelated metadata regresses.'],
      access: ['Authorized CMS/SEO settings or site-template access'],
      customerInput: ['Approved homepage description', 'Permission for the specific settings/template change'],
      dependencies: ['Identify tag emitters before editing', 'Custom theme development is separate from a simple settings correction'],
      scope: 'starter',
    },
    verification: {
      expectedState: 'Exactly one intentional homepage meta description; unwanted placeholder absent.',
      method: 'Refetch and render the homepage after cache clearing; inspect all meta-description elements and rescan.',
      criteria: ['Exactly one meta-description element in source and rendered DOM', 'Retained content equals the approved description', 'Unwanted placeholder absent', 'No unrelated title/canonical regression'],
    },
  },
} satisfies Record<string, Guidance>
