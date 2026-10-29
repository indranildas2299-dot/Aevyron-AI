export type NavigationTab = 'chat' | 'memory' | 'models' | 'settings';

export type ModelLoadStatus = 'unloaded' | 'verifying' | 'loading' | 'loaded' | 'error';

export type InferenceRuntimeMode =
  | 'local-engine'      // On-device local GGUF engine & deterministic memory-grounded local processor
  | 'termux-llama-cpp'; // Direct connection to local llama.cpp server (http://127.0.0.1:8080) on Realme P4 5G

export interface GgufModelConfig {
  contextLength: number; // Default 2048 for 8GB RAM phone
  threadCount: number;   // Default 4 for 8-core ARM64
  batchSize: number;     // Default 256
  gpuLayers: number;     // Default 0 (CPU NEON dotprod) or Vulkan layers
  temperature: number;   // Default 0.7
  maxTokens: number;     // Default 512
  chatTemplate: 'chatml' | 'llama3' | 'gemma2';
}

export interface RamSafetyReport {
  status: 'safe' | 'warning' | 'critical';
  weightsMb: number;
  kvCacheMb: number;
  runtimeOverheadMb: number;
  totalEstimatedMb: number;
  deviceTotalRamMb: number;
  deviceUsableBudgetMb: number;
  summary: string;
}

export interface RegisteredModel {
  id: string;
  fileName: string;
  fileSizeBytes: number;
  format: 'GGUF v2' | 'GGUF v3' | 'Invalid';
  ggufVersion: number;
  tensorCount: number;
  metadataKvCount: number;
  architecture: string;
  modelName: string;
  quantization: string;
  nativeContextMax: number;
  embeddingLength: number;
  blockCount: number;
  supportsVision: boolean;
  supportsAudio: boolean;
  status: ModelLoadStatus;
  loadProgress: number; // 0-100
  errorMessage?: string;
  config: GgufModelConfig;
  ramSafety: RamSafetyReport;
  uriReference: string;
  persistedPermission: boolean;
  addedAt: number;
  lastLoadedAt?: number;
}

export type AttachmentCategory = 'image' | 'video' | 'document' | 'audio' | 'camera';

export interface MessageAttachment {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  category: AttachmentCategory;
  previewDataUrl?: string;
  extractedText?: string;
  chunkCount?: number;
  videoFramesDataUrls?: string[];
  durationSeconds?: number;
  compatibilityStatus: 'supported' | 'limited' | 'unsupported';
  compatibilityNote: string;
}

export interface GenerationTiming {
  requestStartedAt: number;
  firstTokenAt?: number;
  completedAt?: number;
  ttftMs: number;               // Time to First Token (waiting phase)
  generationDurationMs: number; // Token streaming phase
  totalElapsedMs: number;       // Total wall time
  tokenCount: number;
  tokensPerSecond: number;
  wasCancelled?: boolean;
  runtimeUsed: string;
  retrievedMemoryCount: number;
}

export interface WikipediaMediaItem {
  id: string;
  type: 'image' | 'video';
  title: string;
  url: string;
  thumbUrl: string;
  mimeType: string;
  sourcePageUrl: string;
  caption?: string;
}

export interface WikipediaSourceCard {
  title: string;
  language: 'en' | 'bn';
  extract: string;
  articleUrl: string;
  thumbnailUrl?: string;
  images: WikipediaMediaItem[];
  videos: WikipediaMediaItem[];
  fetchedAt: number;
  fromOfflineCache?: boolean;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: number;
  updatedAt?: number;
  modelId?: string;
  modelName?: string;
  attachments: MessageAttachment[];
  wikipediaCard?: WikipediaSourceCard;
  timing?: GenerationTiming;
  isStreaming?: boolean;
  isError?: boolean;
}

export interface Conversation {
  id: string;
  title: string;
  systemInstructions: string;
  selectedModelId: string | null;
  isArchived: boolean;
  createdAt: number;
  updatedAt: number;
}

export type MemoryCategory =
  | 'Preference'
  | 'Goal'
  | 'Project'
  | 'Instruction'
  | 'Personal';

export interface MemoryFact {
  id: string;
  content: string;
  category: MemoryCategory;
  tags: string[];
  sourceConversationId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface MemorySuggestion {
  id: string;
  content: string;
  category: MemoryCategory;
  reason: string;
  isSensitive: boolean;
  duplicateOfId?: string;
  sourceConversationId?: string;
  createdAt: number;
}

export type WallpaperFitMode = 'cover' | 'contain' | 'center';

export type LanguagePreference = 'auto' | 'bn' | 'en';

export interface AppearanceSettings {
  themeMode: 'dark' | 'light';
  accentColor: 'teal' | 'sky' | 'amber' | 'rose';
  bubbleStyle: 'modern' | 'compact' | 'high-contrast';
  bubbleOpacity: number; // 75 - 100
  wallpaperDataUrl: string | null;
  wallpaperName: string | null;
  wallpaperFit: WallpaperFitMode;
  wallpaperDimming: number; // 20 - 85%
  autoMemorySuggestions: boolean;
  confirmSensitiveMemories: boolean;
  runtimeMode: InferenceRuntimeMode;
  localServerUrl: string;
  languagePreference?: LanguagePreference;
  voiceAutoSpeak?: boolean;
  wikipediaEnabled?: boolean;
}

export interface AevyronBackupPayload {
  schemaVersion: 'aevyron-backup-v2';
  exportedAt: string;
  deviceProfile: string;
  createdByCredit: 'Created by Indranil Officals';
  includeAttachments: boolean;
  memories: MemoryFact[];
  memorySuggestions: MemorySuggestion[];
  conversations: Conversation[];
  messages: ChatMessage[];
  registeredModelsMetadata: Omit<RegisteredModel, 'status' | 'loadProgress'>[];
  appearance: AppearanceSettings;
}
