import { Request, Response, Router } from 'express';
import { AIService } from './ai.service';
import { ClassificationService } from './classification.service';
import { ChatService } from './chat.service';
import { UsageService } from './usage.service';
import { authGuard } from '../auth/guards/auth.guard';
import { ClassifyDto, BulkClassifyDto, ChatDto, AISettingsDto } from './dto';

export class AIController {
  public router: Router = Router();
  private aiService = new AIService();
  private classificationService = new ClassificationService(this.aiService);
  private chatService = new ChatService(this.aiService);
  private usageService = new UsageService();

  constructor() {
    this.initializeRoutes();
  }

  private initializeRoutes() {
    // All routes require authentication
    this.router.use(authGuard);
    
    // Classification endpoints
    this.router.post('/classify', this.classifyTask);
    this.router.post('/bulk-classify', this.bulkClassifyTasks);
    
    // Chat endpoints
    this.router.post('/chat', this.chatInContext);
    
    // Usage and settings
    this.router.get('/usage', this.getUsageStats);
    this.router.put('/settings', this.updateAISettings);
  }

  private classifyTask = async (req: Request, res: Response) => {
    try {
      const dto: ClassifyDto = req.body;
      const userId = (req as any).user.id;
      const companyId = req.headers['x-company-id'] as string;
      
      // Check usage limits before processing
      const canProceed = await this.usageService.checkLimit(companyId, 'classification');
      if (!canProceed) {
        return res.status(429).json({ 
          error: 'AI usage limit exceeded for this period' 
        });
      }
      
      const result = await this.classificationService.classifyTask(dto, userId, companyId);
      
      // Track usage
      await this.usageService.trackUsage(companyId, 'classification', result.tokensUsed);
      
      res.json(result);
    } catch (error) {
      console.error('Classification error:', error);
      res.status(500).json({ 
        error: 'Failed to classify task',
        message: (error as Error).message 
      });
    }
  };

  private bulkClassifyTasks = async (req: Request, res: Response) => {
    try {
      const dto: BulkClassifyDto = req.body;
      const userId = (req as any).user.id;
      const companyId = req.headers['x-company-id'] as string;
      
      // Check usage limits
      const canProceed = await this.usageService.checkLimit(
        companyId, 
        'classification', 
        dto.taskIds.length
      );
      
      if (!canProceed) {
        return res.status(429).json({ 
          error: 'AI usage limit exceeded for bulk operation' 
        });
      }
      
      const results = await this.classificationService.bulkClassify(dto, userId, companyId);
      
      // Track total usage
      const totalTokens = results.reduce((sum, r) => sum + r.tokensUsed, 0);
      await this.usageService.trackUsage(companyId, 'classification', totalTokens);
      
      res.json(results);
    } catch (error) {
      console.error('Bulk classification error:', error);
      res.status(500).json({ 
        error: 'Failed to classify tasks',
        message: (error as Error).message 
      });
    }
  };

  private chatInContext = async (req: Request, res: Response) => {
    try {
      const dto: ChatDto = req.body;
      const userId = (req as any).user.id;
      const companyId = req.headers['x-company-id'] as string;
      
      // Check chat usage limits
      const canProceed = await this.usageService.checkLimit(companyId, 'chat');
      if (!canProceed) {
        return res.status(429).json({ 
          error: 'AI chat limit exceeded for this period' 
        });
      }
      
      // Set up SSE for streaming
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      
      const result = await this.chatService.chatInContext(
        dto,
        userId,
        companyId,
        (chunk: string) => {
          res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
        }
      );
      
      // Send final message with metadata
      res.write(`data: ${JSON.stringify({ 
        done: true, 
        messageId: result.messageId,
        tokensUsed: result.tokensUsed 
      })}\n\n`);
      
      // Track usage
      await this.usageService.trackUsage(companyId, 'chat', result.tokensUsed);
      
      res.end();
    } catch (error) {
      console.error('Chat error:', error);
      res.write(`data: ${JSON.stringify({ 
        error: 'Failed to process chat',
        message: (error as Error).message 
      })}\n\n`);
      res.end();
    }
  };

  private getUsageStats = async (req: Request, res: Response) => {
    try {
      const companyId = req.headers['x-company-id'] as string;
      const period = req.query.period as 'daily' | 'weekly' | 'monthly' || 'monthly';
      
      const stats = await this.usageService.getUsageStats(companyId, period);
      res.json(stats);
    } catch (error) {
      console.error('Usage stats error:', error);
      res.status(500).json({ 
        error: 'Failed to fetch usage statistics',
        message: (error as Error).message 
      });
    }
  };

  private updateAISettings = async (req: Request, res: Response) => {
    try {
      const dto: AISettingsDto = req.body;
      const companyId = req.headers['x-company-id'] as string;
      
      const updated = await this.aiService.updateSettings(companyId, dto);
      res.json(updated);
    } catch (error) {
      console.error('Settings update error:', error);
      res.status(500).json({ 
        error: 'Failed to update AI settings',
        message: (error as Error).message 
      });
    }
  };
}
