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
