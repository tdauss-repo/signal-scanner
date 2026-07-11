import type { EvidenceConfidence } from '../types/audit'

export const evidenceConfidenceOptions: Array<{
  value: EvidenceConfidence
  label: string
  customerLabel: string
}> = [
  {
    value: 'owner_confirmed',
    label: 'Owner confirmed',
    customerLabel: 'Owner confirmed',
  },
  {
    value: 'public_page_observed',
    label: 'Public page observed',
    customerLabel: 'Observed on public page',
  },
  {
    value: 'scanner_detected_public_page',
    label: 'Scanner-detected from public page',
    customerLabel: 'Detected from public page scan',
  },
  {
    value: 'operator_provided_page_text',
    label: 'Operator-provided page text',
    customerLabel: 'Operator-provided public page text',
  },
  {
    value: 'public_search_observed',
    label: 'Public search observed',
    customerLabel: 'Observed in public search results',
  },
  {
    value: 'ai_answer_response',
    label: 'AI answer-platform response',
    customerLabel: 'Based on AI answer test',
  },
  {
    value: 'derived_readiness_signal',
    label: 'Derived readiness signal',
    customerLabel: 'Derived from scanner readiness signals',
  },
  {
    value: 'manual_needs_confirmation',
    label: 'Manual note / needs confirmation',
    customerLabel: 'Needs confirmation',
  },
]

export const evidenceConfidenceLabel = (
  confidence: EvidenceConfidence | undefined,
) =>
  evidenceConfidenceOptions.find((option) => option.value === confidence)?.label ??
  'Manual note / needs confirmation'

export const customerEvidenceConfidenceLabel = (
  confidence: EvidenceConfidence | undefined,
) =>
  evidenceConfidenceOptions.find((option) => option.value === confidence)
    ?.customerLabel ?? 'Needs confirmation'
