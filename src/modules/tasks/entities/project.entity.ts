import { Task, User } from "./task.entity";
export enum ProjectStatus {
  ACTIVE = 'ACTIVE',
  ON_HOLD = 'ON_HOLD',
  COMPLETED = 'COMPLETED',
  ARCHIVED = 'ARCHIVED',
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  status: ProjectStatus;
  progress: number;
  
  companyId: string;
  ownerId: string;
  
  startDate?: Date;
  endDate?: Date;
  
  color?: string;
  icon?: string;
  
  tasks?: Task[];
  members?: ProjectMember[];
  milestones?: Milestone[];
  
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
  archivedAt?: Date;
}

export interface ProjectMember {
  id: string;
  projectId: string;
  userId: string;
  user?: User;
  role: string;
  joinedAt: Date;
}

export interface Milestone {
  id: string;
  projectId: string;
  name: string;
  description?: string;
  dueDate: Date;
  isCompleted: boolean;
  completedAt?: Date;
}
