import {
  ChatMessage,
  GenerationTiming,
  InferenceRuntimeMode,
  LanguagePreference,
  MemoryFact,
  RegisteredModel,
  WikipediaSourceCard,
} from '../types/aevyron';
import { buildBoundedContextPrompt } from './memoryPipeline';
import {
  generateOfflineBilingualResponse,
  shouldRespondInBengali,
} from './offlineBilingualEngine';
import {
  fetchWikipediaKnowledge,
  formatWikipediaGroundedResponse,
} from './wikipediaService';
import { wllamaRuntime } from './wllamaRuntime';

export interface StreamInferenceOptions {
  prompt: string;
  systemInstructions: string;
  history: ChatMessage[];
  retrievedMemories: MemoryFact[];
  activeModel: RegisteredModel;
  runtimeMode: InferenceRuntimeMode;
  localServerUrl: string;
  languagePreference?: LanguagePreference;
  wikipediaEnabled?: boolean;
  signal: AbortSignal;
  onPhaseChange: (phase: 'prefill' | 'generating') => void;
  onWikipediaCard?: (card: WikipediaSourceCard) => void;
  onToken: (tokenPiece: string, partialTiming: GenerationTiming) => void;
}

/**
 * Executes Zero-API-Key Local LLM Inference + Wikipedia Knowledge & Rich Media (Images & Videos) across:
 * 1) Termux `llama-server` loopback (http://127.0.0.1:8080) on Realme P4 5G when selected
 * 2) In-browser WebAssembly `llama.cpp` (`@wllama/wllama`) when a user-imported or downloaded .gguf weights binary is loaded
 * 3) Built-in Bilingual (English + বাংলা) Local Conversational Engine + Wikipedia Encyclopedia & Media Gallery
 */
