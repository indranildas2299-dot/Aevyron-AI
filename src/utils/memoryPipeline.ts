import { ChatMessage, MemoryCategory, MemoryFact, MemorySuggestion } from '../types/aevyron';

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'that', 'this', 'with', 'from', 'have', 'what', 'when',
  'where', 'which', 'about', 'into', 'your', 'please', 'can', 'you', 'will',
  'would', 'could', 'should', 'are', 'was', 'were', 'been', 'being', 'also'
]);

export function tokenizeText(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\u0980-\u09ff\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 2 && !STOP_WORDS.has(token));
}

/**
 * Checks whether a candidate memory fact duplicates an existing confirmed memory fact.
 */
export function findDuplicateMemory(
  candidateContent: string,
  existingFacts: MemoryFact[]
): MemoryFact | null {
  const normCandidate = candidateContent.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!normCandidate) return null;

  const candTokens = new Set(tokenizeText(normCandidate));
  for (const fact of existingFacts) {
    const normExisting = fact.content.trim().toLowerCase().replace(/\s+/g, ' ');
    if (
      normExisting === normCandidate ||
      (normExisting.length > 14 && normCandidate.includes(normExisting)) ||
      (normCandidate.length > 14 && normExisting.includes(normCandidate))
    ) {
      return fact;
    }

    const exTokens = new Set(tokenizeText(normExisting));
    if (candTokens.size >= 3 && exTokens.size >= 3) {
      let intersection = 0;
      for (const t of candTokens) {
        if (exTokens.has(t)) intersection++;
      }
      const union = new Set([...candTokens, ...exTokens]).size;
      if (union > 0 && intersection / union >= 0.72) {
        return fact;
      }
    }
  }
  return null;
}

/**
 * Extracts practical candidate personal memory facts from user messages (English, Bengali, & Banglish)
 * without storing every sentence. Flags potentially sensitive personal details so Aevyron asks for confirmation.
 */
