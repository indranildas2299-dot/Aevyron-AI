import {
  AppearanceSettings,
  ChatMessage,
  Conversation,
  MemoryFact,
  MemorySuggestion,
  RegisteredModel,
} from '../types/aevyron';
import { evaluateRealmeRamSafety } from './ggufParser';

const STORAGE_KEYS = {
  MODELS: 'aevyron_vault_models_v4',
  CONVERSATIONS: 'aevyron_vault_conversations_v4',
  MESSAGES: 'aevyron_vault_messages_v4',
  MEMORIES: 'aevyron_vault_memories_v4',
  SUGGESTIONS: 'aevyron_vault_suggestions_v4',
  APPEARANCE: 'aevyron_vault_appearance_v4',
};

export const DEFAULT_APPEARANCE: AppearanceSettings = {
  themeMode: 'dark',
  accentColor: 'teal',
  bubbleStyle: 'modern',
  bubbleOpacity: 92,
  wallpaperDataUrl: null,
  wallpaperName: null,
  wallpaperFit: 'cover',
  wallpaperDimming: 38,
  autoMemorySuggestions: true,
  confirmSensitiveMemories: true,
  runtimeMode: 'local-engine',
  localServerUrl: 'http://127.0.0.1:8080',
  languagePreference: 'auto',
  voiceAutoSpeak: false,
  wikipediaEnabled: true,
};

const DEFAULT_CONFIG_1_5B = {
  contextLength: 2048,
  threadCount: 4,
  batchSize: 256,
  gpuLayers: 0,
  temperature: 0.7,
  maxTokens: 512,
  chatTemplate: 'chatml' as const,
};

const DEFAULT_CONFIG_3B = {
  contextLength: 2048,
  threadCount: 4,
  batchSize: 256,
  gpuLayers: 0,
  temperature: 0.7,
  maxTokens: 512,
  chatTemplate: 'llama3' as const,
};

const DEFAULT_CONFIG_8B = {
  contextLength: 4096,
  threadCount: 6,
  batchSize: 512,
  gpuLayers: 0,
  temperature: 0.7,
  maxTokens: 512,
  chatTemplate: 'llama3' as const,
};

export const INITIAL_MODELS: RegisteredModel[] = [
  {
    id: 'model-qwen25-1.5b',
    fileName: 'Qwen2.5-1.5B-Instruct-Q4_K_M.gguf',
    fileSizeBytes: 1120 * 1024 * 1024,
    format: 'GGUF v3',
    ggufVersion: 3,
    tensorCount: 291,
    metadataKvCount: 26,
    architecture: 'qwen2',
    modelName: 'Qwen2.5-1.5B-Instruct',
    quantization: 'Q4_K_M',
    nativeContextMax: 32768,
    embeddingLength: 1536,
    blockCount: 28,
    supportsVision: false,
    supportsAudio: false,
    status: 'loaded',
    loadProgress: 100,
    config: DEFAULT_CONFIG_1_5B,
    ramSafety: evaluateRealmeRamSafety(1120 * 1024 * 1024, DEFAULT_CONFIG_1_5B, 28, 1536),
    uriReference: 'content://com.android.providers.downloads.documents/document/Qwen2.5-1.5B-Instruct-Q4_K_M.gguf',
    persistedPermission: true,
    addedAt: Date.now() - 86400000 * 2,
    lastLoadedAt: Date.now() - 3600000,
  },
  {
    id: 'model-llama32-3b',
    fileName: 'Llama-3.2-3B-Instruct-Q4_K_M.gguf',
    fileSizeBytes: 2020 * 1024 * 1024,
    format: 'GGUF v3',
    ggufVersion: 3,
    tensorCount: 255,
    metadataKvCount: 29,
    architecture: 'llama',
    modelName: 'Llama-3.2-3B-Instruct',
    quantization: 'Q4_K_M',
    nativeContextMax: 8192,
    embeddingLength: 3072,
    blockCount: 28,
    supportsVision: false,
    supportsAudio: false,
    status: 'unloaded',
    loadProgress: 0,
    config: DEFAULT_CONFIG_3B,
    ramSafety: evaluateRealmeRamSafety(2020 * 1024 * 1024, DEFAULT_CONFIG_3B, 28, 3072),
    uriReference: 'content://com.android.providers.downloads.documents/document/Llama-3.2-3B-Instruct-Q4_K_M.gguf',
    persistedPermission: true,
    addedAt: Date.now() - 86400000,
  },
  {
    id: 'model-llama31-8b-q6',
    fileName: 'Meta-Llama-3.1-8B-Instruct-Q6_K.gguf',
    fileSizeBytes: 6590 * 1024 * 1024,
    format: 'GGUF v3',
    ggufVersion: 3,
    tensorCount: 291,
    metadataKvCount: 31,
    architecture: 'llama',
    modelName: 'Meta-Llama-3.1-8B-Instruct-Q6_K',
    quantization: 'Q6_K',
    nativeContextMax: 8192,
    embeddingLength: 4096,
    blockCount: 32,
    supportsVision: false,
    supportsAudio: false,
    status: 'unloaded',
    loadProgress: 0,
    config: DEFAULT_CONFIG_8B,
    ramSafety: evaluateRealmeRamSafety(6590 * 1024 * 1024, DEFAULT_CONFIG_8B, 32, 4096),
    uriReference: 'content://com.android.providers.downloads.documents/document/Meta-Llama-3.1-8B-Instruct-Q6_K.gguf',
    persistedPermission: true,
    addedAt: Date.now() - 43200000,
  },
];

