export interface ClassifyDto {
  taskId: string;
  title: string;
  description?: string;
  tags?: string[];
  projectContext?: {
    name: string;
    description?: string;
    type?: string;
  };
  userRole?: string;
  model?: string; // Allow model override
  includeReasoning?: boolean;
}

export interface BulkClassifyDto {
  taskIds: string[];
  tasks?: Array<{
    id: string;
    title: string;
    description?: string;
    tags?: string[];
    projectContext?: any;
    userRole?: string;
  }>;
  model?: string;
  includeReasoning?: boolean;
}
