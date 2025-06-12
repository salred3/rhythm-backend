import { AIService } from './ai.service';
import { ClassifyDto, BulkClassifyDto } from './dto';
import { classificationPrompt } from './prompts/classification.prompt';
import crypto from 'crypto';

export interface ClassificationResult {
  taskId: string;
  impact: 1 | 2 | 3 | 4 | 5;
  effort: 1 | 2 | 3 | 4 | 5;
  timeline: 'immediate' | 'soon' | 'later' | 'someday';
  confidence: number;
  reasoning?: string;
  tokensUsed: number;
  cached?: boolean;
}

export class ClassificationService {
  private classificationCache: Map<string, { result: any; timestamp: number }> = new Map();
  private cacheMaxAge = 86400000; // 24 hours in milliseconds
  private cacheMaxSize = 1000; // Maximum number of cached items
  
  constructor(private aiService: AIService) {
    // Clean up old cache entries periodically
    setInterval(() => this.cleanupCache(), 3600000); // Run every hour
  }

  async classifyTask(
    dto: ClassifyDto,
    userId: string,
    companyId: string
  ): Promise<ClassificationResult> {
    // Check cache first
    const cacheKey = this.generateCacheKey(dto);
    const cached = await this.getCachedClassification(cacheKey);
    if (cached) {
      return { ...cached, cached: true };
    }

    // Get company AI settings
    const settings = await this.aiService.getCompanySettings(companyId);
    
    // Determine model based on task complexity
    const complexity = this.assessTaskComplexity(dto);
    const model = dto.model || await this.aiService.selectOptimalModel('classification', complexity);

    // Build context-aware prompt
    const prompt = await classificationPrompt.build({
      taskTitle: dto.title,
      taskDescription: dto.description,
      taskTags: dto.tags,
      projectContext: dto.projectContext,
      userRole: dto.userRole,
      companyContext: await this.getCompanyContext(companyId),
      includeReasoning: dto.includeReasoning || false,
    });

    try {
      const result = await this.aiService.complete(prompt, {
        provider: settings.provider,
        model,
        temperature: 0.3, // Lower temperature for consistent classification
        maxTokens: dto.includeReasoning ? 500 : 200,
        systemPrompt: classificationPrompt.getSystemPrompt(),
      });

      const classification = this.parseClassificationResponse(result.content);
      
      const finalResult: ClassificationResult = {
        taskId: dto.taskId,
        ...classification,
        tokensUsed: result.tokensUsed,
        cached: false,
      };

      // Cache the result
      await this.cacheClassification(cacheKey, finalResult);

      // Store in database for learning
      await this.storeClassificationResult(finalResult, userId, companyId);

      return finalResult;
    } catch (error) {
      console.error('Classification failed:', error);
      
      // Return sensible defaults on error
      return {
        taskId: dto.taskId,
        impact: 3,
        effort: 3,
        timeline: 'soon',
        confidence: 0,
        reasoning: 'Classification failed, using defaults',
        tokensUsed: 0,
        cached: false,
      };
    }
  }

