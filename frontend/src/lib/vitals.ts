import { type Metric, onCLS, onINP, onLCP } from "web-vitals";
import { trackVital } from "./analytics";

// Core Web Vitals capture. Vercel Speed Insights (in main.tsx) already sends CWV
// to Vercel's dashboard; this ALSO reports each sample to (a) PostHog, so vitals
// sit alongside product events, and (b) a lightweight backend beacon that keeps a
// rolling average the in-app Metrics widget can read without scraping any vendor
// API. Best-effort throughout — a metrics beacon must never affect the page.
export function initVitals(): void {
  const report = (metric: Metric) => {
    trackVital(metric.name, metric.value);
    try {
      const blob = new Blob(
        [JSON.stringify({ name: metric.name, value: metric.value })],
        { type: "application/json" }
      );
      navigator.sendBeacon?.("/api/vitals", blob);
    } catch {
      // sendBeacon can throw (e.g. blocked); ignore — it's only a metric.
    }
  };
  onLCP(report);
  onINP(report);
  onCLS(report);
}
