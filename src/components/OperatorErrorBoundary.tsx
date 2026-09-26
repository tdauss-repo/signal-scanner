import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props { children: ReactNode }
interface State { failed: boolean }

/** Last-resort operator-safe surface. Domain errors are handled at their source. */
export class OperatorErrorBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State { return { failed: true } }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Found Local operator UI failed to render.', error, info)
  }

  render() {
    if (this.state.failed) return <main className="operator-failure" role="alert">
      <h1>Found Local could not display this workspace.</h1>
      <p>Captured browser data has not been intentionally cleared. Reload the application, then review the saved workspace or export before retrying the scan.</p>
      <button type="button" onClick={() => window.location.reload()}>Reload Found Local</button>
    </main>
    return this.props.children
  }
}
