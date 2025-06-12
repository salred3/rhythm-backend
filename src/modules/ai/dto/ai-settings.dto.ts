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
