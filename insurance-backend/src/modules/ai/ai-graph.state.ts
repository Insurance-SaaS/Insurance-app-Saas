import { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import { Annotation } from '@langchain/langgraph';
import { Language } from './ai.constants';

// ============= STATE DEFINITION =============

/**
 * Most channels accumulate: new messages are appended, extracted fields are
 * merged. A node that needs to start a channel over (pruning the history,
 * cancelling a declaration) wraps the new value in replaceWith().
 */
const REPLACE = '__replace__';
export function replaceWith<T>(value: T): T {
  return { [REPLACE]: value } as unknown as T;
}
function replacement<T>(update: T): { value: T } | null {
  return update && typeof update === 'object' && REPLACE in (update as object)
    ? { value: (update as any)[REPLACE] as T }
    : null;
}

export const GraphState = Annotation.Root({
  messages: Annotation<Array<HumanMessage | AIMessage | SystemMessage>>({
    reducer: (x, y) => replacement(y)?.value ?? x.concat(y),
    default: () => [],
  }),
  language: Annotation<Language>({
    reducer: (x, y) => y ?? x,
    default: () => Language.FRENCH,
  }),
  conversationType: Annotation<string>({
    reducer: (x, y) => y ?? x,
    default: () => 'idle',
  }),
  conversationGoal: Annotation<string>({
    reducer: (x, y) => y ?? x,
    default: () => '',
  }),
  extractedData: Annotation<Record<string, any>>({
    reducer: (x, y) => replacement(y)?.value ?? { ...x, ...y },
    default: () => ({}),
  }),
  missingInfo: Annotation<string[]>({
    reducer: (x, y) => y ?? x,
    default: () => [],
  }),
  currentFieldIndex: Annotation<number>({
    reducer: (x, y) => y ?? x,
    default: () => 0,
  }),
  validationResults: Annotation<Record<string, any>>({
    reducer: (x, y) => ({ ...x, ...y }),
    default: () => ({}),
  }),
  needsHumanReview: Annotation<boolean>({
    reducer: (x, y) => y ?? x,
    default: () => false,
  }),
  isComplete: Annotation<boolean>({
    reducer: (x, y) => y ?? x,
    default: () => false,
  }),
  awaitingConfirmation: Annotation<boolean>({
    reducer: (x, y) => y ?? x,
    default: () => false,
  }),
  currentResponse: Annotation<string>({
    reducer: (x, y) => y ?? x,
    default: () => '',
  }),
  fraudScore: Annotation<number>({
    reducer: (x, y) => y ?? x,
    default: () => 0,
  }),
  policyValid: Annotation<boolean>({
    reducer: (x, y) => y ?? x,
    default: () => true,
  }),
  imageAnalysis: Annotation<any[]>({
    reducer: (x, y) => replacement(y)?.value ?? [...x, ...y],
    default: () => [],
  }),
  conversationSummary: Annotation<string>({
    reducer: (x, y) => y ?? x,
    default: () => '',
  }),
  userId: Annotation<string>({
    reducer: (x, y) => y ?? x,
    default: () => '',
  }),
  sinisterId: Annotation<string>({
    reducer: (x, y) => y ?? x,
    default: () => '',
  }),
  // Devis-specific state
  recommendedDevis: Annotation<any[]>({
    reducer: (x, y) => y ?? x,
    default: () => [],
  }),
  selectedDevisId: Annotation<string>({
    reducer: (x, y) => y ?? x,
    default: () => '',
  }),
  selectedOrderingNumber: Annotation<number>({
    reducer: (x, y) => y ?? x,
    default: () => 0,
  }),
  devisDetails: Annotation<any>({
    reducer: (x, y) => y ?? x,
    default: () => null,
  }),
  devisStep: Annotation<string>({
    reducer: (x, y) => y ?? x,
    default: () => 'collecting', // collecting, showing_options, showing_details
  }),
  // Error handling fields
  error: Annotation<string>({
    reducer: (x, y) => y ?? x,
    default: () => '',
  }),
  errorMessage: Annotation<string>({
    reducer: (x, y) => y ?? x,
    default: () => '',
  }),
  userDeclinedPhotos: Annotation<boolean>({
    reducer: (x, y) => y ?? x,
    default: () => false,
  }),
});

/** The state every node of the conversation graph reads and updates. */
export type AiGraphState = typeof GraphState.State;