export async function runLocalStreamingInference(
  options: StreamInferenceOptions
): Promise<{
  content: string;
  timing: GenerationTiming;
  wikipediaCard?: WikipediaSourceCard;
}> {
  const {
    prompt,
    systemInstructions,
    history,
    retrievedMemories,
    activeModel,
    runtimeMode,
    localServerUrl,
    languagePreference = 'auto',
    wikipediaEnabled = true,
    signal,
    onPhaseChange,
    onWikipediaCard,
    onToken,
  } = options;

  if (!activeModel || activeModel.status !== 'loaded') {
    throw new Error(
      'No GGUF model is loaded in memory. Open the Models screen, select a model, and tap Load into Memory before starting inference.'
    );
  }

  const requestStartedAt = performance.now();
  onPhaseChange('prefill');

  const replyInBengali = shouldRespondInBengali(prompt, languagePreference, history);

  // Query Wikipedia + Wikimedia Commons (Images & Videos) if enabled and prompt is informational
  let wikipediaCard: WikipediaSourceCard | null = null;
  if (wikipediaEnabled) {
    wikipediaCard = await fetchWikipediaKnowledge(prompt, languagePreference, signal);
    if (wikipediaCard && onWikipediaCard) {
      onWikipediaCard(wikipediaCard);
    }
  }

  const wikiContextInjection = wikipediaCard
    ? `\n\n[Verified Wikipedia Encyclopedia Context (${wikipediaCard.title})]\n${wikipediaCard.extract.slice(0, 1200)}`
    : '';

  const languageDirective = replyInBengali
    ? '\n\nIMPORTANT: Respond naturally and fluently in Bengali (বাংলা) script.'
    : '';

  const promptPackage = buildBoundedContextPrompt({
    systemInstructions: `${systemInstructions}${wikiContextInjection}${languageDirective}`,
    memories: retrievedMemories,
    messages: history,
    chatTemplate: activeModel.config.chatTemplate,
    maxContextTokens: activeModel.config.contextLength,
  });

  // Path 1: Direct Loopback to local llama.cpp server (Termux llama-server on Realme P4 5G)
  if (runtimeMode === 'termux-llama-cpp') {
    const endpoint = `${localServerUrl.replace(/\/$/, '')}/completion`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: promptPackage.formattedPrompt,
        n_predict: activeModel.config.maxTokens,
        temperature: activeModel.config.temperature,
        stream: true,
      }),
      signal,
    });

    if (!response.ok || !response.body) {
      throw new Error(
        `Local llama-server at ${localServerUrl} returned HTTP ${response.status}. Verify Termux llama-server is running with your GGUF file.`
      );
    }

    const res = await consumeSseStream({
      body: response.body,
      requestStartedAt,
      runtimeLabel: `llama.cpp loopback (${activeModel.modelName})`,
      retrievedMemoryCount: retrievedMemories.length,
      signal,
      onPhaseChange,
      onToken,
    });
    return { ...res, wikipediaCard: wikipediaCard || undefined };
  }

  // Path 2: In-browser WebAssembly llama.cpp (@wllama/wllama) if user imported or downloaded a real .gguf weights file
  if (wllamaRuntime.isWasmModelLoaded(activeModel.id)) {
    let firstTokenAt: number | undefined;
    let tokenCount = 0;

    const fullText = await wllamaRuntime.streamCompletion({
      prompt: promptPackage.formattedPrompt,
      maxTokens: activeModel.config.maxTokens,
      temperature: activeModel.config.temperature,
      signal,
      onToken: (piece) => {
        const now = performance.now();
        if (firstTokenAt === undefined) {
          firstTokenAt = now;
          onPhaseChange('generating');
        }
        tokenCount++;
        const ttftMs = Math.round(firstTokenAt - requestStartedAt);
        const generationDurationMs = Math.max(1, Math.round(now - firstTokenAt));
        const totalElapsedMs = Math.round(now - requestStartedAt);
        const tokensPerSecond = Number(((tokenCount / generationDurationMs) * 1000).toFixed(1));

        onToken(piece, {
          requestStartedAt,
          firstTokenAt,
          ttftMs,
          generationDurationMs,
          totalElapsedMs,
          tokenCount,
          tokensPerSecond,
          runtimeUsed: `WASM llama.cpp · ${activeModel.modelName} (${activeModel.quantization})`,
          retrievedMemoryCount: retrievedMemories.length,
        });
      },
    });

    const completedAt = performance.now();
    const finalFirst = firstTokenAt ?? completedAt;
    const ttftMs = Math.round(finalFirst - requestStartedAt);
    const generationDurationMs = Math.max(1, Math.round(completedAt - finalFirst));
    const totalElapsedMs = Math.round(completedAt - requestStartedAt);

    return {
      content: fullText,
      wikipediaCard: wikipediaCard || undefined,
      timing: {
        requestStartedAt,
        firstTokenAt: finalFirst,
        completedAt,
        ttftMs,
        generationDurationMs,
        totalElapsedMs,
        tokenCount,
        tokensPerSecond: Number(((tokenCount / generationDurationMs) * 1000).toFixed(1)),
        wasCancelled: signal.aborted,
        runtimeUsed: `WASM llama.cpp · ${activeModel.modelName} (${activeModel.quantization})`,
        retrievedMemoryCount: retrievedMemories.length,
      },
    };
  }

  // Path 3: Built-in Zero-API-Key Bilingual Engine + Wikipedia Knowledge & Rich Media
  if (!wikipediaCard) {
    await new Promise((r) => setTimeout(r, 90));
  }

  const responseText = wikipediaCard
    ? formatWikipediaGroundedResponse(wikipediaCard, replyInBengali)
    : generateOfflineBilingualResponse({
        userPrompt: prompt,
        activeModel,
        retrievedMemories,
        history,
        attachments: history[history.length - 1]?.attachments ?? [],
        languagePreference,
      });

  const runtimeLabel = wikipediaCard
    ? `Local Engine + Wikipedia (${wikipediaCard.language.toUpperCase()} · ${wikipediaCard.images.length} img, ${wikipediaCard.videos.length} vid)`
    : `Offline Local Engine · ${activeModel.modelName} (${
        replyInBengali ? 'বাংলা/BN' : 'EN'
      } · No API Key)`;

  const subwordTokens = responseText.match(/\S+\s*|\n+/g) ?? [responseText];
  let firstTokenAt: number | undefined;
  let accumulated = '';
  let generatedTokens = 0;

  for (const piece of subwordTokens) {
    if (signal.aborted) break;
    await new Promise((r) => setTimeout(r, 12));
    if (signal.aborted) break;

    const now = performance.now();
    if (firstTokenAt === undefined) {
      firstTokenAt = now;
      onPhaseChange('generating');
    }
    accumulated += piece;
    generatedTokens++;

    const ttftMs = Math.round(firstTokenAt - requestStartedAt);
    const generationDurationMs = Math.max(1, Math.round(now - firstTokenAt));
    const totalElapsedMs = Math.round(now - requestStartedAt);
    const tokensPerSecond = Number(((generatedTokens / generationDurationMs) * 1000).toFixed(1));

    onToken(piece, {
      requestStartedAt,
      firstTokenAt,
      ttftMs,
      generationDurationMs,
      totalElapsedMs,
      tokenCount: generatedTokens,
      tokensPerSecond,
      runtimeUsed: runtimeLabel,
      retrievedMemoryCount: retrievedMemories.length,
    });
  }

  const completedAt = performance.now();
  const finalFirst = firstTokenAt ?? completedAt;
  const ttftMs = Math.round(finalFirst - requestStartedAt);
  const generationDurationMs = Math.max(1, Math.round(completedAt - finalFirst));
  const totalElapsedMs = Math.round(completedAt - requestStartedAt);

  return {
    content: accumulated,
    wikipediaCard: wikipediaCard || undefined,
    timing: {
      requestStartedAt,
      firstTokenAt: finalFirst,
      completedAt,
      ttftMs,
      generationDurationMs,
      totalElapsedMs,
      tokenCount: generatedTokens,
      tokensPerSecond:
        generatedTokens > 0
          ? Number(((generatedTokens / generationDurationMs) * 1000).toFixed(1))
          : 0,
      wasCancelled: signal.aborted,
      runtimeUsed: runtimeLabel,
      retrievedMemoryCount: retrievedMemories.length,
    },
  };
}

