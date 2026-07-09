import type { CheckStatus, TrafficStatus } from '../types/audit'

interface StatusBadgeProps {
  status: TrafficStatus | CheckStatus | 'High' | 'Medium' | 'Watch'
}

const statusClass = (status: StatusBadgeProps['status']) => {
  if (status === 'Green' || status === 'pass') return 'status status-green'
  if (status === 'Yellow' || status === 'partial' || status === 'Medium') {
    return 'status status-yellow'
  }
  if (status === 'Red' || status === 'fail' || status === 'High') {
    return 'status status-red'
  }
  return 'status status-gray'
}

const label = (status: StatusBadgeProps['status']) => {
  if (status === 'pass') return 'Green'
  if (status === 'partial') return 'Yellow'
  if (status === 'fail') return 'Red'
  if (status === 'unknown') return 'Gray'
  return status
}

export function StatusBadge({ status }: StatusBadgeProps) {
  return <span className={statusClass(status)}>{label(status)}</span>
}
