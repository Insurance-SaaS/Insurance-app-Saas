import { LlmError } from 'src/modules/ai/openai-client.service';

type Message = { role: string; content: string };

/**
 * Stands in for the model. The assistant makes three kinds of calls per turn
 * (classify the intent, extract fields, write the answer); this fake recognises
 * each by its prompt and answers from what the test configured.
 */
export class FakeLlm {
  /** Conversation type returned by intent classification. */
  conversationType = 'sinistre_auto';
  /** Fields "extracted" from a user message. */
  extract: (userMessage: string) => Record<string, unknown> = () => ({});
  /** Result of analysing an uploaded image. */
  imageAnalysis: Record<string, unknown> = { damagedParts: ['pare-chocs arrière'], severity: 'moderate' };
  /** When set, the next call fails with this error (once). */
  failNextWith: LlmError | null = null;
  /** Every prompt received, for assertions. */
  readonly prompts: string[] = [];

  private respond(content: string) {
    return { content, usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } };
  }

  private currentMessage(prompt: string): string {
    return /(?:CURRENT MESSAGE|Message): "([\s\S]*?)"\n/.exec(prompt)?.[1] ?? '';
  }

  async chatCompletionWithRetry(messages: Message[]) {
    if (this.failNextWith) {
      const error = this.failNextWith;
      this.failNextWith = null;
      throw error;
    }
    const prompt = messages.map((m) => m.content).join('\n');
    this.prompts.push(prompt);

    if (prompt.includes('determine the conversation type')) {
      return this.respond(
        JSON.stringify({
          conversationType: this.conversationType,
          conversationGoal: 'test',
          confidence: 'high',
        }),
      );
    }
    if (prompt.includes('determine if the user is confirming')) {
      const said = this.currentMessage(prompt).toLowerCase();
      const action = /\b(oui|yes|ok)\b/.test(said) ? 'confirm' : /\b(non|no|annuler)\b/.test(said) ? 'cancel' : 'modify';
      return this.respond(JSON.stringify({ action, fieldToModify: null, newValue: null }));
    }
    if (prompt.includes('Extract ONLY NEW information')) {
      return this.respond(JSON.stringify({ extractedData: this.extract(this.currentMessage(prompt)) }));
    }
    return this.respond('Réponse de l’assistant.');
  }

  chatCompletion(messages: Message[]) {
    return this.chatCompletionWithRetry(messages);
  }

  async chatJson(messages: Message[]) {
    const response = await this.chatCompletionWithRetry(messages);
    return { data: JSON.parse(response.content), usage: response.usage };
  }

  async analyzeImageWithText() {
    return this.respond('```json\n' + JSON.stringify(this.imageAnalysis) + '\n```');
  }

  convertLangChainMessages(messages: any[]): Message[] {
    return messages.map((m) => ({
      role: m._getType() === 'ai' ? 'assistant' : m._getType() === 'system' ? 'system' : 'user',
      content: m.content as string,
    }));
  }

  getServiceInfo() {
    return { model: 'fake', maxContextWindow: 128000 };
  }
}
