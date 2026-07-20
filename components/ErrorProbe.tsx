'use client'
import { Component, type ReactNode } from 'react'

// Temporary diagnostic boundary — reports which subtree threw so we can localise
// the React error #185 render loop without a reproducible local repro. Remove once
// the root cause is found and fixed.
export default class ErrorProbe extends Component<{ label: string; children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error: Error) {
    try {
      navigator.sendBeacon('/api/telemetry/client-error', new Blob([JSON.stringify({
        message: `[probe:${this.props.label}] ${error.message}`,
        path: location.pathname,
      })], { type: 'application/json' }))
    } catch {}
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 16, fontSize: 13, color: 'var(--text-secondary)' }}>
          Loop detected in: {this.props.label}. <button className="btn-primary" onClick={() => this.setState({ hasError: false })}>Retry</button>
        </div>
      )
    }
    return this.props.children
  }
}
