import { Component, type ErrorInfo, type ReactNode } from "react";

import { StatusPage } from "./StatusPage";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  failed: boolean;
}

/** Keeps a render-time failure from blanking the shell. The 500 page owns
 *  recovery; this boundary only decides that it is needed. */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Route render failed", error, info);
  }

  render() {
    if (this.state.failed) return <StatusPage variant="500" />;
    return this.props.children;
  }
}
