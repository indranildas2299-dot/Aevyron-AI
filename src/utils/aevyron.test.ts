import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSampleGgufBuffer,
  evaluateRealmeRamSafety,
  parseGgufHeader,
} from './ggufParser';
import {
  buildBoundedContextPrompt,
  extractCandidateMemories,
  findDuplicateMemory,
  retrieveRelevantMemories,
} from './memoryPipeline';
import {
  chunkDocumentText,
  evaluateAttachmentCompatibility,
} from './attachmentProcessor';
import {
  applyBackupRestore,
  createVersionedBackup,
  validateBackupJson,
} from './backupManager';
import { ChatMessage, MemoryFact, RegisteredModel } from '../types/aevyron';

test('GGUF parser validates magic bytes and extracts v3 header metadata', () => {
  const buf = buildSampleGgufBuffer({
    architecture: 'qwen2',
    modelName: 'Qwen2.5-1.5B-Instruct-GGUF',
    contextLength: 4096,
    fileType: 15, // Q4_K_M
    tensorCount: 291,
  });

  const parsed = parseGgufHeader(buf, 'Qwen2.5-1.5B-Instruct-Q4_K_M.gguf', 1120 * 1024 * 1024);
  assert.equal(parsed.valid, true);
  assert.equal(parsed.version, 3);
  assert.equal(parsed.tensorCount, 291);
  assert.equal(parsed.architecture, 'qwen2');
  assert.equal(parsed.modelName, 'Qwen2.5-1.5B-Instruct-GGUF');
  assert.equal(parsed.quantization, 'Q4_K_M');
  assert.equal(parsed.contextLength, 4096);
});

test('GGUF parser rejects corrupted or non-GGUF binary headers honestly', () => {
  const fakeBuf = new TextEncoder().encode('NOT_A_GGUF_FILE_HEADER_AT_ALL_12345').buffer;
  const parsed = parseGgufHeader(fakeBuf, 'fake-model.gguf', 1024);
  assert.equal(parsed.valid, false);
  assert.ok(parsed.error?.includes('Invalid binary magic signature'));
});

test('Realme P4 5G 8GB RAM safety analyzer distinguishes safe vs critical models', () => {
  const defaultCfg = {
    contextLength: 2048,
    threadCount: 4,
    batchSize: 256,
    gpuLayers: 0,
    temperature: 0.7,
    maxTokens: 512,
    chatTemplate: 'chatml' as const,
  };

  const safeReport = evaluateRealmeRamSafety(1.2 * 1024 * 1024 * 1024, defaultCfg);
  assert.equal(safeReport.status, 'safe');

  const criticalReport = evaluateRealmeRamSafety(6.8 * 1024 * 1024 * 1024, defaultCfg);
  assert.equal(criticalReport.status, 'critical');
  assert.ok(criticalReport.summary.includes('Realme P4 5G'));
});

test('Memory pipeline detects duplicates, extracts candidate facts, and bounds context window', () => {
  const existingFacts: MemoryFact[] = [
    {
      id: 'mem-1',
      content: 'My primary device is a Realme P4 5G with 8 GB RAM and 256 GB storage',
      category: 'Personal',
      tags: ['device', 'realme'],
      createdAt: 1000,
      updatedAt: 1000,
    },
    {
      id: 'mem-2',
      content: 'Always provide concise Kotlin and C++ JNI examples without cloud APIs',
      category: 'Instruction',
      tags: ['kotlin', 'jni'],
      createdAt: 2000,
      updatedAt: 2000,
    },
  ];

  const dup = findDuplicateMemory(
    'My primary device is a Realme P4 5G with 8 GB RAM',
    existingFacts
  );
  assert.ok(dup !== null);
  assert.equal(dup?.id, 'mem-1');

  const candidates = extractCandidateMemories(
    'Please remember that I prefer dark themes with teal accents. Also my medical record pin is 9981.',
    existingFacts,
    'conv-1'
  );
  assert.equal(candidates.length, 2);
  assert.equal(candidates[0].isSensitive, false);
  assert.equal(candidates[1].isSensitive, true);

  const retrieved = retrieveRelevantMemories('How does JNI work on my Realme phone?', existingFacts, 2);
  assert.equal(retrieved.length, 2);

  const messages: ChatMessage[] = Array.from({ length: 20 }, (_, i) => ({
    id: `m-${i}`,
    conversationId: 'c-1',
    role: i % 2 === 0 ? 'user' : 'assistant',
    content: `Turn ${i}: ` + 'Detailed offline inference discussion '.repeat(12),
    createdAt: 1000 + i,
    attachments: [],
  }));

  const bounded = buildBoundedContextPrompt({
    systemInstructions: 'You are Aevyron.',
    memories: retrieved,
    messages,
    chatTemplate: 'chatml',
    maxContextTokens: 512,
  });

  assert.ok(bounded.estimatedPromptTokens <= 512);
  assert.ok(bounded.truncatedMessageCount > 0);
  assert.ok(bounded.formattedPrompt.includes('[Confirmed Personal Memory Vault'));
});

