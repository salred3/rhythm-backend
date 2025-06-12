import { UsageLimitsDto } from './dto';

export interface UsageStats {
  period: 'daily' | 'weekly' | 'monthly';
  current: {
    classification: number;
    chat: number;
    total: number;
    cost: number;
  };
  limits: {
    classification: number;
    chat: number;
    total: number;
    cost: number;
  };
  history: Array<{
    date: Date;
    classification: number;
    chat: number;
    total: number;
    cost: number;
  }>;
  projectedCost: number;
  warningThreshold: number;
}

export interface CompanyUsageLimits {
  daily: UsageLimits;
  weekly: UsageLimits;
  monthly: UsageLimits;
  costLimit: number;
  warningThreshold: number;
}

interface UsageLimits {
  classification: number;
  chat: number;
  total: number;
}

interface UsageRecord {
  companyId: string;
  date: Date;
  type: 'classification' | 'chat';
  tokens: number;
  cost: number;
}

export class UsageService {
  // In-memory usage tracking (should be moved to database)
  private usageRecords: UsageRecord[] = [];
  private limitsCache: Map<string, { limits: CompanyUsageLimits; timestamp: number }> = new Map();
  
  private defaultLimits: CompanyUsageLimits = {
    daily: {
      classification: 1000,
      chat: 500,
      total: 1500,
    },
    weekly: {
      classification: 5000,
      chat: 2500,
      total: 7500,
    },
    monthly: {
      classification: 20000,
      chat: 10000,
      total: 30000,
    },
    costLimit: 100, // $100/month
    warningThreshold: 0.8, // Warn at 80% usage
  };

  constructor() {
    // Clean up old records periodically
    setInterval(() => this.cleanupOldRecords(), 24 * 3600 * 1000); // Daily
  }

  async trackUsage(
    companyId: string,
    type: 'classification' | 'chat',
    tokensUsed: number
  ): Promise<void> {
    const cost = this.estimateCost(type, tokensUsed);
    
    const record: UsageRecord = {
      companyId,
      date: new Date(),
      type,
      tokens: tokensUsed,
      cost,
    };
    
    this.usageRecords.push(record);
    
    // TODO: Persist to database
    // await prisma.aiUsage.create({
    //   data: record
    // });
    
    // Check for limit warnings
    await this.checkAndNotifyLimits(companyId);
  }

  async checkLimit(
    companyId: string,
    type: 'classification' | 'chat',
    count: number = 1
  ): Promise<boolean> {
    const limits = await this.getCompanyLimits(companyId);
    const usage = await this.getCurrentUsage(companyId);
    
    // Estimate tokens for the operation (rough estimate)
    const estimatedTokens = count * 200; // Average tokens per operation
    
    // Check daily limits
    if (usage.daily[type] + estimatedTokens > limits.daily[type]) {
      return false;
    }
    
    if (usage.daily.total + estimatedTokens > limits.daily.total) {
      return false;
    }
    
    // Check cost limits
    const estimatedCost = this.estimateCost(type, estimatedTokens);
    if (usage.monthly.cost + estimatedCost >= limits.costLimit) {
      return false;
    }
    
    return true;
  }

  async getUsageStats(
    companyId: string,
    period: 'daily' | 'weekly' | 'monthly'
  ): Promise<UsageStats> {
    const limits = await this.getCompanyLimits(companyId);
    const usage = await this.getCurrentUsage(companyId);
    const history = await this.getUsageHistory(companyId, period);
    
    const current = usage[period];
    const limit = limits[period];
    
    return {
      period,
      current: {
        classification: current.classification || 0,
        chat: current.chat || 0,
        total: current.total || 0,
        cost: current.cost || 0,
      },
      limits: {
        ...limit,
        cost: limits.costLimit,
      },
      history,
      projectedCost: this.projectMonthlyCost(usage, new Date().getDate()),
      warningThreshold: limits.warningThreshold,
    };
  }

