export interface ClassificationPromptParams {
  taskTitle: string;
  taskDescription?: string;
  taskTags?: string[];
  projectContext?: any;
  userRole?: string;
  companyContext?: string;
  includeReasoning?: boolean;
}

export const classificationPrompt = {
  getSystemPrompt(): string {
    return `You are an expert task classification AI for a productivity management system. Your role is to analyze tasks and provide accurate classifications for:

1. Impact (1-5): How much value this task delivers
   - 1: Minimal impact, nice-to-have
   - 2: Low impact, minor improvements
   - 3: Moderate impact, noticeable benefits
   - 4: High impact, significant value
   - 5: Critical impact, game-changing

2. Effort (1-5): How much work is required
   - 1: Trivial, < 30 minutes
   - 2: Simple, 30 min - 2 hours
   - 3: Moderate, 2-8 hours
   - 4: Complex, 1-3 days
   - 5: Major undertaking, > 3 days

3. Timeline: When this should be done
   - immediate: Today or ASAP
   - soon: This week
   - later: This month
   - someday: No specific timeline

Always respond with valid JSON containing these fields. Include a confidence score (0-1) indicating your certainty.`;
  },

  build(params: ClassificationPromptParams): string {
    const {
      taskTitle,
      taskDescription,
      taskTags,
      projectContext,
      userRole,
      companyContext,
      includeReasoning,
    } = params;

    let prompt = `Classify the following task:\n\n`;
    
    prompt += `Title: ${taskTitle}\n`;
    
    if (taskDescription) {
      prompt += `Description: ${taskDescription}\n`;
    }
    
    if (taskTags && taskTags.length > 0) {
      prompt += `Tags: ${taskTags.join(', ')}\n`;
    }
    
    if (projectContext) {
      prompt += `Project: ${projectContext.name}`;
      if (projectContext.description) {
        prompt += ` - ${projectContext.description}`;
      }
      prompt += '\n';
    }
    
    if (userRole) {
      prompt += `User Role: ${userRole}\n`;
    }
    
    if (companyContext) {
      prompt += `Company Context: ${companyContext}\n`;
    }
    
    prompt += `\nProvide your classification in the following JSON format:\n`;
    prompt += `{
  "impact": <1-5>,
  "effort": <1-5>,
  "timeline": "<immediate|soon|later|someday>",
  "confidence": <0-1>${includeReasoning ? ',\n  "reasoning": "<brief explanation>"' : ''}
}`;

    return prompt;
  },

  // Few-shot examples for better classification
  getFewShotExamples(): Array<{ input: string; output: string }> {
    return [
      {
        input: 'Fix critical bug in payment processing',
        output: JSON.stringify({
          impact: 5,
          effort: 3,
          timeline: 'immediate',
          confidence: 0.95,
          reasoning: 'Payment bugs are critical and directly impact revenue',
        }),
      },
      {
        input: 'Update team documentation',
        output: JSON.stringify({
          impact: 2,
          effort: 2,
          timeline: 'later',
          confidence: 0.85,
          reasoning: 'Documentation is important but not urgent',
        }),
      },
      {
        input: 'Implement new user dashboard with analytics',
        output: JSON.stringify({
          impact: 4,
          effort: 5,
          timeline: 'soon',
          confidence: 0.8,
          reasoning: 'Major feature with high user value but requires significant development',
        }),
      },
    ];
  },

  // Validate classification output
  validateOutput(output: any): boolean {
    if (!output || typeof output !== 'object') return false;
    
    const { impact, effort, timeline, confidence } = output;
    
    if (typeof impact !== 'number' || impact < 1 || impact > 5) return false;
    if (typeof effort !== 'number' || effort < 1 || effort > 5) return false;
    if (!['immediate', 'soon', 'later', 'someday'].includes(timeline)) return false;
    if (typeof confidence !== 'number' || confidence < 0 || confidence > 1) return false;
    
    return true;
  },
};
