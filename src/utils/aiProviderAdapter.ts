import type { AIAnswerObservation, AIAnswerPlatform } from '../types/audit'

/**
 * Future controlled scans must arrive through an explicit adapter. No adapter
 * is registered in this slice, so the UI must never imply an automated run.
 */
export interface AIProviderAdapter {
  platform: AIAnswerPlatform
  runControlledScan(input: {
    prompt: string
    locationContext?: string
  }): Promise<AIAnswerObservation>
}

export const controlledScanConnection = () => ({
  connected: false,
  label: 'Automation not connected',
} as const)
