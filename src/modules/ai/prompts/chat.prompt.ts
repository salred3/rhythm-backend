import { ChatMessage } from '../chat.service';

export interface ChatPromptParams {
  message: string;
  conversationHistory: ChatMessage[];
  taskContext: any;
  enableActions: boolean;
  codeFormattingEnabled: boolean;
}

export const chatPrompt = {
  getSystemPrompt(taskContext?: any): string {
    let prompt = `You are an AI assistant integrated into a task management system. You help users understand and work with their tasks more effectively.

Your capabilities include:
- Answering questions about tasks and projects
- Providing suggestions for task breakdown and organization
- Helping with technical questions related to the task
- Offering productivity tips and best practices
- Generating code snippets when relevant

Guidelines:
- Be concise but thorough
- Use markdown formatting for better readability
- When discussing code, use proper syntax highlighting
- Stay focused on the task context
- Be proactive in suggesting helpful actions`;

    if (taskContext) {
      prompt += `\n\nCurrent task context:
Title: ${taskContext.title}
Status: ${taskContext.status}
Priority: ${taskContext.priority}`;
      
      if (taskContext.description) {
        prompt += `\nDescription: ${taskContext.description}`;
      }
      
      if (taskContext.tags && taskContext.tags.length > 0) {
        prompt += `\nTags: ${taskContext.tags.join(', ')}`;
      }
    }

    return prompt;
  },

  build(params: ChatPromptParams): string {
    const {
      message,
      conversationHistory,
      taskContext,
      enableActions,
      codeFormattingEnabled,
    } = params;

    let prompt = '';

    // Add conversation history (last 10 messages for context)
    if (conversationHistory.length > 0) {
      const recentHistory = conversationHistory.slice(-10);
      
      for (const msg of recentHistory) {
        if (msg.role === 'user') {
          prompt += `User: ${msg.content}\n\n`;
        } else if (msg.role === 'assistant') {
          prompt += `Assistant: ${msg.content}\n\n`;
        }
      }
    }

    // Add current message
    prompt += `User: ${message}\n\nAssistant: `;

    // Add action instructions if enabled
    if (enableActions) {
      prompt += `\n\n[Note: If your response suggests any actions that could be automated (like updating the task, creating subtasks, scheduling, etc.), include them in the following format at the end of your response:
[ACTIONS]
[
  {
    "type": "update_task|create_subtask|schedule|assign|tag",
    "label": "Human-readable action description",
    "data": { relevant data for the action }
  }
]
[/ACTIONS]]`;
    }

    return prompt;
  },

  // Format code blocks properly
  formatCodeResponse(content: string, language?: string): string {
    if (!language) {
      // Try to detect language from content
      if (content.includes('const') || content.includes('let') || content.includes('function')) {
        language = 'javascript';
      } else if (content.includes('def ') || content.includes('import ')) {
        language = 'python';
      } else if (content.includes('interface') || content.includes(': string')) {
        language = 'typescript';
      }
    }

    return `\`\`\`${language || ''}\n${content}\n\`\`\``;
  },

  // Parse suggested actions from response
  parseSuggestedActions(response: string): any[] {
    const actionMatch = response.match(/\[ACTIONS\](.*?)\[\/ACTIONS\]/s);
    
    if (!actionMatch) {
      return [];
    }

    try {
      return JSON.parse(actionMatch[1]);
    } catch {
      return [];
    }
  },

  // Common task-related prompts
  getCommonPrompts(): Record<string, string> {
    return {
      breakdown: 'Can you help me break down this task into smaller, manageable subtasks?',
      estimate: 'Based on the task description, what would be a reasonable time estimate?',
      approach: 'What would be the best approach to tackle this task?',
      clarify: 'What additional information would help clarify this task?',
      priority: 'How should I prioritize this task relative to my other work?',
      blockers: 'What potential blockers or dependencies should I be aware of?',
    };
  },

  // Safety guidelines
  getSafetyGuidelines(): string[] {
    return [
      'Do not execute any code or commands',
      'Do not access external systems or databases',
      'Do not share sensitive information',
      'Maintain professional boundaries',
      'Focus on task-related assistance',
    ];
  },
};