test('Attachment processor reports honest capability limits for text-only vs vision GGUF models', () => {
  const textOnlyModel: RegisteredModel = {
    id: 'mod-1',
    fileName: 'Qwen2.5-1.5B-Instruct-Q4_K_M.gguf',
    fileSizeBytes: 1120000000,
    format: 'GGUF v3',
    ggufVersion: 3,
    tensorCount: 291,
    metadataKvCount: 24,
    architecture: 'qwen2',
    modelName: 'Qwen2.5-1.5B-Instruct',
    quantization: 'Q4_K_M',
    nativeContextMax: 4096,
    embeddingLength: 1536,
    blockCount: 28,
    supportsVision: false,
    supportsAudio: false,
    status: 'loaded',
    loadProgress: 100,
    config: {
      contextLength: 2048,
      threadCount: 4,
      batchSize: 256,
      gpuLayers: 0,
      temperature: 0.7,
      maxTokens: 512,
      chatTemplate: 'chatml',
    },
    ramSafety: {
      status: 'safe',
      weightsMb: 1068,
      kvCacheMb: 84,
      runtimeOverheadMb: 410,
      totalEstimatedMb: 1562,
      deviceTotalRamMb: 8192,
      deviceUsableBudgetMb: 5120,
      summary: 'Safe',
    },
    uriReference: 'content://com.android.providers.downloads.documents/document/101',
    persistedPermission: true,
    addedAt: 1000,
  };

  const imgCheck = evaluateAttachmentCompatibility('image', 'photo.jpg', 'image/jpeg', textOnlyModel);
  assert.equal(imgCheck.compatibilityStatus, 'unsupported');
  assert.ok(imgCheck.compatibilityNote.includes('text-only GGUF model'));

  const docCheck = evaluateAttachmentCompatibility('document', 'notes.md', 'text/markdown', textOnlyModel);
  assert.equal(docCheck.compatibilityStatus, 'supported');

  const chunked = chunkDocumentText('A'.repeat(6000), 2000, 2);
  assert.equal(chunked.chunkCount, 2);
  assert.equal(chunked.wasTruncated, true);
});

test('Backup manager exports, validates, and merges versioned backups with duplicate resolution', () => {
  const backup = createVersionedBackup({
    memories: [
      {
        id: 'm1',
        content: 'Created by Indranil Officals',
        category: 'Personal',
        tags: ['credit'],
        createdAt: 100,
        updatedAt: 100,
      },
    ],
    memorySuggestions: [],
    conversations: [
      {
        id: 'c1',
        title: 'Offline GGUF Test',
        systemInstructions: 'Be concise.',
        selectedModelId: null,
        isArchived: false,
        createdAt: 100,
        updatedAt: 100,
      },
    ],
    messages: [],
    models: [],
    appearance: {
      themeMode: 'dark',
      accentColor: 'teal',
      bubbleStyle: 'modern',
      bubbleOpacity: 92,
      wallpaperDataUrl: null,
      wallpaperName: null,
      wallpaperFit: 'cover',
      wallpaperDimming: 65,
      autoMemorySuggestions: true,
      confirmSensitiveMemories: true,
      runtimeMode: 'local-engine',
      localServerUrl: 'http://127.0.0.1:8080',
    },
    includeAttachments: false,
  });

  const raw = JSON.stringify(backup);
  const validation = validateBackupJson(raw);
  assert.equal(validation.valid, true);
  assert.equal(validation.summary?.memoriesCount, 1);

  const restored = applyBackupRestore({
    existingMemories: [
      {
        id: 'm1',
        content: 'Created by Indranil Officals',
        category: 'Personal',
        tags: ['credit'],
        createdAt: 100,
        updatedAt: 100,
      },
    ],
    existingConversations: [],
    existingMessages: [],
    backup: validation.payload!,
    strategy: 'merge-skip-duplicates',
  });

  assert.equal(restored.memories.length, 1);
  assert.equal(restored.skippedDuplicates, 1);
  assert.equal(restored.addedConversations, 1);
});

