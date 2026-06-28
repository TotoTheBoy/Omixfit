import { Component, type ReactNode } from "react";

// If the WebGL spine experience throws (old GPU, context loss, …), silently
// render the static landing instead of an error screen.
export class SpineBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(e: unknown) {
    console.warn("[omix] spine → static fallback:", e);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
