import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

/** Last line of defence: a render-time crash shows a recoverable screen instead of a blank page. */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("Unhandled UI error", error, info.componentStack);
  }

  override render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="mx-auto mt-24 max-w-md px-4 text-center text-ink">
        <h1 className="text-lg font-semibold">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted">The page hit an unexpected error. Your data is safe on the server.</p>
        <button
          type="button"
          className="mt-4 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-ink"
          onClick={() => window.location.reload()}
        >
          Reload
        </button>
      </div>
    );
  }
}