export const INITIAL_MEMORIES: MemoryFact[] = [
  {
    id: 'mem-realme-device',
    content: 'Target hardware is my Realme P4 5G with 8 GB RAM and 256 GB storage (arm64-v8a architecture).',
    category: 'Personal',
    tags: ['realme', 'hardware', 'arm64-v8a', '8gb-ram'],
    createdAt: Date.now() - 86400000 * 2,
    updatedAt: Date.now() - 86400000 * 2,
  },
  {
    id: 'mem-creator-brand',
    content: 'Aevyron is Created by Indranil Officals and operates 100% offline without mandatory cloud accounts or paid APIs.',
    category: 'Project',
    tags: ['aevyron', 'indranil', 'offline'],
    createdAt: Date.now() - 86400000,
    updatedAt: Date.now() - 86400000,
  },
  {
    id: 'mem-conservative-ram',
    content: 'Always default to conservative memory settings (n_ctx = 2048, n_threads = 4, n_batch = 256) to prevent Android Low Memory Killer terminations on 8 GB RAM.',
    category: 'Instruction',
    tags: ['llama.cpp', 'memory', 'context'],
    createdAt: Date.now() - 43200000,
    updatedAt: Date.now() - 43200000,
  },
];

export const INITIAL_SUGGESTIONS: MemorySuggestion[] = [
  {
    id: 'sug-initial-1',
    content: 'Prefer zero-copy Android SAF file descriptors (/proc/self/fd) so multi-gigabyte GGUF files are never duplicated in app storage.',
    category: 'Preference',
    reason: 'Detected from recent Android storage architecture configuration',
    isSensitive: false,
    createdAt: Date.now() - 1800000,
  },
];

export const INITIAL_CONVERSATIONS: Conversation[] = [
  {
    id: 'conv-welcome',
    title: 'New Chat',
    systemInstructions:
      'You are Aevyron, a helpful, natural personal AI assistant Created by Indranil Officals. Use facts from the user\'s Personal Memory Vault naturally when relevant.',
    selectedModelId: 'model-qwen25-1.5b',
    isArchived: false,
    createdAt: Date.now() - 60000,
    updatedAt: Date.now() - 60000,
  },
];

export const INITIAL_MESSAGES: ChatMessage[] = [
  {
    id: 'msg-welcome-assistant',
    conversationId: 'conv-welcome',
    role: 'assistant',
    modelId: 'model-qwen25-1.5b',
    modelName: 'Qwen2.5-1.5B-Instruct',
    createdAt: Date.now() - 60000,
    attachments: [],
    timing: {
      requestStartedAt: 100,
      firstTokenAt: 280,
      completedAt: 620,
      ttftMs: 180,
      generationDurationMs: 340,
      totalElapsedMs: 520,
      tokenCount: 42,
      tokensPerSecond: 58.4,
      runtimeUsed: 'Offline Local Engine · Qwen2.5-1.5B-Instruct (No API Key)',
      retrievedMemoryCount: 3,
    },
    content: `Hello! নমস্কার! I'm **Aevyron** (**Created by Indranil Officals**), running **100% offline** with **zero API keys** on your **Realme P4 5G**.

- **English & বাংলা (Bengali)**: You can chat or talk by voice (` + '`🎙️`' + `) in **English**, **বাংলা (Bengali)**, or **Banglish**—or switch the language mode (` + '`Auto / বাংলা / EN`' + `) in the top bar.
- **100% Local LLM**: Powered by on-device WebAssembly \`llama.cpp\` (\`@wllama/wllama\`) for imported \`.gguf\` models plus our built-in offline bilingual conversational engine and **Personal Memory Vault**.

আপনি বাংলা বা ইংরেজি—যেকোনো ভাষায় কথা বলতে পারেন! How can I help you today?`,
  },
];

function safeRead<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function safeWrite<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Handle storage quota limits gracefully
  }
}

export const StorageVault = {
  loadModels: (): RegisteredModel[] => safeRead(STORAGE_KEYS.MODELS, INITIAL_MODELS),
  saveModels: (models: RegisteredModel[]) => safeWrite(STORAGE_KEYS.MODELS, models),

  loadConversations: (): Conversation[] => safeRead(STORAGE_KEYS.CONVERSATIONS, INITIAL_CONVERSATIONS),
  saveConversations: (convs: Conversation[]) => safeWrite(STORAGE_KEYS.CONVERSATIONS, convs),

  loadMessages: (): ChatMessage[] => safeRead(STORAGE_KEYS.MESSAGES, INITIAL_MESSAGES),
  saveMessages: (msgs: ChatMessage[]) => safeWrite(STORAGE_KEYS.MESSAGES, msgs),

  loadMemories: (): MemoryFact[] => safeRead(STORAGE_KEYS.MEMORIES, INITIAL_MEMORIES),
  saveMemories: (memories: MemoryFact[]) => safeWrite(STORAGE_KEYS.MEMORIES, memories),

  loadSuggestions: (): MemorySuggestion[] => safeRead(STORAGE_KEYS.SUGGESTIONS, INITIAL_SUGGESTIONS),
  saveSuggestions: (sugs: MemorySuggestion[]) => safeWrite(STORAGE_KEYS.SUGGESTIONS, sugs),

  loadAppearance: (): AppearanceSettings => safeRead(STORAGE_KEYS.APPEARANCE, DEFAULT_APPEARANCE),
  saveAppearance: (app: AppearanceSettings) => safeWrite(STORAGE_KEYS.APPEARANCE, app),

  clearAllPersonalData: () => {
    Object.values(STORAGE_KEYS).forEach((k) => localStorage.removeItem(k));
  },
};
