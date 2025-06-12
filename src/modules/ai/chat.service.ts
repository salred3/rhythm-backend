import { AIService } from './ai.service';
import { ChatDto } from './dto';
import { chatPrompt } from './prompts/chat.prompt';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  metadata?: {
    model?: string;
    tokensUsed?: number;
    suggestedActions?: SuggestedAction[];
  };
}

export interface SuggestedAction {
  type: 'update_task' | 'create_subtask' | 'schedule' | 'assign' | 'tag';
  label: string;
  data: any;
}

export interface ChatResult {
  messageId: string;
  content: string;
  suggestedActions?: SuggestedAction[];
  tokensUsed: number;
}

export class ChatService {
  // In-memory conversation storage (temporary - should be moved to database)
  private conversations: Map<string, ChatMessage[]> = new Map();
  private maxConversationAge = 30 * 24 * 3600 * 1000; // 30 days
  
  constructor(private aiService: AIService) {
    // Clean up old conversations periodically
    setInterval(() => this.cleanupConversations(), 24 * 3600 * 1000); // Daily
  }

  async chatInContext(
    dto: ChatDto,
    userId: string,
    companyId: string,
    onToken?: (chunk: string) => void
  ): Promise<ChatResult> {
    // Get conversation history
    const history = await this.getConversationHistory(dto.conversationId || dto.taskId);
    
    // Get task context
    const taskContext = await this.getTaskContext(dto.taskId);
    
    // Get company AI settings
    const settings = await this.aiService.getCompanySettings(companyId);
    
    // Determine model based on conversation complexity
    const model = dto.model || await this.aiService.selectOptimalModel('chat', 'medium');

    // Build context-aware prompt
    const prompt = chatPrompt.build({
      message: dto.message,
      conversationHistory: history,
      taskContext,
      enableActions: dto.enableActions !== false,
      codeFormattingEnabled: dto.codeFormatting !== false,
    });

    try {
      const result = await this.aiService.complete(prompt, {
        provider: settings.provider,
        model,
        temperature: 0.7,
        maxTokens: dto.maxTokens || 1500,
        systemPrompt: chatPrompt.getSystemPrompt(taskContext),
        stream: !!onToken,
        onToken,
      });

      // Parse suggested actions if present
      const { content, suggestedActions } = this.parseResponse(result.content);
      
      // Generate message ID
      const messageId = this.generateMessageId();
      
      // Store message in conversation history
      await this.storeMessage({
        conversationId: dto.conversationId || dto.taskId,
        message: {
          id: messageId,
          role: 'user',
          content: dto.message,
          timestamp: new Date(),
        },
      });
      
      await this.storeMessage({
        conversationId: dto.conversationId || dto.taskId,
        message: {
          id: this.generateMessageId(),
          role: 'assistant',
          content,
          timestamp: new Date(),
          metadata: {
            model,
            tokensUsed: result.tokensUsed,
            suggestedActions,
          },
        },
      });

      return {
        messageId,
        content,
        suggestedActions,
        tokensUsed: result.tokensUsed,
      };
    } catch (error) {
      console.error('Chat error:', error);
      throw error;
    }
  }

  async getConversationHistory(conversationId: string): Promise<ChatMessage[]> {
    // TODO: In production, fetch from database
    // const messages = await prisma.chatMessage.findMany({
    //   where: { conversationId },
    //   orderBy: { timestamp: 'asc' },
    //   take: 20,
    // });
    
    // For now, use in-memory storage
    const messages = this.conversations.get(conversationId) || [];
    return messages.slice(-20); // Return last 20 messages
  }

  private async storeMessage({
    conversationId,
    message,
  }: {
    conversationId: string;
    message: ChatMessage;
  }): Promise<void> {
    // Get or create conversation
    let messages = this.conversations.get(conversationId) || [];
    
    // Add new message
    messages.push(message);
    
    // Keep only last 100 messages in memory
    if (messages.length > 100) {
      messages = messages.slice(-100);
    }
    
    this.conversations.set(conversationId, messages);
    
    // TODO: Also persist to database for long-term storage
    // await prisma.chatMessage.create({
    //   data: {
    //     conversationId,
    //     ...message,
    //   }
    // });
  }

  private cleanupConversations(): void {
    const cutoffTime = Date.now() - this.maxConversationAge;
    
    for (const [conversationId, messages] of this.conversations.entries()) {
      if (messages.length === 0) {
        this.conversations.delete(conversationId);
        continue;
      }
      
      const lastMessage = messages[messages.length - 1];
      if (lastMessage.timestamp.getTime() < cutoffTime) {
        this.conversations.delete(conversationId);
      }
    }
  }

  private parseResponse(response: string): {
    content: string;
    suggestedActions?: SuggestedAction[];
  } {
    // Check if response contains suggested actions
    const actionMatch = response.match(/\[ACTIONS\](.*?)\[\/ACTIONS\]/s);
    
    if (actionMatch) {
      try {
        const actions = JSON.parse(actionMatch[1]);
        const content = response.replace(actionMatch[0], '').trim();
        
        return {
          content,
          suggestedActions: actions.map((action: any) => ({
            type: action.type,
            label: action.label,
            data: action.data,
          })),
        };
      } catch {
        // If parsing fails, return response as-is
      }
    }
    
    return { content: response };
  }

  private async getTaskContext(taskId: string): Promise<any> {
    // TODO: Fetch actual task data from database
    // const task = await prisma.task.findUnique({
    //   where: { id: taskId },
    //   include: {
    //     project: true,
    //     tags: true,
    //     subtasks: true,
    //     assignee: true,
    //   }
    // });
    
    // Mock task context for now
    return {
      id: taskId,
      title: 'Sample Task',
      description: 'Task description',
      status: 'in_progress',
      priority: 'high',
      dueDate: new Date(),
      project: {
        name: 'Sample Project',
        description: 'Project context',
      },
      tags: ['backend', 'api'],
      subtasks: [],
    };
  }

  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Helper method to format code blocks in responses
  formatCodeBlocks(content: string): string {
    // Replace triple backticks with proper formatting
    return content.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, lang, code) => {
      return `\`\`\`${lang || ''}\n${code.trim()}\n\`\`\``;
    });
  }

  // Extract code snippets from response
  extractCodeSnippets(content: string): Array<{ language: string; code: string }> {
    const snippets: Array<{ language: string; code: string }> = [];
    const regex = /```(\w+)?\n([\s\S]*?)```/g;
    let match;
    
    while ((match = regex.exec(content)) !== null) {
      snippets.push({
        language: match[1] || 'plaintext',
        code: match[2].trim(),
      });
    }
    
    return snippets;
  }
}

