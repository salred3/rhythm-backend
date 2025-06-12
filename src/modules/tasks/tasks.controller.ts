import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { TasksService } from './tasks.service';
import { SubtasksService } from './subtasks.service';
import { MatrixService } from './matrix.service';
import { AuthGuard } from '../auth/guards/auth.guard';
import { CompanyGuard } from '../../common/guards/company.guard';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { MatrixValuesDto } from './dto/matrix-values.dto';
import { QueryTasksDto } from './dto/query-tasks.dto';
import { Task } from './entities/task.entity';

@ApiTags('tasks')
@Controller('tasks')
@UseGuards(AuthGuard, CompanyGuard)
@ApiBearerAuth()
export class TasksController {
  constructor(
    private readonly tasksService: TasksService,
    private readonly subtasksService: SubtasksService,
    private readonly matrixService: MatrixService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List tasks with filters' })
  @ApiResponse({ status: 200, description: 'Returns filtered tasks' })
  async listTasks(
    @Request() req,
    @Query() query: QueryTasksDto,
  ): Promise<{ tasks: Task[]; total: number; page: number; pageSize: number }> {
    const { tasks, total } = await this.tasksService.findAll({
      userId: req.user.id,
      companyId: req.company.id,
      ...query,
    });

    return {
      tasks,
      total,
      page: query.page || 1,
      pageSize: query.pageSize || 20,
    };
  }

  @Post()
  @ApiOperation({ summary: 'Create a new task' })
  @ApiResponse({ status: 201, description: 'Task created successfully' })
  async createTask(
    @Request() req,
    @Body() createTaskDto: CreateTaskDto,
  ): Promise<Task> {
    return this.tasksService.create({
      ...createTaskDto,
      userId: req.user.id,
      companyId: req.company.id,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get task details' })
  @ApiResponse({ status: 200, description: 'Returns task details' })
  async getTask(
    @Request() req,
    @Param('id') id: string,
  ): Promise<Task> {
    return this.tasksService.findOne(id, req.company.id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update task' })
  @ApiResponse({ status: 200, description: 'Task updated successfully' })
  async updateTask(
    @Request() req,
    @Param('id') id: string,
    @Body() updateTaskDto: UpdateTaskDto,
  ): Promise<Task> {
    return this.tasksService.update(id, req.company.id, updateTaskDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete task' })
  @ApiResponse({ status: 200, description: 'Task deleted successfully' })
  async deleteTask(
    @Request() req,
    @Param('id') id: string,
  ): Promise<{ success: boolean }> {
    await this.tasksService.remove(id, req.company.id);
    return { success: true };
  }

  @Post(':id/subtasks')
  @ApiOperation({ summary: 'Create subtask' })
  @ApiResponse({ status: 201, description: 'Subtask created successfully' })
  async createSubtask(
    @Request() req,
    @Param('id') parentId: string,
    @Body() createTaskDto: CreateTaskDto,
  ): Promise<Task> {
    return this.subtasksService.createSubtask(parentId, {
      ...createTaskDto,
      userId: req.user.id,
      companyId: req.company.id,
    });
  }

  @Put(':id/matrix')
  @ApiOperation({ summary: 'Update task matrix values' })
  @ApiResponse({ status: 200, description: 'Matrix values updated' })
  async updateMatrixValues(
    @Request() req,
    @Param('id') id: string,
    @Body() matrixValuesDto: MatrixValuesDto,
  ): Promise<Task> {
    return this.matrixService.updateTaskMatrix(id, req.company.id, matrixValuesDto);
  }
}
