import { Wllama } from '@wllama/wllama';
import { GgufModelConfig } from '../types/aevyron';

const WASM_PATHS = {
  default: '/wasm/wllama.wasm',
  'single-thread/wllama.wasm': '/wasm/single-thread/wllama.wasm',
  'multi-thread/wllama.wasm': '/wasm/multi-thread/wllama.wasm',
};

class WllamaRuntimeManager {
  private fileBlobs = new Map<string, File>();
  private wllama: Wllama | null = null;
  private loadedModelId: string | null = null;

  registerModelFile(modelId: string, file: File) {
    // Only register as executable WASM GGUF if file contains real tensor weights (> 5 MB)
    if (file.size > 5 * 1024 * 1024) {
      this.fileBlobs.set(modelId, file);
    }
  }

  hasRealWeightsBlob(modelId: string): boolean {
    return this.fileBlobs.has(modelId);
  }

  isWasmModelLoaded(modelId: string): boolean {
    return (
      this.loadedModelId === modelId &&
      this.wllama !== null &&
      this.wllama.isModelLoaded()
    );
  }

  async loadModelBlob(
    modelId: string,
    config: GgufModelConfig,
    onProgress?: (pct: number) => void
  ): Promise<boolean> {
    const file = this.fileBlobs.get(modelId);
    if (!file) return false;

    await this.unload();

    this.wllama = new Wllama(WASM_PATHS, {
      suppressNativeLog: true,
      allowOffline: true,
    });

    await this.wllama.loadModel([file], {
      n_ctx: config.contextLength,
      n_batch: config.batchSize,
      n_threads: Math.min(4, config.threadCount),
      progressCallback: ({ loaded, total }) => {
        if (total > 0 && onProgress) {
          onProgress(Math.min(99, Math.round((loaded / total) * 100)));
        }
      },
    });

    this.loadedModelId = modelId;
    return true;
  }

  async loadModelFromUrl(
    modelId: string,
    ggufUrl: string,
    config: GgufModelConfig,
    onProgress?: (pct: number) => void
  ): Promise<boolean> {
    await this.unload();

    this.wllama = new Wllama(WASM_PATHS, {
      suppressNativeLog: true,
      allowOffline: true,
    });

    await this.wllama.loadModelFromUrl(ggufUrl, {
      n_ctx: config.contextLength,
      n_batch: config.batchSize,
      n_threads: Math.min(4, config.threadCount),
      useCache: true,
      progressCallback: ({ loaded, total }) => {
        if (total > 0 && onProgress) {
          onProgress(Math.min(99, Math.round((loaded / total) * 100)));
        }
      },
    });

    this.loadedModelId = modelId;
    return true;
  }

  async streamCompletion(params: {
    prompt: string;
    maxTokens: number;
    temperature: number;
    signal: AbortSignal;
    onToken: (piece: string) => void;
  }): Promise<string> {
    if (!this.wllama || !this.wllama.isModelLoaded()) {
      throw new Error('WASM llama.cpp model is not loaded.');
    }

    const decoder = new TextDecoder();
    let fullText = '';

    await this.wllama.createCompletion(params.prompt, {
      nPredict: params.maxTokens,
      sampling: {
        temp: params.temperature,
      },
      abortSignal: params.signal,
      onNewToken: (_token, piece) => {
        const str = decoder.decode(piece, { stream: true });
        if (str) {
          fullText += str;
          params.onToken(str);
        }
      },
    });

    return fullText;
  }

  async unload(): Promise<void> {
    if (this.wllama) {
      try {
        await this.wllama.exit();
      } catch {
        // ignore exit error
      }
      this.wllama = null;
      this.loadedModelId = null;
    }
  }
}

export const wllamaRuntime = new WllamaRuntimeManager();