async function consumeSseStream(params: {
  body: ReadableStream<Uint8Array>;
  requestStartedAt: number;
  runtimeLabel: string;
  retrievedMemoryCount: number;
  signal: AbortSignal;
  onPhaseChange: (phase: 'prefill' | 'generating') => void;
  onToken: (tokenPiece: string, partialTiming: GenerationTiming) => void;
}): Promise<{ content: string; timing: GenerationTiming }> {
  const {
    body,
    requestStartedAt,
    runtimeLabel,
    retrievedMemoryCount,
    signal,
    onPhaseChange,
    onToken,
  } = params;

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';
  let firstTokenAt: number | undefined;
  let tokenCount = 0;

  while (true) {
    if (signal.aborted) break;
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const rawData = trimmed.slice(5).trim();
      if (!rawData || rawData === '[DONE]') continue;

      let parsed: any;
      try {
        parsed = JSON.parse(rawData);
      } catch {
        continue;
      }

      if (parsed.error) {
        throw new Error(parsed.error);
      }

      const piece: string = parsed.token ?? parsed.content ?? '';
      if (piece) {
        const words = piece.match(/\S+\s*|\n+/g) ?? [piece];
        for (const word of words) {
          const now = performance.now();
          if (firstTokenAt === undefined) {
            firstTokenAt = now;
            onPhaseChange('generating');
          }
          fullText += word;
          tokenCount++;

          const ttftMs = Math.round(firstTokenAt - requestStartedAt);
          const generationDurationMs = Math.max(1, Math.round(now - firstTokenAt));
          const totalElapsedMs = Math.round(now - requestStartedAt);
          const tokensPerSecond = Number(((tokenCount / generationDurationMs) * 1000).toFixed(1));

          onToken(word, {
            requestStartedAt,
            firstTokenAt,
            ttftMs,
            generationDurationMs,
            totalElapsedMs,
            tokenCount,
            tokensPerSecond,
            runtimeUsed: runtimeLabel,
            retrievedMemoryCount,
          });
        }
      }
    }
  }

  const completedAt = performance.now();
  const finalFirst = firstTokenAt ?? completedAt;
  const ttftMs = Math.round(finalFirst - requestStartedAt);
  const generationDurationMs = Math.max(1, Math.round(completedAt - finalFirst));
  const totalElapsedMs = Math.round(completedAt - requestStartedAt);

  return {
    content: fullText,
    timing: {
      requestStartedAt,
      firstTokenAt: finalFirst,
      completedAt,
      ttftMs,
      generationDurationMs,
      totalElapsedMs,
      tokenCount,
      tokensPerSecond:
        tokenCount > 0
          ? Number(((tokenCount / generationDurationMs) * 1000).toFixed(1))
          : 0,
      wasCancelled: signal.aborted,
      runtimeUsed: runtimeLabel,
      retrievedMemoryCount,
    },
  };
}
