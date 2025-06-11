class AnalyticsService:
    """Collects metrics from registered aggregators."""

    def __init__(self, aggregators=None):
        self.aggregators = list(aggregators) if aggregators else []

    def register_aggregator(self, aggregator):
        """Register an aggregator that provides metrics."""
        self.aggregators.append(aggregator)

    def gather_metrics(self):
        """Gather metrics from all registered aggregators."""
        metrics = {}
        for aggregator in self.aggregators:
            try:
                data = aggregator.collect()
                if isinstance(data, dict):
                    metrics.update(data)
            except Exception:
                # In real code you might log this event.
                pass
        return metrics
