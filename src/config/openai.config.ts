export const openaiConfig = {
  apiKey: process.env.OPENAI_API_KEY || '',
  organization: process.env.OPENAI_ORGANIZATION || undefined,
  
  // Default model settings
  defaultModel: process.env.OPENAI_DEFAULT_MODEL || 'gpt-4',
  defaultTemperature: parseFloat(process.env.OPENAI_DEFAULT_TEMPERATURE || '0.7'),
  defaultMaxTokens: parseInt(process.env.OPENAI_DEFAULT_MAX_TOKENS || '2000'),
  
  // Rate limiting
  maxRequestsPerMinute: parseInt(process.env.OPENAI_MAX_REQUESTS_PER_MINUTE || '60'),
  maxTokensPerMinute: parseInt(process.env.OPENAI_MAX_TOKENS_PER_MINUTE || '90000'),
  
  // Retry configuration
  maxRetries: parseInt(process.env.OPENAI_MAX_RETRIES || '3'),
  retryDelay: parseInt(process.env.OPENAI_RETRY_DELAY || '1000'),
  
  // Timeout settings
  requestTimeout: parseInt(process.env.OPENAI_REQUEST_TIMEOUT || '30000'),
  
  // Feature flags
  enableStreaming: process.env.OPENAI_ENABLE_STREAMING === 'true',
  enableFunctionCalling: process.env.OPENAI_ENABLE_FUNCTION_CALLING !== 'false',
  
  // Model preferences for different use cases
  models: {
    classification: process.env.OPENAI_CLASSIFICATION_MODEL || 'gpt-4',
    chat: process.env.OPENAI_CHAT_MODEL || 'gpt-3.5-turbo-16k',
    analysis: process.env.OPENAI_ANALYSIS_MODEL || 'gpt-4-turbo-preview',
  },
  
  // System prompts
  systemPrompts: {
    default: process.env.OPENAI_DEFAULT_SYSTEM_PROMPT || 
      'You are a helpful AI assistant for a task management system.',
    classification: process.env.OPENAI_CLASSIFICATION_SYSTEM_PROMPT ||
      'You are an expert at classifying and organizing tasks.',
    chat: process.env.OPENAI_CHAT_SYSTEM_PROMPT ||
      'You are a knowledgeable assistant helping users with their tasks and projects.',
  },
};

// Validate configuration on startup
export function validateOpenAIConfig(): void {
  if (!openaiConfig.apiKey) {
    console.warn('OpenAI API key not configured. AI features will be disabled.');
  }
  
  if (openaiConfig.maxRequestsPerMinute < 10) {
    console.warn('OpenAI rate limit is very low. This may impact performance.');
  }
}
