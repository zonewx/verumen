import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error.message, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className={`flex h-screen items-center justify-center bg-zinc-900 text-white`}>
        <div className={`max-w-md mx-4 p-8 rounded-2xl border text-center bg-zinc-800 border-zinc-700 shadow-xl`}>
          <div className="text-5xl mb-4">⚠️</div>
          <h2 className="text-xl font-bold mb-2">Something went wrong</h2>
          <p className={`text-sm mb-6 text-zinc-400`}>
            An unexpected error occurred. Refreshing the page usually fixes it.
          </p>
          {this.state.error?.message && (
            <p className={`text-xs font-mono mb-6 px-3 py-2 rounded-lg bg-zinc-900 text-zinc-400`}>
              {this.state.error.message}
            </p>
          )}
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-2.5 bg-sky-600 hover:bg-sky-500 text-white font-semibold rounded-xl transition">
            Refresh page
          </button>
        </div>
      </div>
    );
  }
}
