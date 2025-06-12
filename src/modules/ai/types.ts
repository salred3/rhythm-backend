// AI Provider types
export type AIProvider = 'openai' | 'anthropic' | 'cohere';

// Model types for different providers
export type OpenAIModel = 
  | 'gpt-3.5-turbo'
  | 'gpt-3.5-turbo-16k'
  | 'gpt-4'
  | 'gpt-4-turbo-preview'
  | 'gpt-4-32k';

export type AnthropicModel = 
  | 'claude-2'
  | 'claude-instant-1';

export type CohereModel = 
  | 'command'
  | 'command-light';

export type AIModel = OpenAIModel | AnthropicModel | CohereModel;

// AI Settings
export interface AISettings {
  provider: AIProvider;
  model: AIModel;
  temperature: number;
  maxTokens: number;
  systemPrompt?: string;
  fallbackProvider?: AIProvider;
  fallbackModel?: AIModel;
}

// Completion options
export interface CompletionOptions {
  provider?: AIProvider;
  model?: AIModel;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  stream?: boolean;
  onToken?: (token: string) => void;
  fallbackProvider?: AIProvider;
  fallbackModel?: AIModel;
}

// Token usage tracking
export interface TokenUsage {
  prompt: number;
  completion: number;
  total: number;
}

// Model capabilities
export interface ModelCapabilities {
  provider: AIProvider;
  model: AIModel;
  contextWindow: number;
  costPer1kTokens: {
    input: number;
    output: number;
  };
  features: {
    streaming: boolean;
    functionCalling: boolean;
    vision: boolean;
    codeGeneration: boolean;
  };
}

// Model registry
export const MODEL_CAPABILITIES: Record<string, ModelCapabilities> = {
  'gpt-3.5-turbo': {
    provider: 'openai',
    model: 'gpt-3.5-turbo',
    contextWindow: 4096,
    costPer1kTokens: { input: 0.0015, output: 0.002 },
    features: {
      streaming: true,
      functionCalling: true,
      vision: false,
      codeGeneration: true,
    },
  },
  'gpt-3.5-turbo-16k': {
    provider: 'openai',
    model: 'gpt-3.5-turbo-16k',
    contextWindow: 16384,
    costPer1kTokens: { input: 0.003, output: 0.004 },
    features: {
      streaming: true,
      functionCalling: true,
      vision: false,
      codeGeneration: true,
    },
  },
  'gpt-4': {
    provider: 'openai',
    model: 'gpt-4',
    contextWindow: 8192,
    costPer1kTokens: { input: 0.03, output: 0.06 },
    features: {
      streaming: true,
      functionCalling: true,
      vision: false,
      codeGeneration: true,
    },
  },
  'gpt-4-turbo-preview': {
    provider: 'openai',
    model: 'gpt-4-turbo-preview',
    contextWindow: 128000,
    costPer1kTokens: { input: 0.01, output: 0.03 },
    features: {
      streaming: true,
      functionCalling: true,
      vision: true,
      codeGeneration: true,
    },
  },
  // Add more models as needed
};

// Error types
export class AIProviderError extends Error {
  constructor(
    message: string,
    public provider: AIProvider,
    public code?: string,
    public statusCode?: number
  ) {
    super(message);
    this.name = 'AIProviderError';
  }
}

export class AIRateLimitError extends AIProviderError {
  constructor(
    provider: AIProvider,
    public retryAfter?: number
  ) {
    super('Rate limit exceeded', provider, 'rate_limit', 429);
    this.name = 'AIRateLimitError';
  }
}

export class AIQuotaExceededError extends AIProviderError {
  constructor(provider: AIProvider) {
    super('Quota exceeded', provider, 'quota_exceeded', 429);
    this.name = 'AIQuotaExceededError';
  }
}
