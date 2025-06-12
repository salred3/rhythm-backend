import { Controller, Get, Post, Put, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { ProjectsService } from './projects.service';
import { AuthGuard } from '../auth/guards/auth.guard';
import { CompanyGuard } from '../../common/guards/company.guard';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { Project } from './entities/project.entity';

@ApiTags('projects')
@Controller('projects')
@UseGuards(AuthGuard, CompanyGuard)
@ApiBearerAuth()
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get()
  @ApiOperation({ summary: 'List all projects' })
  @ApiResponse({ status: 200, description: 'Returns list of projects' })
  async listProjects(
    @Request() req,
    @Query('includeArchived') includeArchived?: boolean,
  ): Promise<Project[]> {
    return this.projectsService.findAll(req.company.id, includeArchived);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new project' })
  @ApiResponse({ status: 201, description: 'Project created successfully' })
  async createProject(
    @Request() req,
    @Body() createProjectDto: CreateProjectDto,
  ): Promise<Project> {
    return this.projectsService.create({
      ...createProjectDto,
      companyId: req.company.id,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get project details' })
  @ApiResponse({ status: 200, description: 'Returns project details' })
  async getProject(
    @Request() req,
    @Param('id') id: string,
  ): Promise<Project> {
    return this.projectsService.findOne(id, req.company.id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update project' })
  @ApiResponse({ status: 200, description: 'Project updated successfully' })
  async updateProject(
    @Request() req,
    @Param('id') id: string,
    @Body() updateProjectDto: UpdateProjectDto,
  ): Promise<Project> {
    return this.projectsService.update(id, req.company.id, updateProjectDto);
  }

  @Post(':id/archive')
  @ApiOperation({ summary: 'Archive project and its tasks' })
  @ApiResponse({ status: 200, description: 'Project archived successfully' })
  async archiveProject(
    @Request() req,
    @Param('id') id: string,
  ): Promise<Project> {
    return this.projectsService.archive(id, req.company.id);
  }

  @Get(':id/progress')
  @ApiOperation({ summary: 'Calculate project progress' })
  @ApiResponse({ status: 200, description: 'Returns project progress percentage' })
  async getProjectProgress(
    @Request() req,
    @Param('id') id: string,
  ): Promise<{ progress: number }> {
    await this.projectsService.findOne(id, req.company.id);
    const progress = await this.projectsService.calculateProgress(id);
    return { progress };
  }
}
