import OpenAI from 'openai';
import { AIProvider, AIModel, AISettings, CompletionOptions } from './types';
import { openaiConfig } from '../../config/openai.config';

export class AIService {
  private providers: Map<AIProvider, any> = new Map();
  private settingsCache: Map<string, { settings: AISettings; timestamp: number }> = new Map();
  private defaultSettings: AISettings = {
    provider: 'openai',
    model: 'gpt-4',
    temperature: 0.7,
    maxTokens: 2000,
    systemPrompt: 'You are a helpful AI assistant for a task management system.',
  };

  constructor() {
    this.initializeProviders();
  }

  private initializeProviders() {
    // Initialize OpenAI
    if (openaiConfig.apiKey) {
      const openai = new OpenAI({
        apiKey: openaiConfig.apiKey,
      });
      this.providers.set('openai', openai);
    }
    
    // Future providers can be added here
    // if (anthropicConfig.apiKey) {
    //   this.providers.set('anthropic', new Anthropic({...}));
    // }
  }

  async getCompanySettings(companyId: string): Promise<AISettings> {
    // Check in-memory cache first
    const cached = this.settingsCache.get(companyId);
    if (cached && Date.now() - cached.timestamp < 3600000) { // 1 hour cache
      return cached.settings;
    }
    
    // TODO: Fetch from database
    // const settings = await prisma.aiSettings.findUnique({
    //   where: { companyId }
    // });
    
    // For now, return defaults and cache them
    const settings = this.defaultSettings;
    this.settingsCache.set(companyId, { settings, timestamp: Date.now() });
    
    return settings;
  }

  async updateSettings(companyId: string, settings: Partial<AISettings>): Promise<AISettings> {
    const current = await this.getCompanySettings(companyId);
    const updated = { ...current, ...settings };
    
    // Update cache
    this.settingsCache.set(companyId, { settings: updated, timestamp: Date.now() });
    
    // TODO: Persist to database
    // await prisma.aiSettings.upsert({
    //   where: { companyId },
    //   create: { companyId, ...updated },
    //   update: updated
    // });
    
    return updated;
  }

  async complete(
    prompt: string,
    options: CompletionOptions = {}
  ): Promise<{ content: string; tokensUsed: number; model: string }> {
    const {
      provider = 'openai',
      model = 'gpt-4',
      temperature = 0.7,
      maxTokens = 2000,
      systemPrompt,
      stream = false,
      onToken
    } = options;

    const client = this.providers.get(provider);
    if (!client) {
      throw new Error(`AI provider ${provider} not configured`);
    }

    try {
      switch (provider) {
        case 'openai':
          return await this.openAIComplete(client, prompt, {
            model,
            temperature,
            maxTokens,
            systemPrompt,
            stream,
            onToken
          });
        
        // Future providers
        // case 'anthropic':
        //   return await this.anthropicComplete(client, prompt, options);
        
        default:
          throw new Error(`Unsupported AI provider: ${provider}`);
      }
    } catch (error) {
      console.error(`AI completion error (${provider}):`, error);
      
      // Implement fallback logic
      if (options.fallbackProvider && options.fallbackProvider !== provider) {
        console.log(`Falling back to ${options.fallbackProvider}`);
        return this.complete(prompt, {
          ...options,
          provider: options.fallbackProvider,
          fallbackProvider: undefined // Prevent infinite recursion
        });
      }
      
      throw error;
    }
  }

  private async openAIComplete(
    client: OpenAI,
    prompt: string,
    options: any
  ): Promise<{ content: string; tokensUsed: number; model: string }> {
    const messages = [] as any[];
    
    if (options.systemPrompt) {
      messages.push({ role: 'system', content: options.systemPrompt });
    }
    
    messages.push({ role: 'user', content: prompt });

    if (options.stream && options.onToken) {
      const stream = await client.chat.completions.create({
        model: options.model,
        messages,
        temperature: options.temperature,
        max_tokens: options.maxTokens,
        stream: true,
      });

      let content = '';
      let tokensUsed = 0;

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content || '';
        content += delta;
        if (delta) {
          options.onToken(delta);
        }
        
        // Estimate tokens (rough approximation)
        tokensUsed = Math.ceil(content.length / 4);
      }

      return { content, tokensUsed, model: options.model };
    } else {
      const completion = await client.chat.completions.create({
        model: options.model,
        messages,
        temperature: options.temperature,
        max_tokens: options.maxTokens,
      });

      const content = completion.choices[0]?.message?.content || '';
      const tokensUsed = completion.usage?.total_tokens || 0;

      return { content, tokensUsed, model: options.model };
    }
  }

  // Model selection helper
  async selectOptimalModel(
    task: 'classification' | 'chat' | 'analysis',
    complexity: 'low' | 'medium' | 'high' = 'medium'
  ): Promise<AIModel> {
    // Model selection logic based on task and complexity
    const modelMap: Record<string, Record<string, AIModel>> = {
      classification: {
        low: 'gpt-3.5-turbo',
        medium: 'gpt-4',
        high: 'gpt-4-turbo-preview'
      },
      chat: {
        low: 'gpt-3.5-turbo',
        medium: 'gpt-3.5-turbo-16k',
        high: 'gpt-4'
      },
      analysis: {
        low: 'gpt-4',
        medium: 'gpt-4',
        high: 'gpt-4-turbo-preview'
      }
    };

    return modelMap[task]?.[complexity] || 'gpt-4';
  }

  // Cost estimation
  estimateCost(model: AIModel, tokensUsed: number): number {
    // Approximate costs per 1K tokens (in cents)
    const costMap: Record<string, { input: number; output: number }> = {
      'gpt-3.5-turbo': { input: 0.15, output: 0.20 },
      'gpt-3.5-turbo-16k': { input: 0.30, output: 0.40 },
      'gpt-4': { input: 3.00, output: 6.00 },
      'gpt-4-turbo-preview': { input: 1.00, output: 3.00 },
    };

    const costs = costMap[model] || costMap['gpt-4'];
    // Rough estimate: assume 50/50 input/output split
    const avgCost = (costs.input + costs.output) / 2;
    return (tokensUsed / 1000) * avgCost;
  }
}

