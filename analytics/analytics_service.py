from .metrics_calculator import MetricsCalculator


class AnalyticsService:
    """High-level service providing analytics functionality."""

    def __init__(self, calculator=None):
        self.calculator = calculator or MetricsCalculator()

    def get_usage_stats(self, events):
        """Return aggregated usage statistics for the provided events."""
        return self.calculator.calculate_usage(events)

    def get_conflict_report(self, events):
        """Return a conflict report for the provided events."""
        return self.calculator.calculate_conflicts(events)

