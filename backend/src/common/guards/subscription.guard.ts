import { Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { prisma } from '../database/prisma.service';
import { ForbiddenException, HttpException } from '../exceptions/http.exception';
import { SubscriptionRequiredException, QuotaExceededException } from '../exceptions/business.exception';
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL!);
export type SubscriptionPlan = 'free' | 'starter' | 'professional' | 'enterprise';
export type FeatureFlag = string;

interface SubscriptionFeature {
  name: string;
  plans: SubscriptionPlan[];
  quota?: number;
  quotaPeriod?: 'daily' | 'weekly' | 'monthly';
}

interface SubscriptionCheckOptions {
  feature?: string;
  plans?: SubscriptionPlan[];
  checkQuota?: boolean;
  incrementUsage?: boolean;
  customQuotaKey?: string;
}

export class SubscriptionGuard {
  private static readonly planHierarchy: Record<SubscriptionPlan, number> = { free: 1, starter: 2, professional: 3, enterprise: 4 };
  private static readonly features: Record<string, SubscriptionFeature> = {
    'ai_classification': { name: 'AI Task Classification', plans: ['starter', 'professional', 'enterprise'], quota: 1000, quotaPeriod: 'monthly' },
    'ai_chat': { name: 'AI Chat Assistant', plans: ['professional', 'enterprise'], quota: 500, quotaPeriod: 'monthly' },
    'auto_scheduling': { name: 'Auto Scheduling', plans: ['starter', 'professional', 'enterprise'], quota: 100, quotaPeriod: 'daily' },
    'team_collaboration': { name: 'Team Collaboration', plans: ['professional', 'enterprise'] },
    'advanced_analytics': { name: 'Advanced Analytics', plans: ['professional', 'enterprise'] },
    'api_access': { name: 'API Access', plans: ['professional', 'enterprise'], quota: 10000, quotaPeriod: 'monthly' },
    'custom_integrations': { name: 'Custom Integrations', plans: ['enterprise'] },
    'priority_support': { name: 'Priority Support', plans: ['professional', 'enterprise'] },
    'white_label': { name: 'White Label', plans: ['enterprise'] }
  };

