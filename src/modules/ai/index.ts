// Main exports from AI module
export { AIController } from './ai.controller';
export { AIService } from './ai.service';
export { ClassificationService, ClassificationResult } from './classification.service';
export { ChatService, ChatMessage, ChatResult, SuggestedAction } from './chat.service';
export { UsageService, UsageStats, CompanyUsageLimits } from './usage.service';

// Export routes
export { aiRouter } from './ai.routes';

// Export types
export * from './types';

// Export DTOs
export * from './dto';

// Export prompts (for testing or customization)
export { classificationPrompt } from './prompts/classification.prompt';
export { chatPrompt } from './prompts/chat.prompt';
