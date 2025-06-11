export interface TimeEvent {
  start: Date;
  end: Date;
}

export class TimerAggregator {
  /**
   * Aggregate the total duration from a list of events.
   */
  aggregateTimeData(events: TimeEvent[]): number {
    return events.reduce((sum, event) => {
      return sum + (event.end.getTime() - event.start.getTime());
    }, 0);
  }
}
