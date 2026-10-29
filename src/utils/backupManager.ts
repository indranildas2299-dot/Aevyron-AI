import {
  AevyronBackupPayload,
  AppearanceSettings,
  ChatMessage,
  Conversation,
  MemoryFact,
  MemorySuggestion,
  RegisteredModel,
} from '../types/aevyron';

export function createVersionedBackup(params: {
  memories: MemoryFact[];
  memorySuggestions: MemorySuggestion[];
  conversations: Conversation[];
  messages: ChatMessage[];
  models: RegisteredModel[];
  appearance: AppearanceSettings;
  includeAttachments: boolean;
}): AevyronBackupPayload {
  const {
    memories,
    memorySuggestions,
    conversations,
    messages,
    models,
    appearance,
    includeAttachments,
  } = params;

  const sanitizedMessages: ChatMessage[] = messages.map((m) => ({
    ...m,
    isStreaming: false,
    attachments: includeAttachments
      ? m.attachments
      : m.attachments.map((att) => ({
          ...att,
          previewDataUrl: undefined,
          videoFramesDataUrls: undefined,
        })),
  }));

  const registeredModelsMetadata = models.map(({ status, loadProgress, ...rest }) => rest);

  return {
    schemaVersion: 'aevyron-backup-v2',
    exportedAt: new Date().toISOString(),
    deviceProfile: 'Realme P4 5G (8 GB RAM / 256 GB Storage — arm64-v8a)',
    createdByCredit: 'Created by Indranil Officals',
    includeAttachments,
    memories,
    memorySuggestions,
    conversations,
    messages: sanitizedMessages,
    registeredModelsMetadata,
    appearance,
  };
}

export function validateBackupJson(rawJson: string): {
  valid: boolean;
  error?: string;
  payload?: AevyronBackupPayload;
  summary?: {
    memoriesCount: number;
    conversationsCount: number;
    messagesCount: number;
    modelsCount: number;
    exportedAt: string;
  };
} {
  try {
    const parsed = JSON.parse(rawJson);
    if (!parsed || typeof parsed !== 'object') {
      return { valid: false, error: 'Backup file does not contain a valid JSON object.' };
    }
    if (parsed.schemaVersion !== 'aevyron-backup-v2') {
      return {
        valid: false,
        error: `Unsupported backup schema version "${parsed.schemaVersion ?? 'unknown'}". Expected "aevyron-backup-v2".`,
      };
    }
    if (!Array.isArray(parsed.memories) || !Array.isArray(parsed.conversations) || !Array.isArray(parsed.messages)) {
      return {
        valid: false,
        error: 'Backup payload is missing required arrays (memories, conversations, or messages).',
      };
    }

    return {
      valid: true,
      payload: parsed as AevyronBackupPayload,
      summary: {
        memoriesCount: parsed.memories.length,
        conversationsCount: parsed.conversations.length,
        messagesCount: parsed.messages.length,
        modelsCount: Array.isArray(parsed.registeredModelsMetadata) ? parsed.registeredModelsMetadata.length : 0,
        exportedAt: parsed.exportedAt || 'Unknown date',
      },
    };
  } catch (err: any) {
    return {
      valid: false,
      error: `Failed to parse JSON backup: ${err?.message || 'Syntax error'}`,
    };
  }
}

export type RestoreConflictStrategy = 'merge-skip-duplicates' | 'merge-overwrite' | 'replace-all';

export function applyBackupRestore(params: {
  existingMemories: MemoryFact[];
  existingConversations: Conversation[];
  existingMessages: ChatMessage[];
  backup: AevyronBackupPayload;
  strategy: RestoreConflictStrategy;
}): {
  memories: MemoryFact[];
  conversations: Conversation[];
  messages: ChatMessage[];
  addedMemories: number;
  addedConversations: number;
  skippedDuplicates: number;
} {
  const { existingMemories, existingConversations, existingMessages, backup, strategy } = params;

  if (strategy === 'replace-all') {
    return {
      memories: [...backup.memories],
      conversations: [...backup.conversations],
      messages: [...backup.messages],
      addedMemories: backup.memories.length,
      addedConversations: backup.conversations.length,
      skippedDuplicates: 0,
    };
  }

  let skippedDuplicates = 0;
  let addedMemories = 0;
  let addedConversations = 0;

  const memoryMap = new Map<string, MemoryFact>();
  for (const m of existingMemories) {
    memoryMap.set(m.id, m);
  }

  for (const incoming of backup.memories) {
    const duplicateByContent = Array.from(memoryMap.values()).find(
      (ex) => ex.content.trim().toLowerCase() === incoming.content.trim().toLowerCase()
    );
    const existingById = memoryMap.get(incoming.id);

    if (existingById || duplicateByContent) {
      if (strategy === 'merge-skip-duplicates') {
        skippedDuplicates++;
        continue;
      } else {
        const targetId = existingById?.id || duplicateByContent!.id;
        memoryMap.set(targetId, { ...incoming, id: targetId });
        addedMemories++;
      }
    } else {
      memoryMap.set(incoming.id, incoming);
      addedMemories++;
    }
  }

  const convMap = new Map<string, Conversation>();
  for (const c of existingConversations) {
    convMap.set(c.id, c);
  }
  for (const incomingConv of backup.conversations) {
    if (convMap.has(incomingConv.id)) {
      if (strategy === 'merge-skip-duplicates') {
        skippedDuplicates++;
      } else {
        convMap.set(incomingConv.id, incomingConv);
        addedConversations++;
      }
    } else {
      convMap.set(incomingConv.id, incomingConv);
      addedConversations++;
    }
  }

  const msgMap = new Map<string, ChatMessage>();
  for (const msg of existingMessages) {
    msgMap.set(msg.id, msg);
  }
  for (const incomingMsg of backup.messages) {
    if (!msgMap.has(incomingMsg.id) || strategy === 'merge-overwrite') {
      msgMap.set(incomingMsg.id, incomingMsg);
    }
  }

  return {
    memories: Array.from(memoryMap.values()).sort((a, b) => b.updatedAt - a.updatedAt),
    conversations: Array.from(convMap.values()).sort((a, b) => b.updatedAt - a.updatedAt),
    messages: Array.from(msgMap.values()).sort((a, b) => a.createdAt - b.createdAt),
    addedMemories,
    addedConversations,
    skippedDuplicates,
  };
}