export function extractCandidateMemories(
  userMessage: string,
  existingFacts: MemoryFact[],
  conversationId?: string
): MemorySuggestion[] {
  const suggestions: MemorySuggestion[] = [];
  const sentences = userMessage
    .split(/(?<=[.!?।])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 6 && s.length <= 240);

  const patterns: Array<{
    regex: RegExp;
    category: MemoryCategory;
    reason: string;
  }> = [
    {
      regex: /(?:^|\b)(?:please\s+)?remember\s+(?:that\s+)?(.+)/i,
      category: 'Personal',
      reason: 'Explicit user request to remember a fact',
    },
    {
      regex: /(?:মনে\s*রেখো|মনে\s*রাখবে|মন\s*রেখো)\s+(.+)/i,
      category: 'Personal',
      reason: 'Explicit Bengali request to remember a fact (মনে রেখো)',
    },
    {
      regex: /(?:আমার\s+নাম|আমি\s+হলাম|আমার\s+বাড়ি|আমি\s+থাকি|আমার\s+পেশা)\s+(.+)/i,
      category: 'Personal',
      reason: 'Bengali personal profile fact',
    },
    {
      regex: /(?:আমি\s+.*(?:পছন্দ\s+করি|ভালোবাসি))|(?:আমার\s+পছন্দের\s+.+)/i,
      category: 'Preference',
      reason: 'Stated Bengali personal preference',
    },
    {
      regex: /(?:^|\b)amar\s+(?:naam|name|bari|phone)\s+(.+)/i,
      category: 'Personal',
      reason: 'Banglish personal profile detail',
    },
    {
      regex: /(?:^|\b)i\s+(?:always\s+|really\s+)?(?:prefer|like|use)\s+(.+)/i,
      category: 'Preference',
      reason: 'Stated personal preference',
    },
    {
      regex: /(?:^|\b)my\s+(?:goal|target|objective|aim)\s+is\s+(.+)/i,
      category: 'Goal',
      reason: 'Stated personal goal',
    },
    {
      regex: /(?:^|\b)i\s+am\s+(?:building|working\s+on|developing|creating)\s+(.+)/i,
      category: 'Project',
      reason: 'Active project context',
    },
    {
      regex: /(?:^|\b)(?:always|never)\s+(?:respond|reply|format|use|write|include)\s+(.+)/i,
      category: 'Instruction',
      reason: 'Recurring assistant instruction',
    },
    {
      regex: /(?:^|\b)my\s+(?:[a-z]+\s+){0,2}(?:name|phone|device|location|profession|role|pin|password|address|email|record)\s+is\s+(.+)/i,
      category: 'Personal',
      reason: 'Personal profile or credential detail',
    },
  ];

  const sensitiveRegex = /\b(?:password|pin|ssn|bank|medical|health|address|phone\s*number|salary|secret|private|email)\b|পাসওয়ার্ড|পিন|ব্যাংক|ঠিকানা/i;

  for (const sentence of sentences) {
    for (const rule of patterns) {
      const match = sentence.match(rule.regex);
      if (match) {
        const cleaned = sentence
          .replace(/^(?:please\s+)?remember\s+(?:that\s+)?/i, '')
          .replace(/^(?:মনে\s*রেখো|মনে\s*রাখবে)\s+/i, '')
          .trim();
        const duplicate = findDuplicateMemory(cleaned, existingFacts);
        const isSensitive = sensitiveRegex.test(cleaned);

        suggestions.push({
          id: `sug-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          content: cleaned.charAt(0).toUpperCase() + cleaned.slice(1),
          category: rule.category,
          reason: rule.reason,
          isSensitive,
          duplicateOfId: duplicate?.id,
          sourceConversationId: conversationId,
          createdAt: Date.now(),
        });
        break;
      }
    }
  }

  return suggestions;
}

/**
 * Retrieves relevant confirmed memories for the current question using local keyword + category scoring.
 */
export function retrieveRelevantMemories(
  query: string,
  memories: MemoryFact[],
  maxCount = 6
): MemoryFact[] {
  if (memories.length === 0) return [];
  const queryTokens = new Set(tokenizeText(query));

  const scored = memories.map((fact) => {
    const factTokens = tokenizeText(`${fact.content} ${fact.category} ${fact.tags.join(' ')}`);
    let overlap = 0;
    for (const token of factTokens) {
      if (queryTokens.has(token)) overlap++;
    }
    // Always give recurring Instructions and core Preferences a baseline relevance boost
    const categoryBoost =
      fact.category === 'Instruction'
        ? 2.5
        : fact.category === 'Preference'
        ? 1.5
        : fact.category === 'Project'
        ? 1.0
        : 0.5;

    return {
      fact,
      score: overlap * 3 + categoryBoost,
    };
  });

  scored.sort((a, b) => b.score - a.score || b.fact.updatedAt - a.fact.updatedAt);
  return scored.slice(0, maxCount).map((item) => item.fact);
}

/**
 * Builds a bounded context prompt formatted with the selected model's chat template
 * while keeping total estimated tokens strictly inside the model's context length.
 */
export function buildBoundedContextPrompt(params: {
  systemInstructions: string;
  memories: MemoryFact[];
  messages: ChatMessage[];
  chatTemplate: 'chatml' | 'llama3' | 'gemma2';
  maxContextTokens: number;
}): {
  formattedPrompt: string;
  estimatedPromptTokens: number;
  includedMessageCount: number;
  truncatedMessageCount: number;
} {
  const { systemInstructions, memories, messages, chatTemplate, maxContextTokens } = params;

  const memorySection =
    memories.length > 0
      ? `\n\n[Confirmed Personal Memory Vault — Verified Local Facts]\n` +
        memories.map((m) => `- [${m.category}] ${m.content}`).join('\n')
      : '';

  const fullSystemPrompt = `${systemInstructions.trim()}${memorySection}`.trim();
  // Reserve 25% of context window for generation output
  const inputTokenBudget = Math.max(256, Math.floor(maxContextTokens * 0.75));

  const estimateTokens = (text: string) => Math.max(1, Math.ceil(text.length / 3.8));

  const systemTokens = estimateTokens(fullSystemPrompt) + 16;
  let usedTokens = systemTokens;

  const keptMessages: ChatMessage[] = [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    const attachmentContext = msg.attachments
      .filter((a) => a.extractedText)
      .map((a) => `\n[Attached Document: ${a.name}]\n${a.extractedText}`)
      .join('\n');
    const msgCost = estimateTokens(msg.content + attachmentContext) + 12;

    if (usedTokens + msgCost > inputTokenBudget && keptMessages.length > 0) {
      break;
    }
    keptMessages.unshift(msg);
    usedTokens += msgCost;
  }

  const truncatedMessageCount = Math.max(0, messages.length - keptMessages.length);

  let formattedPrompt = '';
  if (chatTemplate === 'llama3') {
    formattedPrompt += `<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n\n${fullSystemPrompt}<|eot_id|>`;
    for (const m of keptMessages) {
      const docText = m.attachments
        .filter((a) => a.extractedText)
        .map((a) => `\n\n[Attached File: ${a.name}]\n${a.extractedText}`)
        .join('');
      formattedPrompt += `<|start_header_id|>${m.role}<|end_header_id|>\n\n${m.content}${docText}<|eot_id|>`;
    }
    formattedPrompt += `<|start_header_id|>assistant<|end_header_id|>\n\n`;
  } else if (chatTemplate === 'gemma2') {
    formattedPrompt += `<start_of_turn>user\n[System Instructions]\n${fullSystemPrompt}\n\n`;
    keptMessages.forEach((m, idx) => {
      const docText = m.attachments
        .filter((a) => a.extractedText)
        .map((a) => `\n\n[Attached File: ${a.name}]\n${a.extractedText}`)
        .join('');
      if (idx === 0 && m.role === 'user') {
        formattedPrompt += `${m.content}${docText}<end_of_turn>\n`;
      } else {
        const gemmaRole = m.role === 'assistant' ? 'model' : 'user';
        formattedPrompt += `<start_of_turn>${gemmaRole}\n${m.content}${docText}<end_of_turn>\n`;
      }
    });
    formattedPrompt += `<start_of_turn>model\n`;
  } else {
    // Default ChatML
    formattedPrompt += `<|im_start|>system\n${fullSystemPrompt}<|im_end|>\n`;
    for (const m of keptMessages) {
      const docText = m.attachments
        .filter((a) => a.extractedText)
        .map((a) => `\n\n[Attached File: ${a.name}]\n${a.extractedText}`)
        .join('');
      formattedPrompt += `<|im_start|>${m.role}\n${m.content}${docText}<|im_end|>\n`;
    }
    formattedPrompt += `<|im_start|>assistant\n`;
  }

  return {
    formattedPrompt,
    estimatedPromptTokens: usedTokens,
    includedMessageCount: keptMessages.length,
    truncatedMessageCount,
  };
}