  async updateCompanyLimits(
    companyId: string,
    limits: UsageLimitsDto
  ): Promise<CompanyUsageLimits> {
    const current = await this.getCompanyLimits(companyId);
    const updated = {
      ...current,
      ...limits,
    };
    
    // Update cache
    this.limitsCache.set(companyId, {
      limits: updated,
      timestamp: Date.now(),
    });
    
    // TODO: Persist to database
    // await prisma.companyUsageLimits.upsert({
    //   where: { companyId },
    //   create: { companyId, ...updated },
    //   update: updated,
    // });
    
    return updated;
  }

  private async getCompanyLimits(companyId: string): Promise<CompanyUsageLimits> {
    // Check cache first
    const cached = this.limitsCache.get(companyId);
    if (cached && Date.now() - cached.timestamp < 3600000) { // 1 hour cache
      return cached.limits;
    }
    
    // TODO: Fetch from database
    // const limits = await prisma.companyUsageLimits.findUnique({
    //   where: { companyId }
    // });
    
    return this.defaultLimits;
  }

  private async getCurrentUsage(companyId: string): Promise<{
    daily: any;
    weekly: any;
    monthly: any;
  }> {
    const now = new Date();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(dayStart);
    weekStart.setDate(dayStart.getDate() - dayStart.getDay());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    
    // Calculate usage from in-memory records (or database in production)
    const companyRecords = this.usageRecords.filter(r => r.companyId === companyId);
    
    const daily = this.aggregateUsage(
      companyRecords.filter(r => r.date >= dayStart)
    );
    
    const weekly = this.aggregateUsage(
      companyRecords.filter(r => r.date >= weekStart)
    );
    
    const monthly = this.aggregateUsage(
      companyRecords.filter(r => r.date >= monthStart)
    );
    
    return { daily, weekly, monthly };
  }

  private aggregateUsage(records: UsageRecord[]): any {
    const result = {
      classification: 0,
      chat: 0,
      total: 0,
      cost: 0,
    };
    
    for (const record of records) {
      result[record.type] += record.tokens;
      result.total += record.tokens;
      result.cost += record.cost;
    }
    
    return result;
  }

  private estimateCost(type: 'classification' | 'chat', tokens: number): number {
    // Rough cost estimates per 1K tokens
    const rates = {
      classification: 0.03, // $0.03 per 1K tokens
      chat: 0.06, // $0.06 per 1K tokens
    };
    
    return (tokens / 1000) * rates[type];
  }

  private async getUsageHistory(
    companyId: string,
    period: 'daily' | 'weekly' | 'monthly'
  ): Promise<Array<any>> {
    // TODO: Implement history fetching from database
    // This would query historical usage data
    return [];
  }

  private projectMonthlyCost(usage: any, currentDayOfMonth: number): number {
    if (currentDayOfMonth === 0) return 0;
    const dailyAverage = usage.monthly.cost / currentDayOfMonth;
    return dailyAverage * 30;
  }

  private async checkAndNotifyLimits(companyId: string): Promise<void> {
    const limits = await this.getCompanyLimits(companyId);
    const usage = await this.getCurrentUsage(companyId);
    
    // Check if any limits are approaching threshold
    const warnings: string[] = [];
    
    for (const period of ['daily', 'weekly', 'monthly'] as const) {
      const periodUsage = usage[period];
      const periodLimits = limits[period];
      
      for (const type of ['classification', 'chat', 'total'] as const) {
        const used = periodUsage[type] || 0;
        const limit = periodLimits[type];
        
        if (used / limit >= limits.warningThreshold) {
          warnings.push(`${period} ${type} usage at ${Math.round((used / limit) * 100)}%`);
        }
      }
    }
    
    // Check cost threshold
    if (usage.monthly.cost / limits.costLimit >= limits.warningThreshold) {
      warnings.push(`Monthly cost at ${usage.monthly.cost.toFixed(2)} (${Math.round((usage.monthly.cost / limits.costLimit) * 100)}%)`);
    }
    
    if (warnings.length > 0) {
      // TODO: Send notifications
      console.warn(`Usage warnings for company ${companyId}:`, warnings);
      // await notificationService.sendUsageWarning(companyId, warnings);
    }
  }

  private cleanupOldRecords(): void {
    // Keep only last 35 days of records
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 35);
    
    this.usageRecords = this.usageRecords.filter(r => r.date > cutoffDate);
  }
}

