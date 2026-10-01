import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Loading } from "@/components/loading";
import React, { Suspense, lazy } from "react";

const DashboardPage = lazy(() => import("@/pages/dashboard"));

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6 text-center" dir="rtl">
          <div className="max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl">
            <h2 className="text-xl font-bold text-rose-400 mb-2">حدث خطأ أثناء تحميل اللوحة</h2>
            <p className="text-xs text-slate-400 mb-4">{this.state.error?.message || "حدث خطأ غير متوقع"}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-semibold transition"
            >
              إعادة التحميل
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function Router() {
  return (
    <Suspense fallback={<Loading />}>
      <Switch>
        <Route path="/dashboard" component={DashboardPage} />
        <Route path="/:rest*" component={DashboardPage} />
        <Route component={DashboardPage} />
      </Switch>
    </Suspense>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