  async bulkClassify(
    dto: BulkClassifyDto,
    userId: string,
    companyId: string
  ): Promise<ClassificationResult[]> {
    // Process in batches to avoid overwhelming the API
    const batchSize = 10;
    const results: ClassificationResult[] = [];
    
    for (let i = 0; i < dto.taskIds.length; i += batchSize) {
      const batch = dto.taskIds.slice(i, i + batchSize);
      
      // Process batch in parallel
      const batchPromises = batch.map(async (taskId) => {
        const taskData = dto.tasks?.find(t => t.id === taskId);
        if (!taskData) {
          throw new Error(`Task data not found for ID: ${taskId}`);
        }
        
        return this.classifyTask(
          {
            taskId,
            title: taskData.title,
            description: taskData.description,
            tags: taskData.tags,
            projectContext: taskData.projectContext,
            userRole: taskData.userRole,
            model: dto.model,
            includeReasoning: dto.includeReasoning,
          },
          userId,
          companyId
        );
      });
      
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
      
      // Rate limiting between batches
      if (i + batchSize < dto.taskIds.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    return results;
  }

  private parseClassificationResponse(response: string): Omit<ClassificationResult, 'taskId' | 'tokensUsed' | 'cached'> {
    try {
      // Try to parse as JSON first
      const parsed = JSON.parse(response);
      return {
        impact: Math.min(5, Math.max(1, parsed.impact)),
        effort: Math.min(5, Math.max(1, parsed.effort)),
        timeline: this.validateTimeline(parsed.timeline),
        confidence: Math.min(1, Math.max(0, parsed.confidence)),
        reasoning: parsed.reasoning,
      };
    } catch {
      // Fallback to regex parsing
      const impactMatch = response.match(/impact[:\s]+(\d)/i);
      const effortMatch = response.match(/effort[:\s]+(\d)/i);
      const timelineMatch = response.match(/timeline[:\s]+(immediate|soon|later|someday)/i);
      const confidenceMatch = response.match(/confidence[:\s]+([\d.]+)/i);
      
      return {
        impact: impactMatch ? parseInt(impactMatch[1]) as any : 3,
        effort: effortMatch ? parseInt(effortMatch[1]) as any : 3,
        timeline: timelineMatch ? this.validateTimeline(timelineMatch[1]) : 'soon',
        confidence: confidenceMatch ? parseFloat(confidenceMatch[1]) : 0.7,
      };
    }
  }

  private validateTimeline(value: string): 'immediate' | 'soon' | 'later' | 'someday' {
    const valid = ['immediate', 'soon', 'later', 'someday'];
    return valid.includes(value.toLowerCase()) ? value.toLowerCase() as any : 'soon';
  }

  private assessTaskComplexity(dto: ClassifyDto): 'low' | 'medium' | 'high' {
    const descriptionLength = (dto.description || '').length;
    const hasProjectContext = !!dto.projectContext;
    const tagCount = (dto.tags || []).length;
    
    if (descriptionLength > 500 || (hasProjectContext && tagCount > 5)) {
      return 'high';
    } else if (descriptionLength > 200 || tagCount > 3) {
      return 'medium';
    }
    return 'low';
  }

  private generateCacheKey(dto: ClassifyDto): string {
    const content = `${dto.title}|${dto.description}|${(dto.tags || []).join(',')}`;
    return `classification:${crypto.createHash('md5').update(content).digest('hex')}`;
  }

  private async getCachedClassification(key: string): Promise<Omit<ClassificationResult, 'cached'> | null> {
    const cached = this.classificationCache.get(key);
    if (!cached) return null;
    
    // Check if cache is still valid
    if (Date.now() - cached.timestamp > this.cacheMaxAge) {
      this.classificationCache.delete(key);
      return null;
    }
    
    return cached.result;
  }

  private async cacheClassification(key: string, result: ClassificationResult): Promise<void> {
    const { cached, ...toCache } = result;
    
    // Implement simple LRU by removing oldest entries if cache is full
    if (this.classificationCache.size >= this.cacheMaxSize) {
      const oldestKey = Array.from(this.classificationCache.entries())
        .sort(([, a], [, b]) => a.timestamp - b.timestamp)[0][0];
      this.classificationCache.delete(oldestKey);
    }
    
    this.classificationCache.set(key, {
      result: toCache,
      timestamp: Date.now(),
    });
  }

  private cleanupCache(): void {
    const now = Date.now();
    for (const [key, value] of this.classificationCache.entries()) {
      if (now - value.timestamp > this.cacheMaxAge) {
        this.classificationCache.delete(key);
      }
    }
  }

  private async getCompanyContext(companyId: string): Promise<string> {
    // TODO: Fetch actual company context from database
    // This could include company size, industry, typical task patterns, etc.
    return 'Technology startup focused on productivity tools';
  }

  private async storeClassificationResult(
    result: ClassificationResult,
    userId: string,
    companyId: string
  ): Promise<void> {
    // TODO: Store in database for ML training data
    // await prisma.classificationResult.create({
    //   data: {
    //     taskId: result.taskId,
    //     impact: result.impact,
    //     effort: result.effort,
    //     timeline: result.timeline,
    //     confidence: result.confidence,
    //     reasoning: result.reasoning,
    //     tokensUsed: result.tokensUsed,
    //     userId,
    //     companyId,
    //   }
    // });
  }
}

