// dto/classify.dto.ts
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

// dto/chat.dto.ts
export interface ChatDto {
  taskId: string;
  conversationId?: string;
  message: string;
  model?: string;
  maxTokens?: number;
  enableActions?: boolean;
  codeFormatting?: boolean;
  context?: {
    recentChanges?: string[];
    relatedTasks?: string[];
  };
}

// dto/usage-limits.dto.ts
export interface UsageLimitsDto {
  daily?: {
    classification?: number;
    chat?: number;
    total?: number;
  };
  weekly?: {
    classification?: number;
    chat?: number;
    total?: number;
  };
  monthly?: {
    classification?: number;
    chat?: number;
    total?: number;
  };
  costLimit?: number;
  warningThreshold?: number;
}

// dto/ai-settings.dto.ts
export interface AISettingsDto {
  provider?: 'openai' | 'anthropic' | 'cohere';
  defaultModel?: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  enableAutoClassification?: boolean;
  enableChatSuggestions?: boolean;
  customModels?: Array<{
    id: string;
    name: string;
    provider: string;
    endpoint?: string;
  }>;
}

// Export all DTOs
export * from './classify.dto';
export * from './chat.dto';
export * from './usage-limits.dto';
