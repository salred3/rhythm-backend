from .analytics_service import AnalyticsService


class DashboardService:
    """Provides summary metrics for dashboard controllers."""

    def __init__(self, analytics_service: AnalyticsService, aggregators=None):
        self.analytics_service = analytics_service
        self.aggregators = list(aggregators) if aggregators else []
        for agg in self.aggregators:
            self.analytics_service.register_aggregator(agg)

    def get_summary_metrics(self):
        """Return combined metrics from all aggregators."""
        return self.analytics_service.gather_metrics()

    def get_user_metrics(self):
        """Return user related metrics if a UserAggregator is present."""
        for agg in self.aggregators:
            if agg.__class__.__name__ == 'UserAggregator':
                return agg.collect()
        return {}

    def get_event_metrics(self):
        """Return event related metrics if an EventAggregator is present."""
        for agg in self.aggregators:
            if agg.__class__.__name__ == 'EventAggregator':
                return agg.collect()
        return {}
