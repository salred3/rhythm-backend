import unittest
from analytics.analytics_service import AnalyticsService


class TestAnalyticsService(unittest.TestCase):
    def setUp(self):
        self.service = AnalyticsService()
        self.sample_events = [
            {"type": "play", "conflict": None},
            {"type": "pause", "conflict": None},
            {"type": "play", "conflict": "double"},
            {"type": "play", "conflict": "double"},
        ]

    def test_usage_stats(self):
        stats = self.service.get_usage_stats(self.sample_events)
        self.assertEqual(stats.get("play"), 3)
        self.assertEqual(stats.get("pause"), 1)

    def test_conflict_report(self):
        report = self.service.get_conflict_report(self.sample_events)
        self.assertEqual(report.get("double"), 2)


if __name__ == "__main__":
    unittest.main()

