import { Injectable, NotFoundException } from '@nestjs/common';
import { ProjectsRepository } from './repositories/projects.repository';
import { TasksRepository } from './repositories/tasks.repository';
import { Project, ProjectStatus } from './entities/project.entity';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';

@Injectable()
export class ProjectsService {
  constructor(
    private readonly projectsRepository: ProjectsRepository,
    private readonly tasksRepository: TasksRepository,
  ) {}

  async create(data: CreateProjectDto & { companyId: string }): Promise<Project> {
    // Apply template if specified
    let projectData = { ...data };
    if (data.templateId) {
      const template = await this.getTemplate(data.templateId);
      projectData = { ...template, ...data };
    }

    const project = await this.projectsRepository.create({
      ...projectData,
      status: ProjectStatus.ACTIVE,
      progress: 0,
    });

    // Create tasks from template if applicable
    if (data.templateId && projectData.templateTasks) {
      await this.createTasksFromTemplate(project.id, projectData.templateTasks);
    }

    return project;
  }

  async findAll(companyId: string, includeArchived = false): Promise<Project[]> {
    return this.projectsRepository.findAll(companyId, includeArchived);
  }

  async findOne(id: string, companyId: string): Promise<Project> {
    const project = await this.projectsRepository.findById(id);
    
    if (!project || project.companyId !== companyId) {
      throw new NotFoundException('Project not found');
    }

    return project;
  }

  async update(
    id: string, 
    companyId: string, 
    updateData: UpdateProjectDto
  ): Promise<Project> {
    await this.findOne(id, companyId);
    return this.projectsRepository.update(id, updateData);
  }

  async archive(id: string, companyId: string): Promise<Project> {
    const project = await this.findOne(id, companyId);
    
    // Archive all associated tasks
    await this.tasksRepository.archiveByProjectId(id);
    
    return this.projectsRepository.update(id, {
      status: ProjectStatus.ARCHIVED,
      archivedAt: new Date(),
    });
  }

  async calculateProgress(projectId: string): Promise<number> {
    const tasks = await this.tasksRepository.findByProjectId(projectId);
    
    if (tasks.length === 0) return 0;
    
    const completedTasks = tasks.filter(t => t.status === 'DONE').length;
    return Math.round((completedTasks / tasks.length) * 100);
  }

  async updateProgress(projectId: string): Promise<void> {
    const progress = await this.calculateProgress(projectId);
    await this.projectsRepository.update(projectId, { progress });
  }

  private async getTemplate(templateId: string): Promise<any> {
    // Fetch from templates table or predefined templates
    const templates = {
      'product-launch': {
        name: 'Product Launch',
        description: 'Template for launching a new product',
        templateTasks: [
          { title: 'Market Research', matrixValues: { impact: 5, effort: 3, timelineDays: 14 } },
          { title: 'Product Development', matrixValues: { impact: 5, effort: 5, timelineDays: 30 } },
          { title: 'Marketing Campaign', matrixValues: { impact: 4, effort: 4, timelineDays: 21 } },
          { title: 'Launch Event', matrixValues: { impact: 3, effort: 3, timelineDays: 7 } },
        ],
      },
      'fundraising': {
        name: 'Fundraising Round',
        description: 'Template for raising investment',
        templateTasks: [
          { title: 'Pitch Deck Creation', matrixValues: { impact: 5, effort: 4, timelineDays: 7 } },
          { title: 'Investor Research', matrixValues: { impact: 4, effort: 3, timelineDays: 14 } },
          { title: 'Financial Projections', matrixValues: { impact: 5, effort: 5, timelineDays: 10 } },
          { title: 'Due Diligence Prep', matrixValues: { impact: 4, effort: 4, timelineDays: 21 } },
        ],
      },
    };

    return templates[templateId] || null;
  }

  private async createTasksFromTemplate(projectId: string, templateTasks: any[]): Promise<void> {
    for (const taskTemplate of templateTasks) {
      await this.tasksRepository.create({
        ...taskTemplate,
        projectId,
      });
    }
  }
}
