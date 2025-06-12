import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { Project, ProjectStatus } from '../entities/project.entity';
import { Prisma } from '@prisma/client';

@Injectable()
export class ProjectsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: Prisma.ProjectCreateInput): Promise<Project> {
    return this.prisma.project.create({
      data,
      include: {
        tasks: {
          where: { deletedAt: null },
        },
        members: true,
      },
    });
  }

  async findAll(
    companyId: string,
    includeArchived = false
  ): Promise<Project[]> {
    const where: Prisma.ProjectWhereInput = {
      companyId,
      deletedAt: null,
    };

    if (!includeArchived) {
      where.status = { not: ProjectStatus.ARCHIVED } as any;
    }

    return this.prisma.project.findMany({
      where,
      include: {
        tasks: {
          where: { deletedAt: null },
          select: {
            id: true,
            status: true,
            priority: true,
          },
        },
        members: {
          include: {
            user: true,
          },
        },
        _count: {
          select: {
            tasks: {
              where: { deletedAt: null },
            },
          },
        },
      },
      orderBy: [
        { status: 'asc' },
        { updatedAt: 'desc' },
      ],
    });
  }

  async findById(id: string): Promise<Project | null> {
    return this.prisma.project.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      include: {
        tasks: {
          where: { deletedAt: null },
          orderBy: { priority: 'desc' },
        },
        members: {
          include: {
            user: true,
          },
        },
        milestones: {
          orderBy: { dueDate: 'asc' },
        },
        _count: {
          select: {
            tasks: {
              where: { deletedAt: null },
            },
          },
        },
      },
    });
  }

  async update(id: string, data: Prisma.ProjectUpdateInput): Promise<Project> {
    return this.prisma.project.update({
      where: { id },
      data: {
        ...data,
        updatedAt: new Date(),
      },
      include: {
        tasks: {
          where: { deletedAt: null },
        },
        members: true,
      },
    });
  }

  async getWithTaskCounts(projectId: string): Promise<any> {
    const result = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: {
        _count: {
          select: {
            tasks: {
              where: { deletedAt: null },
            },
          },
        },
        tasks: {
          where: { deletedAt: null },
          select: {
            status: true,
          },
        },
      },
    });

    if (!result) return null;

    const statusCounts = (result.tasks as any).reduce((acc: any, task: any) => {
      acc[task.status] = (acc[task.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      ...result,
      taskCounts: {
        total: (result as any)._count.tasks,
        byStatus: statusCounts,
      },
    };
  }

  async getActivitySummary(
    projectId: string,
    days = 7
  ): Promise<any> {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const activities = await this.prisma.task.groupBy({
      by: ['status'],
      where: {
        projectId,
        updatedAt: { gte: since },
      },
      _count: true,
    });

    return {
      projectId,
      period: `${days} days`,
      activities,
    };
  }
}
