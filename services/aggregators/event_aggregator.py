class EventAggregator:
    """Aggregates event related metrics."""

    def __init__(self, events=None):
        self.events = list(events) if events else []

    def collect(self):
        total_events = len(self.events)
        return {
            'total_events': total_events,
        }