test('Offline Bilingual Engine chats in Bengali (বাংলা), Banglish, and English without any API key', async () => {
  const {
    shouldRespondInBengali,
    evaluateOfflineMath,
    generateOfflineBilingualResponse,
  } = await import('./offlineBilingualEngine');
  const { INITIAL_MODELS, INITIAL_MEMORIES } = await import('./storageVault');

  // 1. Detects Bengali Unicode, Banglish, and explicit requests
  assert.equal(shouldRespondInBengali('হ্যালো! তুমি কেমন আছো?', 'auto'), true);
  assert.equal(shouldRespondInBengali('Tumi kemon acho bhai?', 'auto'), true);
  assert.equal(shouldRespondInBengali('Can you talk in Bengali?', 'auto'), true);
  assert.equal(shouldRespondInBengali('Hello there', 'bn'), true);

  // 2. Evaluates math in both English and Bengali digits offline
  const math1 = evaluateOfflineMath('What is 25 * 16 + 40?');
  assert.equal(math1?.result, 440);
  const mathBn = evaluateOfflineMath('২৪০০ এর ১৫% কত?');
  assert.equal(mathBn?.result, 360);

  // 3. Generates fluent Bengali responses offline with zero API keys
  const bnReply = generateOfflineBilingualResponse({
    userPrompt: 'তুমি কেমন আছো?',
    activeModel: INITIAL_MODELS[0],
    retrievedMemories: INITIAL_MEMORIES,
    history: [],
    attachments: [],
    languagePreference: 'auto',
  });
  assert.ok(/[\u0980-\u09FF]/.test(bnReply));
  assert.ok(bnReply.includes('Realme P4 5G'));

  // 4. Extracts Bengali personal memory facts
  const bnMemories = extractCandidateMemories('মনে রেখো আমার নাম ইন্দ্রনীল দাস।', INITIAL_MEMORIES);
  assert.equal(bnMemories.length, 1);
  assert.ok(bnMemories[0].content.includes('ইন্দ্রনীল'));
});

test('Wikipedia service extracts English and Bengali topics and formats media cards', async () => {
  const {
    extractWikipediaTopicQuery,
    formatWikipediaGroundedResponse,
  } = await import('./wikipediaService');

  const enQuery = extractWikipediaTopicQuery(
    'Tell me about Solar System and send images and videos from Wikipedia'
  );
  assert.equal(enQuery.shouldQuery, true);
  assert.equal(enQuery.topic, 'Solar System');
  assert.equal(enQuery.preferBengali, false);

  const bnQuery = extractWikipediaTopicQuery('রবীন্দ্রনাথ ঠাকুর সম্পর্কে তথ্য ও ছবি দাও');
  assert.equal(bnQuery.shouldQuery, true);
  assert.equal(bnQuery.topic, 'রবীন্দ্রনাথ ঠাকুর');
  assert.equal(bnQuery.preferBengali, true);

  const casual = extractWikipediaTopicQuery('Hi, how are you?');
  assert.equal(casual.shouldQuery, false);

  const formatted = formatWikipediaGroundedResponse(
    {
      title: 'Solar System',
      language: 'en',
      extract: 'The Solar System is the gravitationally bound system of the Sun and the objects that orbit it.',
      articleUrl: 'https://en.wikipedia.org/wiki/Solar_System',
      images: [
        {
          id: 'img-1',
          type: 'image',
          title: 'Solar System True Color',
          url: 'https://upload.wikimedia.org/sample.png',
          thumbUrl: 'https://upload.wikimedia.org/sample.png',
          mimeType: 'image/png',
          sourcePageUrl: 'https://commons.wikimedia.org',
        },
      ],
      videos: [
        {
          id: 'vid-1',
          type: 'video',
          title: 'Solar System Resource Page',
          url: 'https://upload.wikimedia.org/sample.webm',
          thumbUrl: 'https://upload.wikimedia.org/sample.jpg',
          mimeType: 'video/webm',
          sourcePageUrl: 'https://commons.wikimedia.org',
        },
      ],
      fetchedAt: Date.now(),
    },
    false
  );
  assert.ok(formatted.includes('Solar System'));
  assert.ok(formatted.includes('1 image(s)'));
  assert.ok(formatted.includes('1 video(s)'));
});


