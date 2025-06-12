export enum TaskStatus {
  TODO = 'TODO',
  IN_PROGRESS = 'IN_PROGRESS',
  DONE = 'DONE',
  BLOCKED = 'BLOCKED',
}

export interface MatrixValues {
  impact: number;
  effort: number;
  timelineDays: number;
  isLocked: boolean;
}

export interface User {
  id: string;
  email: string;
  name: string;
  companyId: string;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: number;
  matrixValues: MatrixValues;
  
  projectId?: string;
  project?: Project;
  
  parentId?: string;
  parent?: Task;
  subtasks?: Task[];
  
  assigneeId?: string;
  assignee?: User;
  
  companyId: string;
  userId: string;
  
  dueDate?: Date;
  completedAt?: Date;
  
  estimatedTimeMinutes?: number;
  actualTimeMinutes?: number;
  
  tags?: string[];
  progress?: number;
  
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
  archivedAt?: Date;
}
