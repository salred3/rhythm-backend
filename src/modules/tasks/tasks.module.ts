import { Module } from '@nestjs/common';
import { TasksController } from './tasks.controller';
import { ProjectsController } from './projects.controller';
import { TasksService } from './tasks.service';
import { ProjectsService } from './projects.service';
import { SubtasksService } from './subtasks.service';
import { MatrixService } from './matrix.service';
import { TasksRepository } from './repositories/tasks.repository';
import { ProjectsRepository } from './repositories/projects.repository';
import { DatabaseModule } from '../../common/database/database.module';
import { SettingsModule } from '../settings/settings.module';
import { EventEmitterModule } from '@nestjs/event-emitter';

@Module({
  imports: [
    DatabaseModule,
    SettingsModule,
    EventEmitterModule.forRoot(),
  ],
  controllers: [TasksController, ProjectsController],
  providers: [
    TasksService,
    ProjectsService,
    SubtasksService,
    MatrixService,
    TasksRepository,
    ProjectsRepository,
  ],
  exports: [
    TasksService,
    ProjectsService,
    SubtasksService,
    MatrixService,
  ],
})
export class TasksModule {}
