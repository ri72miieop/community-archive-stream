import { Component, type ReactNode } from "react"

export default class CompanionBoundary extends Component<
  { children: ReactNode; openSettings: () => void },
  { failed: boolean }
> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: Error) {
    // Local diagnostics only; do not send reading context to telemetry.
    console.error("Community Archive companion could not render", error)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <main className="companion panel-body" role="alert">
        <span className="eyebrow">COMMUNITY ARCHIVE</span>
        <h1>Let’s try that again.</h1>
        <p className="section-caption">
          This view could not be displayed. Reopen it or go to your account
          settings.
        </p>
        <div className="button-row">
          <button
            className="primary"
            onClick={() => this.setState({ failed: false })}>
            Reopen companion
          </button>
          <button className="secondary" onClick={this.props.openSettings}>
            Account settings
          </button>
        </div>
      </main>
    )
  }
}
