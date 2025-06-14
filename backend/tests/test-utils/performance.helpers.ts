export class PerformanceTracker {
  private metrics: Map<string, number[]> = new Map();

  start(label: string): () => void {
    const startTime = performance.now();
    return () => {
      const duration = performance.now() - startTime;
      const existing = this.metrics.get(label) || [];
      this.metrics.set(label, [...existing, duration]);
    };
  }

  getMetrics(label: string) {
    const durations = this.metrics.get(label) || [];
    if (durations.length === 0) return null;
    const sorted = [...durations].sort((a, b) => a - b);
    return {
      min: sorted[0],
      max: sorted[sorted.length - 1],
      avg: durations.reduce((a, b) => a + b, 0) / durations.length,
      p50: sorted[Math.floor(sorted.length * 0.5)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)],
      count: durations.length,
    };
  }

  report() {
    const report: Record<string, any> = {};
    for (const [label] of this.metrics) {
      report[label] = this.getMetrics(label);
    }
    return report;
  }
}
