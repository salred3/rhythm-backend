import { Request, Response, Router } from 'express';
import { AnalyticsService } from './analytics.service';
import { authGuard } from '../auth/guards/auth.guard';
import { rolesGuard } from '../auth/guards/roles.guard';
import { validateDto } from '../../common/middleware/validation.middleware';
import { AnalyticsQueryDto, ExportOptionsDto } from './dto';

export class AnalyticsController {
  public router: Router = Router();
  private analyticsService: AnalyticsService;

  constructor(analyticsService: AnalyticsService) {
    this.analyticsService = analyticsService;
    this.initializeRoutes();
  }

  private initializeRoutes() {
    // All routes require authentication
    this.router.use(authGuard);

    // Personal analytics endpoints
    this.router.get('/productivity', 
      validateDto(AnalyticsQueryDto, 'query'),
      this.getProductivityStats
    );
    
    this.router.get('/estimation',
      validateDto(AnalyticsQueryDto, 'query'), 
      this.getEstimationAccuracy
    );
    
    this.router.get('/patterns',
      validateDto(AnalyticsQueryDto, 'query'),
      this.getWorkPatterns
    );

    // Company analytics (requires appropriate role)
    this.router.get('/company/:id',
      rolesGuard('admin'),
      validateDto(AnalyticsQueryDto, 'query'),
      this.getCompanyAnalytics
    );

    // Export functionality
    this.router.post('/export',
      validateDto(ExportOptionsDto),
      this.exportAnalytics
    );
  }

  private getProductivityStats = async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.id;
      const query = req.query as unknown as AnalyticsQueryDto;
      
      const stats = await this.analyticsService.getProductivityStats(userId, query);
      
      res.json({
        success: true,
        data: stats,
        metadata: {
          dateRange: query.dateRange,
          groupBy: query.groupBy
        }
      });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: 'Failed to fetch productivity stats' 
      });
    }
  };

  private getEstimationAccuracy = async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.id;
      const query = req.query as unknown as AnalyticsQueryDto;
      
      const accuracy = await this.analyticsService.getEstimationAccuracy(userId, query);
      
      res.json({
        success: true,
        data: accuracy
      });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: 'Failed to fetch estimation accuracy' 
      });
    }
  };

  private getWorkPatterns = async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.id;
      const query = req.query as unknown as AnalyticsQueryDto;
      
      const patterns = await this.analyticsService.analyzeWorkPatterns(userId, query);
      
      res.json({
        success: true,
        data: patterns
      });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: 'Failed to analyze work patterns' 
      });
    }
  };

  private getCompanyAnalytics = async (req: Request, res: Response) => {
    try {
      const companyId = req.params.id;
      const query = req.query as unknown as AnalyticsQueryDto;
      
      const analytics = await this.analyticsService.getCompanyAnalytics(companyId, query);
      
      res.json({
        success: true,
        data: analytics
      });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: 'Failed to fetch company analytics' 
      });
    }
  };

  private exportAnalytics = async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.id;
      const options = req.body as ExportOptionsDto;
      
      const exportData = await this.analyticsService.exportAnalytics(userId, options);
      
      // Set appropriate headers based on format
      if (options.format === 'csv') {
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=analytics.csv');
      } else if (options.format === 'pdf') {
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename=analytics.pdf');
      } else {
        res.setHeader('Content-Type', 'application/json');
      }
      
      res.send(exportData);
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: 'Failed to export analytics' 
      });
    }
  };
}
