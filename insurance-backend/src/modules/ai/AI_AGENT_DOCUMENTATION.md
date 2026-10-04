# AI Agent Service - Complete Documentation

## Table of Contents
1. [Overview](#overview)
2. [LangChain & LangGraph Framework](#langchain--langgraph-framework)
3. [Architecture](#architecture)
4. [State Management](#state-management)
5. [Graph Workflow](#graph-workflow)
6. [LangGraph Implementation Details](#langgraph-implementation-details)
7. [Core Components](#core-components)
8. [Conversation Types](#conversation-types)
9. [Data Extraction & Validation](#data-extraction--validation)
10. [Image Analysis](#image-analysis)
11. [Language Support](#language-support)
12. [Session Management](#session-management)
13. [Public API Methods](#public-api-methods)
14. [Error Handling](#error-handling)
15. [Configuration](#configuration)
16. [Usage Examples](#usage-examples)

---

## Overview

The `AiOpenAIService` is a sophisticated conversational AI agent built using **LangGraph** that handles insurance-related conversations in a multi-language environment. The agent supports:

- **Insurance Claim Declarations (Sinistre)**: Auto and home insurance claims
- **Insurance Quote Requests (Devis)**: Multiple insurance product types
- **Multi-language Support**: French, English, and Arabic
- **Image Analysis**: Automatic damage assessment from photos
- **Intelligent Data Extraction**: Structured information extraction from natural language
- **Validation & Fraud Detection**: Policy validation and fraud scoring
- **Stateful Conversations**: Maintains context across multiple interactions

### Key Technologies
- **LangGraph**: State machine for conversation flow
- **LangChain**: Framework for building LLM applications
- **OpenAI API**: GPT models for natural language understanding
- **MemorySaver**: Persistent conversation state
- **NestJS**: Dependency injection and service architecture

---

## LangChain & LangGraph Framework

### What is LangChain?

**LangChain** is a framework for developing applications powered by language models. It provides:

- **Abstractions**: Standard interfaces for working with LLMs
- **Components**: Reusable building blocks (chains, agents, memory)
- **Message Types**: Structured message classes for conversation management
- **Integration**: Easy integration with various LLM providers (OpenAI, Anthropic, etc.)

### What is LangGraph?

**LangGraph** is a library built on top of LangChain that enables building **stateful, multi-actor applications** with LLMs. It provides:

- **State Graphs**: Define workflows as graphs with nodes and edges
- **State Management**: Automatic state management with reducers
- **Checkpointing**: Persistent state across conversations
- **Conditional Routing**: Dynamic routing based on state
- **Cycles & Loops**: Support for iterative workflows

### Why LangGraph for This Agent?

LangGraph is ideal for this insurance agent because:

1. **Stateful Conversations**: Maintains context across multiple user interactions
2. **Complex Workflows**: Handles multi-step data collection with validation
3. **Conditional Logic**: Routes based on conversation state (complete, needs review, etc.)
4. **Persistence**: Saves conversation state for resumable sessions
5. **Modularity**: Each step (classify, extract, validate) is a separate node

### LangChain Components Used

#### 1. Message Types

The agent uses three LangChain message types:

```typescript
import { 
  HumanMessage,    // User messages
  AIMessage,       // Assistant responses
  SystemMessage    // System instructions
} from '@langchain/core/messages';
```

**HumanMessage**: Represents user input
```typescript
const userMessage = new HumanMessage("J'ai eu un accident");
```

**AIMessage**: Represents assistant responses
```typescript
const aiResponse = new AIMessage("Pouvez-vous me donner la date de l'accident?");
```

**SystemMessage**: Represents system instructions and context
```typescript
const systemPrompt = new SystemMessage("You are an insurance assistant...");
```

**Usage in State**:
- Messages are stored in state as an array
- Reducer concatenates messages: `(x, y) => x.concat(y)`
- Messages accumulate throughout the conversation
- Used for context in AI API calls

#### 2. Message Conversion

The agent converts LangChain messages for OpenAI API:

```typescript
const messages = this.aiClient.convertLangChainMessages([
  new SystemMessage(systemPrompt),
  new SystemMessage(contextMessage),
  ...state.messages.slice(-10),  // Recent conversation history
  new HumanMessage(responsePrompt)
]);
```

### LangGraph Components Used

#### 1. StateGraph

**StateGraph** is the core class for building stateful workflows:

```typescript
import { StateGraph, END, START, Annotation } from '@langchain/langgraph';
```

**Creation**:
```typescript
const workflow = new StateGraph(GraphState);
```

**GraphState** is defined using `Annotation.Root()` which creates a typed state schema.

#### 2. Annotation System

**Annotation** is used to define state fields with reducers:

```typescript
const GraphState = Annotation.Root({
  messages: Annotation<Array<HumanMessage | AIMessage | SystemMessage>>({
    reducer: (x, y) => x.concat(y),  // How to merge updates
    default: () => [],                // Default value
  }),
  language: Annotation<Language>({
    reducer: (x, y) => y ?? x,        // Last value wins
    default: () => Language.FRENCH,
  }),
  // ... more fields
});
```

**Reducer Functions**:
- **Accumulation**: `(x, y) => x.concat(y)` - For arrays (messages)
- **Merge**: `(x, y) => ({ ...x, ...y })` - For objects (extractedData)
- **Replace**: `(x, y) => y ?? x` - Last value wins (flags, strings, numbers)

#### 3. Node Addition

Nodes are functions that receive state and return state updates:

```typescript
workflow.addNode('classify', this.classifyIntent.bind(this));
workflow.addNode('extract', this.extractInformation.bind(this));
// ... more nodes
```

**Node Function Signature**:
```typescript
private async classifyIntent(state: typeof GraphState.State) {
  // Process state
  // Return partial state update
  return {
    conversationType: 'sinistre_auto',
    language: Language.FRENCH,
    conversationGoal: 'Declare auto claim'
  };
}
```

**Key Points**:
- Nodes receive the **full state** object
- Nodes return **partial updates** (only changed fields)
- LangGraph automatically merges updates using reducers
- Nodes can be async (return Promises)

#### 4. Edge Definition

**Edges** define the flow between nodes:

```typescript
// Simple edge (always follows this path)
workflow.addEdge(START, 'pruneMessages');
workflow.addEdge('pruneMessages', 'classify');
workflow.addEdge('classify', 'extract');

// Conditional edge (routes based on state)
workflow.addConditionalEdges(
  'checkFraud',                           // Source node
  this.shouldRouteToCompletion.bind(this), // Routing function
  {
    generateResponse: 'generateResponse',  // Route mappings
    complete: 'complete',
    flagForReview: 'flagForReview',
  }
);

// Terminal edges
workflow.addEdge('generateResponse', END);
workflow.addEdge('complete', END);
workflow.addEdge('flagForReview', END);
```

**START and END**:
- `START`: Entry point of the graph
- `END`: Exit point(s) of the graph
- Multiple END edges are allowed (different completion paths)

**Conditional Edges**:
- Routing function receives state and returns a string (route name)
- Route name maps to target node
- Enables dynamic workflow routing

#### 5. Graph Compilation

After defining nodes and edges, the graph must be compiled:

```typescript
return workflow.compile({ checkpointer: this.checkpointer });
```

**Compilation**:
- Validates graph structure
- Sets up checkpointing
- Returns executable graph object
- Graph can be invoked with state and config

#### 6. MemorySaver (Checkpointing)

**MemorySaver** provides persistent state storage:

```typescript
import { MemorySaver } from '@langchain/langgraph';

private checkpointer: MemorySaver;

constructor() {
  this.checkpointer = new MemorySaver();
  this.graph = this.buildGraph();
}
```

**Features**:
- **Persistence**: State survives application restarts (in-memory by default)
- **Thread-based**: Each session has a unique thread ID
- **State Retrieval**: Can retrieve previous state
- **State Updates**: Can update state directly

**Thread ID Usage**:
```typescript
const config = {
  configurable: { thread_id: sessionId }
};

// Invoke graph with thread ID
const result = await this.graph.invoke(
  { messages: [new HumanMessage(message)] },
  config
);

// Retrieve state
const state = await this.graph.getState(config);

// Update state
await this.graph.updateState(config, { extractedData: {...} });
```

### Complete Graph Structure

```typescript
private buildGraph() {
  const workflow = new StateGraph(GraphState)
    // Add all nodes
    .addNode('pruneMessages', this.pruneMessages.bind(this))
    .addNode('classify', this.classifyIntent.bind(this))
    .addNode('extract', this.extractInformation.bind(this))
    .addNode('validatePolicy', this.validatePolicy.bind(this))
    .addNode('checkFraud', this.checkFraud.bind(this))
    .addNode('generateResponse', this.generateResponse.bind(this))
    .addNode('complete', this.completeConversation.bind(this))
    .addNode('flagForReview', this.flagForReview.bind(this))

    // Define edges
    .addEdge(START, 'pruneMessages')
    .addEdge('pruneMessages', 'classify')
    .addEdge('classify', 'extract')
    .addEdge('extract', 'validatePolicy')
    .addEdge('validatePolicy', 'checkFraud')
    
    // Conditional routing
    .addConditionalEdges(
      'checkFraud', 
      this.shouldRouteToCompletion.bind(this), 
      {
        generateResponse: 'generateResponse',
        complete: 'complete',
        flagForReview: 'flagForReview',
      }
    )
    
    // Terminal edges
    .addEdge('generateResponse', END)
    .addEdge('complete', END)
    .addEdge('flagForReview', END);

  // Compile with checkpointing
  return workflow.compile({ checkpointer: this.checkpointer });
}
```

### Graph Execution Flow

1. **Invocation**: `graph.invoke(initialState, config)`
2. **State Initialization**: Merges initial state with defaults
3. **Node Execution**: Executes nodes in sequence according to edges
4. **State Updates**: Each node's return value is merged into state
5. **Routing**: Conditional edges evaluate routing function
6. **Checkpointing**: State saved after each node (if configured)
7. **Completion**: Reaches END node and returns final state

### State Reducers Explained

Each state field has a reducer that determines how updates are merged:

#### Accumulation Reducer (Messages)
```typescript
messages: Annotation<Array<HumanMessage | AIMessage | SystemMessage>>({
  reducer: (x, y) => x.concat(y),  // Concatenate arrays
  default: () => [],
})
```
- **Use Case**: Conversation history that accumulates
- **Behavior**: New messages appended to existing array
- **Example**: `[msg1, msg2] + [msg3] = [msg1, msg2, msg3]`

#### Merge Reducer (Objects)
```typescript
extractedData: Annotation<Record<string, any>>({
  reducer: (x, y) => ({ ...x, ...y }),  // Spread and merge
  default: () => ({}),
})
```
- **Use Case**: Data objects that need field-level updates
- **Behavior**: New fields added, existing fields updated
- **Example**: `{a: 1, b: 2} + {b: 3, c: 4} = {a: 1, b: 3, c: 4}`

#### Replace Reducer (Primitives)
```typescript
language: Annotation<Language>({
  reducer: (x, y) => y ?? x,  // Last value wins, fallback to existing
  default: () => Language.FRENCH,
})
```
- **Use Case**: Single values that should be replaced
- **Behavior**: New value replaces old, null/undefined ignored
- **Example**: `'fr' + 'en' = 'en'`

#### Array Merge Reducer (Image Analysis)
```typescript
imageAnalysis: Annotation<any[]>({
  reducer: (x, y) => [...x, ...y],  // Spread both arrays
  default: () => [],
})
```
- **Use Case**: Arrays that should merge (not replace)
- **Behavior**: Combines both arrays
- **Example**: `[img1] + [img2, img3] = [img1, img2, img3]`

### Conditional Routing

The routing function determines the next node based on state:

```typescript
private shouldRouteToCompletion(state: typeof GraphState.State): string {
  if (state.conversationType === 'non_insurance') {
    return 'generateResponse';
  }

  if (state.needsHumanReview) {
    return 'flagForReview';
  }

  if (state.isComplete) {
    return 'complete';
  }

  return 'generateResponse';
}
```

**Routing Logic**:
- Returns a string matching a route name
- Route name maps to target node
- Enables dynamic workflow control
- Can route to different paths based on any state field

### Graph Invocation

#### Basic Invocation
```typescript
const result = await this.graph.invoke(
  {
    messages: [new HumanMessage(message)],
    userId: userId || '',
  },
  {
    configurable: { thread_id: sessionId },
    recursionLimit: 50,
  }
);
```

**Parameters**:
- **Initial State**: Partial state object (merged with defaults)
- **Config**: Configuration object with thread_id and limits

**Returns**: Final state after graph execution

#### State Retrieval
```typescript
const state = await this.graph.getState({
  configurable: { thread_id: sessionId }
});
```

**Returns**: Current state for the thread (from checkpointer)

#### State Update
```typescript
await this.graph.updateState(
  { configurable: { thread_id: sessionId } },
  {
    extractedData: { typeSinistre: 'accident' },
    missingInfo: ['dateSinistre', 'heureSinistre']
  }
);
```

**Use Case**: Manual state updates, corrections, or initialization

### LangGraph Patterns Used

#### 1. Linear Pipeline
Most of the graph follows a linear flow:
```
START → pruneMessages → classify → extract → validatePolicy → checkFraud → [route]
```

#### 2. Conditional Branching
After `checkFraud`, the graph branches:
```
checkFraud → [conditional] → generateResponse | complete | flagForReview
```

#### 3. Multiple End Points
Different completion paths:
- Normal response: `generateResponse → END`
- Completion: `complete → END`
- Review: `flagForReview → END`

#### 4. State Accumulation
State accumulates data throughout the graph:
- Messages accumulate in each node
- Extracted data merges progressively
- Validation results accumulate

#### 5. Async Node Functions
All nodes are async and can perform:
- API calls (OpenAI)
- Database operations
- External service calls
- Complex computations

### Benefits of LangGraph Architecture

1. **Modularity**: Each step is a separate, testable function
2. **State Management**: Automatic state merging and persistence
3. **Type Safety**: TypeScript types for state and nodes
4. **Debugging**: Can inspect state at any point
5. **Scalability**: Easy to add/remove nodes
6. **Persistence**: Conversation state survives restarts
7. **Flexibility**: Dynamic routing based on state

### LangGraph vs Traditional Approaches

**Traditional State Machine**:
- Manual state management
- Manual persistence
- Complex routing logic
- Hard to debug

**LangGraph**:
- Automatic state management with reducers
- Built-in checkpointing
- Declarative routing
- Easy state inspection
- Type-safe state schema

---

## Architecture

### Service Structure

```
AiOpenAIService
├── State Management (GraphState)
├── Graph Workflow (LangGraph)
├── Session Management
├── Token Tracking
├── Language Detection
├── Intent Classification
├── Data Extraction
├── Validation Services
├── Image Analysis
└── Response Generation
```

### Dependencies

```typescript
- OpenAIClientService: OpenAI API client
- SinisterService: Insurance claim database operations
- DevisService: Insurance quote operations
- DateValidationService: Date/time validation
- LocationValidationService: Location validation
```

---

## State Management

### GraphState Definition

The agent uses a comprehensive state object that tracks all conversation aspects:

```typescript
GraphState {
  // Message History
  messages: Array<HumanMessage | AIMessage | SystemMessage>
  
  // Language & Context
  language: Language (fr | en | ar)
  conversationType: string
  conversationGoal: string
  
  // Data Collection
  extractedData: Record<string, any>
  missingInfo: string[]
  currentFieldIndex: number
  
  // Validation
  validationResults: Record<string, any>
  needsHumanReview: boolean
  policyValid: boolean
  fraudScore: number
  
  // Conversation Flow
  isComplete: boolean
  awaitingConfirmation: boolean
  currentResponse: string
  
  // Image Analysis
  imageAnalysis: any[]
  
  // User Context
  userId: string
  sinisterId: string
  conversationSummary: string
  
  // Devis-specific
  recommendedDevis: any[]
  selectedDevisId: string
  selectedOrderingNumber: number
  devisDetails: any
  devisStep: string ('collecting' | 'showing_options' | 'showing_details')
  
  // Error Handling
  error: string
  errorMessage: string
  userDeclinedPhotos: boolean
}
```

### State Reducers

Each state field has a reducer function that determines how updates are merged:
- **Messages**: Concatenated (accumulated)
- **Language/Type**: Last value wins
- **Extracted Data**: Merged (spread operator)
- **Missing Info**: Replaced
- **Flags**: Last value wins

---

## Graph Workflow

### Workflow Nodes

The agent uses a state graph with the following nodes:

```
START
  ↓
pruneMessages (Message History Management)
  ↓
classify (Intent Classification)
  ↓
extract (Information Extraction)
  ↓
validatePolicy (Policy Validation)
  ↓
checkFraud (Fraud Detection)
  ↓
[Routing Decision]
  ├─→ generateResponse (Normal Response)
  ├─→ complete (Conversation Completion)
  └─→ flagForReview (Manual Review Required)
  ↓
END
```

### Node Descriptions

#### 1. `pruneMessages`
- **Purpose**: Manages conversation history length
- **Logic**: 
  - If messages exceed `MAX_CONVERSATION_MESSAGES` (20), summarizes old messages
  - Keeps system messages and recent 10 messages
  - Generates conversation summary for context

#### 2. `classify`
- **Purpose**: Determines conversation intent and type
- **Output**: 
  - `conversationType`: Type of conversation (sinistre_auto, devis_auto, etc.)
  - `conversationGoal`: Goal description
  - `language`: Detected language
- **Logic**:
  - Preserves active conversation type if in progress
  - Uses AI classification for new conversations
  - Detects language from message content

#### 3. `extract`
- **Purpose**: Extracts structured data from user messages
- **Handles**:
  - Sinistre fields (ordered extraction)
  - Devis fields (product type, age, postal code, budget, vehicle type)
  - Image-detected damaged parts
  - Date/time validation
  - Location validation
- **Special Logic**:
  - Ordered field collection for sinistre
  - Automatic damaged parts detection from images
  - Photo requirement enforcement

#### 4. `validatePolicy`
- **Purpose**: Validates insurance policy information
- **Logic**: Checks policy number or email validity

#### 5. `checkFraud`
- **Purpose**: Calculates fraud risk score
- **Factors**:
  - Missing images: +20 points
  - High claim amount (>50,000): +30 points
  - Short description (<20 chars): +20 points
  - No witnesses: +15 points
  - Has images: -20 points
- **Threshold**: Score > 50 triggers manual review

#### 6. `generateResponse`
- **Purpose**: Generates natural language response
- **Handles**:
  - Error messages (future date, invalid location, etc.)
  - Field collection prompts
  - Confirmation requests
  - Devis quote presentation
  - Photo requirement messages

#### 7. `complete`
- **Purpose**: Finalizes conversation and saves to database
- **Actions**:
  - Saves sinistre to database
  - Generates completion message
  - Returns sinister details

#### 8. `flagForReview`
- **Purpose**: Flags conversation for manual review
- **Triggers**: High fraud score, policy issues, or special cases

---

## LangGraph Implementation Details

### Node Implementation Patterns

Each node in the graph follows a consistent pattern:

#### Pattern: State Input → Processing → State Output

```typescript
private async nodeFunction(state: typeof GraphState.State) {
  // 1. Read from state
  const lastMessage = state.messages[state.messages.length - 1];
  const extractedData = state.extractedData;
  
  // 2. Process (API calls, validation, etc.)
  const result = await this.processData(lastMessage);
  
  // 3. Return partial state update
  return {
    extractedData: { ...extractedData, ...result },
    missingInfo: calculateMissing(result),
  };
}
```

### Detailed Node Implementations

#### 1. `pruneMessages` Node

**Purpose**: Prevents conversation history from growing too large

**Implementation**:
```typescript
private async pruneMessages(state: typeof GraphState.State) {
  const messageCount = state.messages.length;
  
  if (messageCount <= this.MAX_CONVERSATION_MESSAGES) {
    return {}; // No update needed
  }
  
  // Summarize old messages
  const summary = await this.summarizeOldContext(
    state.messages, 
    state.language
  );
  
  // Keep system messages and recent messages
  const systemMessages = state.messages.filter(
    (m) => m._getType() === 'system'
  );
  const recentMessages = state.messages
    .filter((m) => m._getType() !== 'system')
    .slice(-10);
  
  const summaryMessage = new SystemMessage(
    `Previous conversation summary:\n${summary}`
  );
  
  // Return state update
  return {
    messages: [...systemMessages, summaryMessage, ...recentMessages],
    conversationSummary: summary,
  };
}
```

**LangGraph Behavior**:
- State reducer for `messages`: `(x, y) => x.concat(y)`
- But this node **replaces** the messages array entirely
- The reducer still applies, but since we return a complete array, it effectively replaces

**Key Points**:
- Returns empty object `{}` if no pruning needed (no state change)
- Uses LangChain `SystemMessage` for summary
- Preserves system messages (important for context)

#### 2. `classify` Node

**Purpose**: Determines conversation intent and type

**Implementation**:
```typescript
private async classifyIntent(state: typeof GraphState.State) {
  const lastMessage = state.messages[state.messages.length - 1];
  const rawContent = (lastMessage.content as string) || '';
  
  // Language detection
  let detectedLang = this.detectLanguage(rawContent);
  
  // Preserve active conversation if in progress
  const isActiveFlow = 
    state.conversationType?.startsWith('sinistre_') ||
    state.conversationType?.startsWith('devis_');
  const hasProgress = 
    state.extractedData && 
    Object.keys(state.extractedData).length > 0;
  
  if (isActiveFlow && hasProgress) {
    // Preserve current type
    return {
      conversationType: state.conversationType,
      conversationGoal: state.conversationGoal || 'Continuing...',
      language: detectedLang,
    };
  }
  
  // AI classification for new conversations
  const classificationPrompt = `Analyze this message...`;
  const messages = this.aiClient.convertLangChainMessages([
    new HumanMessage(classificationPrompt),
  ]);
  const response = await this.aiClient.chatCompletion(messages, {
    temperature: 0.7,
    maxTokens: 512,
  });
  
  const classification = JSON.parse(response.content);
  
  return {
    conversationType: classification.conversationType,
    conversationGoal: classification.conversationGoal,
    language: detectedLang,
  };
}
```

**LangGraph Behavior**:
- Uses `conversationType` reducer: `(x, y) => y ?? x` (last value wins)
- Preserves state when conversation is active
- Updates state when new conversation detected

**Key Points**:
- **State Preservation**: Prevents reclassification during active flows
- **AI Classification**: Uses OpenAI for intent detection
- **Language Detection**: Automatic language detection

#### 3. `extract` Node

**Purpose**: Extracts structured data from user messages

**Implementation** (Sinistre):
```typescript
private async extractOrderedInformation(state: typeof GraphState.State) {
  const lastMessage = state.messages[state.messages.length - 1];
  
  // Check confirmation state
  if (state.awaitingConfirmation) {
    return this.handleConfirmation(state, lastMessage);
  }
  
  // Extract from images
  let imageDetectedParts: string[] = [];
  if (state.imageAnalysis?.length > 0) {
    state.imageAnalysis.forEach((img: any) => {
      const parts = img.damagedParts || img.affectedAreas || [];
      if (Array.isArray(parts)) {
        imageDetectedParts.push(...parts);
      }
    });
  }
  
  // AI extraction prompt
  const extractionPrompt = `Extract ONLY NEW information...`;
  const messages = this.aiClient.convertLangChainMessages([
    new HumanMessage(extractionPrompt),
  ]);
  const response = await this.aiClient.chatCompletion(messages, {
    temperature: 0.3,
    maxTokens: 512,
  });
  
  const extraction = JSON.parse(response.content);
  let newData = extraction.extractedData || {};
  
  // Validation
  if (newData.dateSinistre) {
    const dateValidation = this.dateValidationService.validateDate(
      newData.dateSinistre
    );
    if (!dateValidation.isValid || dateValidation.isFuture) {
      return {
        extractedData: {},
        missingInfo: SINISTRE_FIELDS_ORDER,
        error: 'invalid_date',
        errorMessage: this.dateValidationService.getDateErrorMessage(...),
      };
    }
  }
  
  // Merge with existing data
  const mergedData = { ...state.extractedData, ...newData };
  
  // Calculate missing fields
  const missingFields = SINISTRE_FIELDS_ORDER.filter(
    (field) => !mergedData[field]
  );
  
  return {
    extractedData: mergedData,
    missingInfo: missingFields,
    currentFieldIndex: SINISTRE_FIELDS_ORDER.length - missingFields.length,
  };
}
```

**LangGraph Behavior**:
- `extractedData` reducer: `(x, y) => ({ ...x, ...y })` (merge objects)
- `missingInfo` reducer: `(x, y) => y ?? x` (replace array)
- State accumulates extracted data progressively

**Key Points**:
- **Ordered Extraction**: Fields collected in specific order
- **Image Integration**: Automatically merges image-detected parts
- **Validation**: Validates dates, times, locations before accepting
- **Error Handling**: Returns error state if validation fails

#### 4. `validatePolicy` Node

**Purpose**: Validates insurance policy information

**Implementation**:
```typescript
private async validatePolicy(state: typeof GraphState.State) {
  const policyData = 
    state.extractedData.numeroPolice || 
    state.extractedData.email;
  
  if (!policyData) {
    return { policyValid: true }; // No policy to validate
  }
  
  // Simulated validation (replace with actual policy check)
  await new Promise((resolve) => setTimeout(resolve, 100));
  const isValid = !policyData.includes('invalid');
  
  return {
    policyValid: isValid,
    validationResults: {
      ...state.validationResults,
      policyChecked: true,
      policyActive: isValid,
      coverageType: state.conversationType.includes('auto') 
        ? 'auto' 
        : 'habitation',
    },
  };
}
```

**LangGraph Behavior**:
- `policyValid` reducer: `(x, y) => y ?? x` (boolean flag)
- `validationResults` reducer: `(x, y) => ({ ...x, ...y })` (merge object)

#### 5. `checkFraud` Node

**Purpose**: Calculates fraud risk score

**Implementation**:
```typescript
private async checkFraud(state: typeof GraphState.State) {
  const data = state.extractedData;
  const hasImages = state.imageAnalysis?.length > 0;
  
  let fraudScore = 0;
  
  // Scoring factors
  if (!hasImages && state.conversationType.startsWith('sinistre_')) {
    fraudScore += 20;
  }
  if (data.montant && parseFloat(data.montant) > 50000) {
    fraudScore += 30;
  }
  if (data.descriptionIncident && data.descriptionIncident.length < 20) {
    fraudScore += 20;
  }
  if (!data.temoins && !hasImages) {
    fraudScore += 15;
  }
  
  // Images reduce risk
  if (hasImages) {
    fraudScore = Math.max(0, fraudScore - 20);
  }
  
  const needsReview = fraudScore > 50;
  
  return {
    fraudScore,
    needsHumanReview: needsReview,
    validationResults: {
      ...state.validationResults,
      fraudCheck: true,
      fraudScore,
      riskLevel: fraudScore > 50 ? 'high' : fraudScore > 30 ? 'medium' : 'low',
      hasImageEvidence: hasImages,
    },
  };
}
```

**LangGraph Behavior**:
- `fraudScore` reducer: `(x, y) => y ?? x` (replace number)
- `needsHumanReview` reducer: `(x, y) => y ?? x` (replace boolean)
- Used by routing function to determine next node

#### 6. `generateResponse` Node

**Purpose**: Generates natural language response

**Implementation**:
```typescript
private async generateResponse(state: typeof GraphState.State) {
  // Handle errors first
  if (state.error === 'future_date') {
    return {
      currentResponse: state.errorMessage || 'Date cannot be in future',
      messages: [new AIMessage(state.errorMessage || '...')],
      isComplete: false,
    };
  }
  
  // Build system prompts
  const systemPrompt = this.getSystemPromptForType(
    state.conversationType, 
    state.language
  );
  const contextMessage = this.buildContextMessage(state);
  const instructions = this.getInstructionsForCurrentState(state);
  
  // Prepare messages for OpenAI
  const messages = this.aiClient.convertLangChainMessages([
    new SystemMessage(systemPrompt),
    new SystemMessage(contextMessage),
    ...state.messages.slice(-10), // Recent history
    new HumanMessage(instructions),
  ]);
  
  // Call OpenAI
  const response = await this.aiClient.chatCompletionWithRetry(messages, {
    temperature: 0.7,
    maxTokens: 512,
  });
  
  // Return state update
  return {
    currentResponse: response.content,
    messages: [new AIMessage(response.content)],
    isComplete: false,
    awaitingConfirmation: needsConfirmation,
  };
}
```

**LangGraph Behavior**:
- Adds `AIMessage` to messages array
- Reducer concatenates: `(x, y) => x.concat(y)`
- Updates `currentResponse` for API response

**Key Points**:
- Uses LangChain message types
- Includes conversation context
- Handles errors before AI call
- Returns structured response

#### 7. `complete` Node

**Purpose**: Finalizes conversation

**Implementation**:
```typescript
private async completeConversation(state: typeof GraphState.State) {
  // Handle devis completion
  if (state.conversationType.startsWith('devis_')) {
    return this.completeDevisConversation(state);
  }
  
  // Save sinistre to database
  const sinisterId = await this.saveSinisterToDatabase(state);
  
  // Generate completion message
  const completionPrompt = `Generate a brief confirmation...`;
  const messages = this.aiClient.convertLangChainMessages([
    new HumanMessage(completionPrompt),
  ]);
  const response = await this.aiClient.chatCompletion(messages, {
    temperature: 0.7,
    maxTokens: 800,
  });
  
  return {
    currentResponse: response.content,
    messages: [new AIMessage(response.content)],
    isComplete: true,
    sinisterId: sinisterId || '',
  };
}
```

**LangGraph Behavior**:
- Sets `isComplete: true` (triggers end of workflow)
- Saves to database (external operation)
- Final message added to state

### State Flow Through Graph

#### Example: Sinistre Declaration Flow

1. **Initial State** (from `invoke`):
```typescript
{
  messages: [new HumanMessage("J'ai eu un accident")],
  userId: "user-123"
}
```

2. **After `pruneMessages`**:
```typescript
{
  messages: [new HumanMessage("J'ai eu un accident")],
  userId: "user-123"
  // No change (message count < 20)
}
```

3. **After `classify`**:
```typescript
{
  messages: [new HumanMessage("J'ai eu un accident")],
  userId: "user-123",
  conversationType: "sinistre_auto",
  conversationGoal: "Declare auto claim",
  language: "fr"
}
```

4. **After `extract`**:
```typescript
{
  messages: [new HumanMessage("J'ai eu un accident")],
  userId: "user-123",
  conversationType: "sinistre_auto",
  language: "fr",
  extractedData: {
    typeSinistre: "accident"
  },
  missingInfo: ["dateSinistre", "heureSinistre", "lieuSinistre", ...],
  currentFieldIndex: 1
}
```

5. **After `validatePolicy`**:
```typescript
{
  // ... previous state ...
  policyValid: true,
  validationResults: {
    policyChecked: true,
    policyActive: true
  }
}
```

6. **After `checkFraud`**:
```typescript
{
  // ... previous state ...
  fraudScore: 20,
  needsHumanReview: false,
  validationResults: {
    // ... previous ...
    fraudCheck: true,
    riskLevel: "low"
  }
}
```

7. **After `generateResponse`**:
```typescript
{
  // ... previous state ...
  currentResponse: "Pouvez-vous me donner la date de l'accident?",
  messages: [
    new HumanMessage("J'ai eu un accident"),
    new AIMessage("Pouvez-vous me donner la date de l'accident?")
  ],
  isComplete: false
}
```

### Conditional Routing Implementation

The routing function is called after `checkFraud`:

```typescript
private shouldRouteToCompletion(state: typeof GraphState.State): string {
  // Non-insurance questions go directly to response
  if (state.conversationType === 'non_insurance') {
    return 'generateResponse';
  }
  
  // High fraud score requires review
  if (state.needsHumanReview) {
    return 'flagForReview';
  }
  
  // All data collected, complete conversation
  if (state.isComplete) {
    return 'complete';
  }
  
  // Default: generate response to continue conversation
  return 'generateResponse';
}
```

**Routing Map**:
```typescript
{
  generateResponse: 'generateResponse',  // Continue conversation
  complete: 'complete',                  // Finish and save
  flagForReview: 'flagForReview'         // Manual review needed
}
```

### Graph Compilation and Execution

#### Compilation
```typescript
private buildGraph() {
  const workflow = new StateGraph(GraphState)
    // ... nodes and edges ...
  
  return workflow.compile({ checkpointer: this.checkpointer });
}
```

**What happens during compilation**:
1. Validates graph structure (all nodes connected)
2. Sets up checkpointing with MemorySaver
3. Creates executable graph object
4. Prepares state reducers

#### Execution
```typescript
const result = await this.graph.invoke(
  { messages: [new HumanMessage(message)] },
  { configurable: { thread_id: sessionId } }
);
```

**Execution steps**:
1. **State Initialization**: Merges input with defaults
2. **Checkpoint Load**: Loads previous state for thread_id (if exists)
3. **Node Execution**: Executes nodes in sequence
4. **State Updates**: Merges each node's return value
5. **Checkpoint Save**: Saves state after each node
6. **Routing**: Evaluates conditional edges
7. **Completion**: Returns final state

### MemorySaver and Checkpointing

#### Checkpointing Behavior

**Automatic Checkpointing**:
- State saved after **each node execution**
- Stored with `thread_id` as key
- Enables state retrieval and resumption

**State Retrieval**:
```typescript
const state = await this.graph.getState({
  configurable: { thread_id: sessionId }
});

console.log(state.values.extractedData);
console.log(state.values.messages);
```

**State Update**:
```typescript
await this.graph.updateState(
  { configurable: { thread_id: sessionId } },
  {
    extractedData: { typeSinistre: 'accident' },
    missingInfo: ['dateSinistre', ...]
  }
);
```

**MemorySaver Limitations**:
- **In-memory only**: State lost on application restart
- For production, use persistent checkpointers (PostgreSQL, MongoDB, etc.)

### Error Handling in Nodes

Nodes can return error states:

```typescript
// In extract node
if (dateValidation.isFuture) {
  return {
    extractedData: {},
    missingInfo: SINISTRE_FIELDS_ORDER,
    error: 'future_date',
    errorMessage: 'Date cannot be in the future',
  };
}
```

**Error Flow**:
1. Node returns error state
2. Error propagates through graph
3. `generateResponse` node handles error
4. Returns user-friendly error message
5. State preserved for retry

### LangGraph Best Practices Used

1. **Partial State Updates**: Nodes return only changed fields
2. **Reducer Design**: Appropriate reducers for each field type
3. **Type Safety**: TypeScript types for state and nodes
4. **Async Nodes**: All nodes are async for API calls
5. **Error Handling**: Errors returned in state, not thrown
6. **State Preservation**: Active conversations preserved
7. **Modularity**: Each node is a separate, testable function

---

## Core Components

### 1. Language Detection

**Method**: `detectLanguage(text: string): Language`

Detects language from text using:
- **Arabic**: Unicode range `\u0600-\u06FF`
- **English/French**: Keyword matching with scoring
- **Default**: French

**Keywords**:
- English: claim, accident, insurance, quote, policy, etc.
- French: bonjour, devis, assurance, sinistre, accident, etc.

### 2. Intent Classification

**Method**: `classifyIntent(state: GraphState.State)`

Uses AI to classify conversation type:
- **Sinistre Types**: `sinistre_auto`, `sinistre_habitation`
- **Devis Types**: `devis_auto`, `devis_habitation`, `devis_sante`, `devis_scolaire`, `devis_bateau`, `devis_catnat`, `devis_mrp`
- **Other**: `question`, `non_insurance`, `idle`

**Preservation Logic**: Maintains active conversation type if data collection is in progress.

### 3. Data Extraction

#### Sinistre Extraction (`extractOrderedInformation`)

**Ordered Fields**:
1. `typeSinistre`: Type of claim (accident, feu, vol, endommage d'eau, autre_type)
2. `dateSinistre`: Date (YYYY-MM-DD format, validated)
3. `heureSinistre`: Time (HH:MM format, validated for today's date)
4. `lieuSinistre`: Location (validated with geocoding)
5. `descriptionIncident`: Detailed description
6. `partiesEndommagees`: Damaged parts/areas (merged from text + images)
7. `photos`: Photo count or "non_provided"

**Special Features**:
- Automatic damaged parts extraction from images
- Date validation (no future dates)
- Time validation for today's date (no future times)
- Location validation with geocoding
- Photo requirement enforcement

#### Devis Extraction (`extractDevisInformation`)

**Fields**:
1. `productType`: Insurance product type (auto, habitation, etc.)
2. `age`: Age (19-100, validated)
3. `codePostal`: Postal code
4. `budget`: Monthly budget (≥30,000 DZD, validated)
5. `vehicleType`: Vehicle type (car, motorcycle, truck) - only for auto products

**Validation**:
- Age: Minimum 19, maximum 100
- Budget: Minimum 30,000 DZD, maximum 1,000,000 DZD
- Product type resolution with synonyms

### 4. Validation Services

#### Date Validation
- **Service**: `DateValidationService`
- **Checks**:
  - Date format validity
  - Future date rejection
  - Today's date acceptance
  - Time validation for today's date

#### Location Validation
- **Service**: `LocationValidationService`
- **Features**:
  - Geocoding validation
  - Address formatting
  - Confidence scoring
  - Multi-language error messages

### 5. Image Analysis

**Method**: `analyzeImage(imageData: ImageData, conversationType: string, sinistreType?: string)`

**Process**:
1. Determines analysis context based on conversation type and sinistre type
2. Generates context-specific prompt
3. Calls OpenAI Vision API
4. Extracts JSON structure from response
5. Parses damaged parts/areas
6. Returns structured analysis

**Context Types**:
- `accident_auto`: Car accident damage
- `vol_auto`: Vehicle theft damage
- `incendie`: Fire damage
- `degat_eau`: Water damage
- `property_accident`: Property accident
- `cambriolage`: Burglary damage
- `other_auto`: Other auto damage

**Output Structure**:
```typescript
{
  filename: string
  analysis: string (full text analysis)
  damagedParts: string[] (or affectedAreas)
  severity: 'minor' | 'moderate' | 'severe' | 'total_loss'
  damageType: string
  estimatedCost: 'low' | 'medium' | 'high'
  urgency: 'low' | 'medium' | 'high' | 'emergency'
  timestamp: string
  buffer: Buffer
  mimetype: string
}
```

**Automatic Integration**: Detected damaged parts are automatically merged into `partiesEndommagees` field.

---

## Conversation Types

### Sinistre (Claims)

#### `sinistre_auto` - Auto Insurance Claims
- **Fields**: typeSinistre, dateSinistre, heureSinistre, lieuSinistre, descriptionIncident, partiesEndommagees, photos
- **Types**: accident, vol, feu, endommage d'eau, autre_type
- **Image Analysis**: Enabled
- **Validation**: Date, time, location

#### `sinistre_habitation` - Home Insurance Claims
- **Fields**: Same as sinistre_auto
- **Types**: accident, vol (cambriolage), feu (incendie), endommage d'eau, autre_type
- **Image Analysis**: Enabled
- **Validation**: Date, time, location

### Devis (Quotes)

#### `devis_auto` - Auto Insurance Quotes
- **Fields**: productType, age, codePostal, budget, vehicleType
- **Vehicle Types**: car, motorcycle, truck
- **Image Analysis**: Disabled

#### `devis_habitation` - Home Insurance Quotes
- **Fields**: productType, age, codePostal, budget
- **Image Analysis**: Disabled

#### `devis_sante` - Health Insurance Quotes
- **Fields**: productType, age, codePostal, budget
- **Image Analysis**: Disabled

#### `devis_scolaire` - School Insurance Quotes
- **Fields**: productType, age, codePostal, budget
- **Image Analysis**: Disabled

#### `devis_bateau` - Boat Insurance Quotes
- **Fields**: productType, age, codePostal, budget
- **Image Analysis**: Disabled

#### `devis_catnat` - Natural Disaster Insurance Quotes
- **Fields**: productType, age, codePostal, budget
- **Image Analysis**: Disabled

#### `devis_mrp` - Professional Multi-Risk Insurance Quotes
- **Fields**: productType, age, codePostal, budget
- **Image Analysis**: Disabled

### Other Types

- **`question`**: General insurance questions
- **`non_insurance`**: Non-insurance related queries (redirected)
- **`idle`**: No active conversation

---

## Data Extraction & Validation

### Field Ordering (Sinistre)

Fields are collected in a specific order to ensure logical flow:

```typescript
SINISTRE_FIELDS_ORDER = [
  'typeSinistre',
  'dateSinistre',
  'heureSinistre',
  'lieuSinistre',
  'descriptionIncident',
  'partiesEndommagees',
  'photos'
]
```

### Date Validation Rules

1. **Format**: Accepts various formats, normalizes to YYYY-MM-DD
2. **Future Dates**: Rejected (except today)
3. **Today's Date**: Accepted
4. **Time Validation**: For today's date, time must not be in the future
5. **Error Messages**: Multi-language support

### Location Validation Rules

1. **Geocoding**: Validates location exists
2. **Formatting**: Returns formatted address
3. **Confidence**: Provides confidence score
4. **Error Handling**: Clear error messages in user's language

### Age Validation (Devis)

- **Minimum**: 19 years
- **Maximum**: 100 years
- **Error Messages**: Language-specific

### Budget Validation (Devis)

- **Minimum**: 30,000 DZD (Algerian Dinar)
- **Maximum**: 1,000,000 DZD
- **Currency**: DZD
- **Error Messages**: Language-specific

### Photo Requirement

- **Required**: Photos are mandatory for sinistre processing
- **Enforcement**: If user declines, agent re-asks with requirement message
- **Tracking**: `userDeclinedPhotos` flag tracks user response

---

## Image Analysis

### Analysis Context

The agent determines analysis context based on:
1. Conversation type (`sinistre_auto`, `sinistre_habitation`)
2. Sinistre type (`accident`, `feu`, `vol`, etc.)

### Prompt Engineering

Each context has a specialized prompt that:
1. Provides French analysis (2-3 sentences)
2. Requires JSON output with specific structure
3. Lists relevant parts/areas for the context
4. Specifies severity levels and damage types

### JSON Extraction

The agent uses multiple strategies to extract JSON:
1. **Code Block**: Looks for ```json blocks
2. **Pattern Matching**: Finds JSON objects with key fields
3. **Text Parsing**: Falls back to regex-based extraction

### Damaged Parts Detection

**Auto Contexts**:
- pare-choc, capot, porte, phare, aile, pare-brise, rétroviseur, coffre, toit, etc.

**Property Contexts**:
- plafond, mur, sol, cave, cuisine, salle de bain, toit, etc.

**Fire Damage**:
- moteur, habitacle, tableau de bord, sièges, câblage, etc.

**Water Damage**:
- plafond, mur, sol, cave, tuyauterie, isolation, etc.

### Automatic Integration

Detected parts from images are automatically:
1. Merged with user-provided parts
2. Added to `partiesEndommagees` field
3. Deduplicated
4. Preserved in state

---

## Language Support

### Supported Languages

1. **French (fr)**: Default language
2. **English (en)**: Full support
3. **Arabic (ar)**: Full support

### Language Detection

Automatic detection based on:
- Unicode ranges (Arabic)
- Keyword matching (English/French)
- Conversation history (preserves detected language)

### Translations

All system messages, prompts, and error messages are translated:
- Field names
- Instructions
- Error messages
- Confirmation prompts
- Insurance type lists

### Language-Specific Features

- **System Prompts**: Language-specific assistant personas
- **Field Translations**: All fields have translations
- **Error Messages**: Language-appropriate error messages
- **Insurance Types**: Translated insurance product names

---

## Session Management

### Session Lifecycle

1. **Creation**: Automatic on first message
2. **Activity Tracking**: Updated on each interaction
3. **Timeout**: 30 minutes of inactivity
4. **Cleanup**: Automatic cleanup every 10 minutes

### Session Data

```typescript
SessionContext {
  threadId: string
  createdAt: Date
  lastActivity: Date
}
```

### Token Tracking

Tracks token usage per session:
- `totalPromptTokens`: Total prompt tokens
- `totalCompletionTokens`: Total completion tokens
- `totalTokens`: Total tokens
- `messageCount`: Number of messages

### Conversation History

- **Storage**: LangGraph MemorySaver (persistent)
- **Retrieval**: `getConversationHistory(sessionId)`
- **Reset**: `resetConversation(sessionId)`

### Message Pruning

- **Threshold**: 20 messages
- **Strategy**: Summarizes old messages, keeps recent 10
- **Summary**: AI-generated conversation summary

---

## Public API Methods

### 1. `processMessage(sessionId, message, userId?)`

Processes a text message through the agent.

**Parameters**:
- `sessionId`: Unique session identifier
- `message`: User message text
- `userId`: Optional user ID for database operations

**Returns**:
```typescript
{
  sessionId: string
  response: string
  language: Language
  conversationType: string
  conversationGoal: string
  extractedData: Record<string, any>
  missingInformation: string[]
  progress: number (0-100)
  currentFieldIndex: number
  totalFields: number
  isComplete: boolean
  needsHumanReview: boolean
  fraudScore: number
  validationResults: Record<string, any>
  recommendedDevis?: any[]
  selectedDevisId?: string
  selectedOrderingNumber?: number
  devisDetails?: any
  devisStep?: string
  error?: { type: string, message: string }
}
```

### 2. `processMessageWithImages(sessionId, message, imageData[], userId?)`

Processes a message with attached images.

**Parameters**:
- `sessionId`: Unique session identifier
- `message`: User message text
- `imageData`: Array of image data objects
- `userId`: Optional user ID

**ImageData Structure**:
```typescript
{
  filename: string
  mimetype: string
  buffer: Buffer
  base64: string
}
```

**Returns**: Same as `processMessage` with additional `imageAnalysis` field.

### 3. `getConversationHistory(sessionId)`

Retrieves conversation history for a session.

**Returns**: LangGraph state object or null.

### 4. `resetConversation(sessionId)`

Resets a conversation to initial state.

**Returns**: `boolean` (success/failure)

### 5. `getSmartSuggestions(sessionId)`

Generates context-aware suggestion messages.

**Returns**: `string[]` (array of suggestion messages)

### 6. `getSessionTokenUsage(sessionId)`

Retrieves token usage statistics for a session.

**Returns**: `TokenUsage` object or null

### 7. `visualizeGraph()`

Generates Mermaid diagram of the graph workflow.

**Returns**: `string` (Mermaid diagram code)

### 8. Helper Methods

- `getSupportedLanguages()`: Returns supported languages
- `getRequiredFieldsForSinistre()`: Returns sinistre field list
- `getRequiredFieldsForDevis(conversationType?)`: Returns devis field list
- `getFieldTranslation(field, language)`: Returns field translation

---

## Error Handling

### Error Types

1. **`future_date`**: Date is in the future
2. **`invalid_date`**: Invalid date format
3. **`invalid_time`**: Invalid time format
4. **`future_time`**: Time is in the future for today's date
5. **`invalid_location`**: Location validation failed
6. **`invalid_age`**: Age validation failed (devis)
7. **`invalid_budget`**: Budget validation failed (devis)
8. **`UNKNOWN_ERROR`**: Generic error

### Error Message Generation

- **Language-specific**: Error messages in user's language
- **Context-aware**: Includes relevant details
- **User-friendly**: Clear and actionable

### Error Recovery

- **State Preservation**: Errors don't reset conversation
- **Retry Logic**: User can correct and retry
- **Clear Feedback**: Specific error messages guide correction

### API Error Handling

- **Quota Errors**: Service unavailable message
- **Rate Limits**: Wait message
- **Authentication**: Contact support message
- **Network**: Connection issue message
- **Timeout**: Retry message

---

## Configuration

### Constants

```typescript
SESSION_TIMEOUT = 30 * 60 * 1000 // 30 minutes
MAX_CONVERSATION_MESSAGES = 20
MAX_IMAGES_IN_STATE = 5
```

### Field Orders

```typescript
SINISTRE_FIELDS_ORDER = [
  'typeSinistre',
  'dateSinistre',
  'heureSinistre',
  'lieuSinistre',
  'descriptionIncident',
  'partiesEndommagees',
  'photos'
]

DEVIS_FIELDS_ORDER = [
  'productType',
  'age',
  'codePostal',
  'budget',
  'vehicleType' // Optional for auto devis
]
```

### Insurance Types

7 insurance product types supported:
1. Assurance automobile
2. Assurance automobile avec option de paiement fractionné
3. Assurance habitation
4. Assurance scolaire
5. Assurance bateau de plaisance
6. Assurance catastrophes naturelles (CAT-NAT)
7. Assurance multirisques professionnelle (MRP)

### Validation Rules

- **Age**: 19-100 years
- **Budget**: 30,000 - 1,000,000 DZD
- **Date**: No future dates (today acceptable)
- **Time**: No future times for today's date
- **Location**: Must be geocodable

---

## Usage Examples

### Example 1: Basic Sinistre Declaration

```typescript
// First message
const result1 = await aiService.processMessage(
  'session-123',
  'Bonjour, j\'ai eu un accident de voiture',
  'user-456'
);
// Result: Agent asks for type of claim

// Second message
const result2 = await aiService.processMessage(
  'session-123',
  'C\'était un accident',
  'user-456'
);
// Result: Agent asks for date

// Continue conversation...
```

### Example 2: Sinistre with Images

```typescript
const imageData = [{
  filename: 'damage.jpg',
  mimetype: 'image/jpeg',
  buffer: imageBuffer,
  base64: base64String
}];

const result = await aiService.processMessageWithImages(
  'session-123',
  'Voici les photos des dégâts',
  imageData,
  'user-456'
);
// Result: Images analyzed, damaged parts extracted automatically
```

### Example 3: Devis Request

```typescript
// First message
const result1 = await aiService.processMessage(
  'session-789',
  'Je veux un devis pour une assurance auto',
  'user-456'
);
// Result: Agent asks for age

// Continue collecting: age, postal code, budget, vehicle type
// Result: Quotes generated and presented
```

### Example 4: Get Conversation History

```typescript
const history = await aiService.getConversationHistory('session-123');
console.log(history.values.extractedData);
console.log(history.values.missingInfo);
```

### Example 5: Reset Conversation

```typescript
const success = await aiService.resetConversation('session-123');
// Conversation state reset to initial
```

### Example 6: Get Smart Suggestions

```typescript
const suggestions = await aiService.getSmartSuggestions('session-123');
// Returns context-aware suggestions based on current state
```

---

## Advanced Features

### 1. Conversation Type Preservation

The agent preserves conversation type during active data collection to prevent accidental reclassification when users answer questions.

### 2. Automatic Damaged Parts Detection

When images are provided, damaged parts are automatically detected and merged with user-provided information.

### 3. Photo Requirement Enforcement

If a user declines to provide photos, the agent re-asks with a clear requirement message in their language.

### 4. Multi-step Devis Flow

Devis conversations have three steps:
- `collecting`: Collecting user information
- `showing_options`: Showing recommended quotes
- `showing_details`: Showing details of selected quote

### 5. Fraud Detection

Automatic fraud scoring based on:
- Missing evidence (images, witnesses)
- Claim characteristics (amount, description length)
- Risk indicators

### 6. Policy Validation

Validates insurance policy information before processing claims.

### 7. Context Summarization

Long conversations are automatically summarized to maintain context while reducing token usage.

### 8. Product Type Resolution

Intelligent product type matching with synonyms:
- "voiture", "car", "automobile" → "auto"
- "maison", "home", "habitation" → "habitation"
- etc.

---

## Database Integration

### Sinistre Saving

When a sinistre conversation is completed:
1. Data is extracted from state
2. Images are converted to file format
3. `SinisterService.declareSinister()` is called
4. Sinister ID is returned
5. Completion message includes sinister details

### Devis Integration

Devis conversations:
1. Collect user requirements
2. Call `DevisService.getRecommmendedDevis()` with filters
3. Present quotes to user
4. Allow quote selection and detail viewing
5. Use `DevisService.getDetailsDevis()` for details

---

## Best Practices

### 1. Session Management
- Use unique session IDs per user/conversation
- Don't reuse session IDs across different conversations
- Handle session timeouts gracefully

### 2. Error Handling
- Always check for `error` field in responses
- Provide user-friendly error messages
- Allow users to correct errors

### 3. Image Processing
- Validate image formats before sending
- Limit image count per message
- Handle image analysis failures gracefully

### 4. State Management
- Don't modify state directly
- Use provided methods for state updates
- Reset conversations when starting new flows

### 5. Language Support
- Respect detected language
- Provide translations for all user-facing text
- Handle language switching gracefully

---

## Troubleshooting

### Common Issues

1. **Conversation Type Changes Unexpectedly**
   - Check if active flow preservation logic is working
   - Verify message content doesn't contradict current type

2. **Image Analysis Fails**
   - Check image format and size
   - Verify OpenAI API credentials
   - Check image analysis context selection

3. **Validation Errors**
   - Verify validation service configurations
   - Check date/time format handling
   - Ensure location validation service is accessible

4. **State Not Persisting**
   - Check MemorySaver configuration
   - Verify session ID consistency
   - Check for state reset calls

5. **Token Usage High**
   - Enable message pruning
   - Use conversation summarization
   - Limit message history length

---

## Performance Considerations

### Optimization Strategies

1. **Message Pruning**: Automatically summarizes old messages
2. **Lazy Image Analysis**: Only analyzes images for sinistre conversations
3. **Caching**: Session state cached in memory
4. **Batch Processing**: Multiple images processed sequentially
5. **Token Tracking**: Monitor and optimize token usage

### Scalability

- **Session Isolation**: Each session is independent
- **Stateless Operations**: Core logic is stateless
- **Horizontal Scaling**: Can scale across multiple instances
- **Database Integration**: External services handle persistence

---

## Security Considerations

### Data Privacy

- **User Data**: Stored securely in database
- **Session Data**: Encrypted in transit
- **Image Data**: Processed and stored securely

### Input Validation

- **Message Validation**: All inputs validated
- **Image Validation**: Format and size checks
- **Location Validation**: Geocoding validation
- **Date Validation**: Prevents invalid dates

### Error Information

- **Error Messages**: User-friendly, no sensitive data
- **Logging**: Sensitive data not logged
- **API Errors**: Generic error messages to users

---

## Future Enhancements

### Potential Improvements

1. **Multi-modal Support**: Voice input/output
2. **Advanced Fraud Detection**: ML-based fraud scoring
3. **Real-time Validation**: Instant field validation
4. **Conversation Analytics**: Usage analytics and insights
5. **A/B Testing**: Test different prompt strategies
6. **Custom Workflows**: Configurable conversation flows
7. **Integration APIs**: Webhook support for external systems

---

## Conclusion

The `AiOpenAIService` is a comprehensive conversational AI agent that handles complex insurance-related conversations with multi-language support, intelligent data extraction, image analysis, and robust validation. It provides a seamless user experience while maintaining data integrity and security.

For questions or issues, refer to the code comments or contact the development team.

---

**Last Updated**: 2024
**Version**: 1.0
**Author**: Insurance App Development Team