  static create(options: SubscriptionCheckOptions = {}) {
    return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
      try {
        const companyId = (req as any).company?.id || req.user?.companyId;
        if (!companyId) { throw new ForbiddenException('Company context required'); }
        const subscription = await this.getSubscription(companyId);
        if (!subscription || !subscription.isActive) {
          throw new SubscriptionRequiredException('any feature', 'active subscription');
        }
        if (subscription.expiresAt && new Date(subscription.expiresAt) < new Date()) {
          throw new SubscriptionRequiredException('this feature', 'renewed subscription');
        }
        if (options.plans && options.plans.length > 0) {
          const hasPlan = options.plans.includes(subscription.plan as SubscriptionPlan);
          if (!hasPlan) {
            throw new SubscriptionRequiredException('this feature', options.plans.join(' or '));
          }
        }
        if (options.feature) {
          await this.checkFeatureAccess(subscription.plan as SubscriptionPlan, options.feature, companyId, options);
        }
        (req as any).subscription = { id: subscription.id, plan: subscription.plan, features: await this.getEnabledFeatures(subscription.plan as SubscriptionPlan), usage: await this.getUsageStats(companyId) };
        next();
      } catch (error) {
        next(error);
      }
    };
  }

  private static async getSubscription(companyId: string) {
    const cacheKey = `subscription:${companyId}`;
    const cached = await redis.get(cacheKey);
    if (cached) { return JSON.parse(cached); }
    const subscription = await prisma.subscription.findFirst({ where: { companyId, isActive: true }, select: { id: true, plan: true, isActive: true, isTrial: true, expiresAt: true, features: true, quotaOverrides: true } });
    if (subscription) { await redis.setex(cacheKey, 300, JSON.stringify(subscription)); }
    return subscription;
  }

  private static async checkFeatureAccess(plan: SubscriptionPlan, feature: string, companyId: string, options: SubscriptionCheckOptions): Promise<void> {
    const featureConfig = this.features[feature];
    if (!featureConfig) { throw new HttpException(500, `Unknown feature: ${feature}`); }
    if (!featureConfig.plans.includes(plan)) {
      const minPlan = featureConfig.plans[0];
      throw new SubscriptionRequiredException(featureConfig.name, minPlan);
    }
    if (options.checkQuota && featureConfig.quota) {
      const usage = await this.getFeatureUsage(companyId, feature, featureConfig.quotaPeriod!);
      if (usage >= featureConfig.quota) {
        throw new QuotaExceededException(featureConfig.name, featureConfig.quota, usage);
      }
      if (options.incrementUsage) {
        await this.incrementFeatureUsage(companyId, feature, featureConfig.quotaPeriod!);
      }
    }
  }

  private static async getFeatureUsage(companyId: string, feature: string, period: 'daily' | 'weekly' | 'monthly'): Promise<number> {
    const key = this.getUsageKey(companyId, feature, period);
    const usage = await redis.get(key);
    return parseInt(usage || '0', 10);
  }

  private static async incrementFeatureUsage(companyId: string, feature: string, period: 'daily' | 'weekly' | 'monthly'): Promise<number> {
    const key = this.getUsageKey(companyId, feature, period);
    const ttl = this.getTTL(period);
    const pipeline = redis.pipeline();
    pipeline.incr(key);
    pipeline.expire(key, ttl);
    const results = await pipeline.exec();
    return results?.[0]?.[1] as number || 1;
  }

  private static getUsageKey(companyId: string, feature: string, period: 'daily' | 'weekly' | 'monthly'): string {
    const date = new Date();
    let suffix: string;
    switch (period) {
      case 'daily':
        suffix = date.toISOString().split('T')[0];
        break;
      case 'weekly':
        const week = this.getWeekNumber(date);
        suffix = `${date.getFullYear()}-W${week}`;
        break;
      case 'monthly':
        suffix = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
        break;
    }
    return `usage:${companyId}:${feature}:${suffix}`;
  }

  private static getTTL(period: 'daily' | 'weekly' | 'monthly'): number {
    switch (period) {
      case 'daily': return 86400;
      case 'weekly': return 604800;
      case 'monthly': return 2592000;
    }
  }

  private static getWeekNumber(date: Date): number {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  }

  static async getEnabledFeatures(plan: SubscriptionPlan): Promise<string[]> {
    return Object.entries(this.features).filter(([_, config]) => config.plans.includes(plan)).map(([feature]) => feature);
  }

  static async getUsageStats(companyId: string): Promise<Record<string, any>> {
    const stats: Record<string, any> = {};
    for (const [feature, config] of Object.entries(this.features)) {
      if (config.quota) {
        stats[feature] = { used: await this.getFeatureUsage(companyId, feature, config.quotaPeriod!), limit: config.quota, period: config.quotaPeriod };
      }
    }
    return stats;
  }

  static hasMinimumPlan(minimumPlan: SubscriptionPlan) {
    return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
      try {
        const userPlan = (req as any).subscription?.plan;
        if (!userPlan) { throw new ForbiddenException('Subscription not found'); }
        const userLevel = this.planHierarchy[userPlan as SubscriptionPlan] || 0;
        const requiredLevel = this.planHierarchy[minimumPlan];
        if (userLevel < requiredLevel) {
          throw new SubscriptionRequiredException('this feature', `${minimumPlan} or higher`);
        }
        next();
      } catch (error) {
        next(error);
      }
    };
  }

  static async checkFeatureFlag(companyId: string, flag: FeatureFlag): Promise<boolean> {
    const key = `feature_flag:${companyId}:${flag}`;
    const enabled = await redis.get(key);
    if (enabled !== null) { return enabled === '1'; }
    const globalKey = `feature_flag:global:${flag}`;
    const globalEnabled = await redis.get(globalKey);
    return globalEnabled === '1';
  }

  static requireFeatureFlag(flag: FeatureFlag) {
    return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
      try {
        const companyId = (req as any).company?.id || req.user?.companyId;
        if (!companyId) { throw new ForbiddenException('Company context required'); }
        const enabled = await this.checkFeatureFlag(companyId, flag);
        if (!enabled) { throw new ForbiddenException(`Feature '${flag}' is not enabled`); }
        next();
      } catch (error) { next(error); }
    };
  }
}

export const requireSubscription = SubscriptionGuard.create();
export const requirePaidPlan = SubscriptionGuard.create({ plans: ['starter', 'professional', 'enterprise'] });
export const requireProPlan = SubscriptionGuard.create({ plans: ['professional', 'enterprise'] });
export const requireEnterprisePlan = SubscriptionGuard.create({ plans: ['enterprise'] });

