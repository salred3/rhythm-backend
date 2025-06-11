# rhythm-backend

This project provides backend utilities, aggregators, and analytical services for the Rhythm AI-driven flow management platform.

## Core Modules

### Dashboard Aggregators
The backend provides specialized aggregator modules consumed by the `DashboardService`:

- **`timer.aggregator.ts`** – Gathers and aggregates time-tracking data from timer events, providing real-time insights into active work sessions and productivity patterns.

- **`deadline.aggregator.ts`** – Analyzes upcoming deadlines across tasks and projects, categorizing them by urgency (7 days, 3 days, 1 day) and detecting potential bottlenecks.

- **`conflict.detector.ts`** – Intelligently detects and reports scheduling conflicts, especially important in unified calendar mode where cross-company conflicts can occur.

### Analytics Module
The analytics service provides computational utilities for deeper insights:

#### Core Functions
- **`calculateTotal`** – Sums values in an array for aggregate metrics
- **`calculateAverage`** – Computes averages for performance tracking
- **`calculateFlowMetrics`** – Analyzes flow state progression and productivity patterns

#### Advanced Analysis
- **`TrendAnalyzer`** – Class for calculating moving averages and trend detection
  - Identifies productivity patterns over time
  - Detects flow state improvements
  - Provides predictive insights for optimal scheduling

- **`MetricsCalculator`** – Comprehensive metrics computation including:
  - Impact/Effort/Timeline weighted scoring
  - Priority calculations based on user preferences
  - Cross-company resource utilization

## Architecture

```
backend/src/
├── modules/
│   ├── dashboard/
│   │   ├── dashboard.service.ts
│   │   ├── analytics.service.ts
│   │   ├── metrics.calculator.ts
│   │   └── aggregators/
│   │       ├── timer.aggregator.ts
│   │       ├── deadline.aggregator.ts
│   │       └── conflict.detector.ts
│   └── analytics/
│       ├── analytics.service.ts
│       ├── events.collector.ts
│       └── metrics.aggregator.ts
```

## Usage

### Dashboard Service Integration
```typescript
import { TimerAggregator } from './aggregators/timer.aggregator';
import { DeadlineAggregator } from './aggregators/deadline.aggregator';
import { ConflictDetector } from './aggregators/conflict.detector';

class DashboardService {
  async getAggregatedData(userId: string, companyId?: string) {
    const [timers, deadlines, conflicts] = await Promise.all([
      this.timerAggregator.getActiveTimers(userId),
      this.deadlineAggregator.getUpcoming(userId, companyId),
      this.conflictDetector.detectConflicts(userId)
    ]);
    
    return { timers, deadlines, conflicts };
  }
}
```

### Analytics Calculations
```typescript
import { TrendAnalyzer, calculateAverage } from './analytics';

const analyzer = new TrendAnalyzer();
const productivityTrend = analyzer.calculateMovingAverage(
  dailyProductivityScores,
  7 // 7-day moving average
);

const avgFlowTime = calculateAverage(flowStateDurations);
```

## Key Features

- **Real-time Aggregation**: Optimized for live dashboard updates
- **Cross-Company Intelligence**: Detects patterns and conflicts across multiple companies
- **Flow State Analytics**: Tracks and analyzes productivity patterns
- **Scalable Architecture**: Designed to handle high-frequency timer events and complex calculations
- **TypeScript Native**: Full type safety and IntelliSense support

## Dependencies

- Node.js 18+
- TypeScript 5.0+
- BullMQ (for background job processing)
- Redis (for caching aggregated data)

## Performance Considerations

- Aggregators use Redis caching to minimize database queries
- Background workers handle heavy computations
- Optimized queries for real-time dashboard updates
- Efficient conflict detection algorithms for calendar scheduling