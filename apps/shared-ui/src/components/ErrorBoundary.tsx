import React from 'react';

interface Props { children: React.ReactNode; }
interface State { hasError: boolean; error?: Error; }

export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="card p-8 text-center">
          <p className="text-lg font-semibold mb-2" style={{color: '#ef4444'}}>Something went wrong</p>
          <p className="text-sm mb-4 font-mono text-[var(--muted-foreground)]">{this.state.error?.message}</p>
          <button onClick={() => this.setState({ hasError: false })} className="btn-primary">
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
