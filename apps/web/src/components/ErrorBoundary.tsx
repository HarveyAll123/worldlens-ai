import { Component, type ReactNode } from 'react';

/** Keeps a failure in one region (e.g. the globe) from blanking the whole app. */
export class ErrorBoundary extends Component<
  { children: ReactNode; label: string; fallback?: ReactNode },
  { error: Error | null }
> {
  override state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  override componentDidCatch(error: Error) {
    console.error(`[${this.props.label}]`, error);
  }
  override render() {
    if (this.state.error)
      return (
        this.props.fallback ?? (
          <div role="alert" className="glass m-3 rounded-xl p-3 text-[12.5px] text-rose-100">
            {this.props.label} hit an error and was paused. The rest of WorldLens keeps working.
            <button
              type="button"
              className="ml-2 underline"
              onClick={() => this.setState({ error: null })}
            >
              Retry
            </button>
          </div>
        )
      );
    return this.props.children;
  }
}
