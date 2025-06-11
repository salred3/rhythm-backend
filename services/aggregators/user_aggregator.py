class UserAggregator:
    """Aggregates user related metrics."""

    def __init__(self, users=None):
        # In a real implementation this might query a repository or database
        self.users = list(users) if users else []

    def collect(self):
        total_users = len(self.users)
        active_users = len([u for u in self.users if u.get('active')])
        return {
            'total_users': total_users,
            'active_users': active_users,
        }
