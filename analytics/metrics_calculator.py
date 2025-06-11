class MetricsCalculator:
    """Utility class for computing analytics metrics."""

    @staticmethod
    def calculate_usage(events):
        """Calculate usage statistics from a list of events.

        Args:
            events (list[dict]): List of event dictionaries.

        Returns:
            dict: Aggregated usage metrics.
        """
        usage = {}
        for event in events:
            event_type = event.get("type")
            usage[event_type] = usage.get(event_type, 0) + 1
        return usage

    @staticmethod
    def calculate_conflicts(events):
        """Generate a conflict report from a list of events.

        Args:
            events (list[dict]): List of event dictionaries.

        Returns:
            dict: Conflict metrics summarizing conflicting events.
        """
        conflicts = {}
        for event in events:
            if event.get("conflict"):
                key = event.get("conflict")
                conflicts[key] = conflicts.get(key, 0) + 1
        return conflicts

