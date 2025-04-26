// src/components/ErrorBoundary/CartErrorBoundary.tsx
import React from "react";
import { ErrorBoundary } from "react-error-boundary";

function ErrorFallback({ error, resetErrorBoundary }: { error: Error, resetErrorBoundary: () => void }) {
  return (
    <div role="alert" style={{ padding: "20px", margin: "20px", border: "1px solid #ff0000", borderRadius: "4px", backgroundColor: "#fff1f1" }}>
      <h3 style={{ color: "#cc0000", marginBottom: "10px" }}>Something went wrong:</h3>
      <pre style={{ padding: "10px", backgroundColor: "#fff", border: "1px solid #ddd", borderRadius: "4px", overflow: "auto" }}>
        {error.message}
      </pre>
      <button onClick={resetErrorBoundary} style={{ marginTop: "10px", padding: "8px 16px", backgroundColor: "#cc0000", color: "white", border: "none", borderRadius: "4px", cursor: "pointer" }}>
        Try again
      </button>
    </div>
  );
}

export function CartErrorBoundary({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary
      FallbackComponent={ErrorFallback}
      onError={(error, errorInfo) => {
        console.error("Cart Error:", error);
        // You could integrate an error reporting service here.
      }}
      onReset={() => {
        // Optionally reset any state, or reload the page:
        window.location.reload();
      }}
    >
      {children}
    </ErrorBoundary>
  );
}
