import { GgufModelConfig, RamSafetyReport } from '../types/aevyron';

export interface ParsedGgufHeader {
  valid: boolean;
  error?: string;
  version: number;
  tensorCount: number;
  metadataKvCount: number;
  architecture: string;
  modelName: string;
  quantization: string;
  contextLength: number;
  embeddingLength: number;
  blockCount: number;
  supportsVision: boolean;
  supportsAudio: boolean;
  chatTemplate: 'chatml' | 'llama3' | 'gemma2';
}

const GGUF_FILE_TYPE_MAP: Record<number, string> = {
  0: 'F32',
  1: 'F16',
  2: 'Q4_0',
  3: 'Q4_1',
  7: 'Q8_0',
  8: 'Q5_0',
  9: 'Q5_1',
  10: 'Q2_K',
  11: 'Q3_K_S',
  12: 'Q3_K_M',
  13: 'Q3_K_L',
  14: 'Q4_K_S',
  15: 'Q4_K_M',
  16: 'Q5_K_S',
  17: 'Q5_K_M',
  18: 'Q6_K',
  19: 'IQ2_XXS',
};

export function inferQuantizationFromFileName(fileName: string): string {
  const upper = fileName.toUpperCase();
  const patterns = [
    'Q4_K_M', 'Q4_K_S', 'Q5_K_M', 'Q5_K_S', 'Q6_K', 'Q8_0',
    'Q4_0', 'Q4_1', 'Q3_K_M', 'Q2_K', 'IQ4_XS', 'F16', 'BF16'
  ];
  for (const p of patterns) {
    if (upper.includes(p)) return p;
  }
  return 'Q4_K_M';
}

export function inferArchitectureFromFileName(fileName: string): {
  architecture: string;
  supportsVision: boolean;
  supportsAudio: boolean;
  chatTemplate: 'chatml' | 'llama3' | 'gemma2';
} {
  const lower = fileName.toLowerCase();
  const supportsVision =
    lower.includes('llava') ||
    lower.includes('vision') ||
    lower.includes('vl') ||
    lower.includes('minicpm-v') ||
    lower.includes('moondream') ||
    lower.includes('mmproj');
  const supportsAudio =
    lower.includes('whisper') ||
    lower.includes('audio') ||
    lower.includes('qwen2-audio') ||
    lower.includes('ultravox');

  if (lower.includes('gemma')) {
    return { architecture: 'gemma2', supportsVision, supportsAudio, chatTemplate: 'gemma2' };
  }
  if (lower.includes('llama-3') || lower.includes('llama3')) {
    return { architecture: 'llama', supportsVision, supportsAudio, chatTemplate: 'llama3' };
  }
  if (lower.includes('qwen')) {
    return { architecture: 'qwen2', supportsVision, supportsAudio, chatTemplate: 'chatml' };
  }
  if (lower.includes('phi')) {
    return { architecture: 'phi3', supportsVision, supportsAudio, chatTemplate: 'chatml' };
  }
  if (lower.includes('mistral') || lower.includes('ministral')) {
    return { architecture: 'llama', supportsVision, supportsAudio, chatTemplate: 'chatml' };
  }
  if (lower.includes('deepseek')) {
    return { architecture: 'deepseek2', supportsVision, supportsAudio, chatTemplate: 'chatml' };
  }
  return { architecture: 'llama', supportsVision, supportsAudio, chatTemplate: 'chatml' };
}

/**
 * Parses the binary GGUF header from the first slice of a file (e.g. first 64KB - 256KB)
 * without copying the entire multi-gigabyte model file into memory.
 */
export function parseGgufHeader(
  buffer: ArrayBuffer,
  fileName: string,
  fileSizeBytes: number
): ParsedGgufHeader {
  const fallbackMeta = inferArchitectureFromFileName(fileName);
  const fallbackQuant = inferQuantizationFromFileName(fileName);

  if (!fileName.toLowerCase().endsWith('.gguf')) {
    return {
      valid: false,
      error: `Unsupported file extension in "${fileName}". Aevyron requires a valid .gguf model binary.`,
      version: 0,
      tensorCount: 0,
      metadataKvCount: 0,
      architecture: fallbackMeta.architecture,
      modelName: fileName,
      quantization: fallbackQuant,
      contextLength: 2048,
      embeddingLength: 2048,
      blockCount: 24,
      supportsVision: false,
      supportsAudio: false,
      chatTemplate: fallbackMeta.chatTemplate,
    };
  }

  if (buffer.byteLength < 24) {
    return {
      valid: false,
      error: `File "${fileName}" is too small (${buffer.byteLength} bytes) to contain a valid 24-byte GGUF header.`,
      version: 0,
      tensorCount: 0,
      metadataKvCount: 0,
      architecture: fallbackMeta.architecture,
      modelName: fileName,
      quantization: fallbackQuant,
      contextLength: 2048,
      embeddingLength: 2048,
      blockCount: 24,
      supportsVision: false,
      supportsAudio: false,
      chatTemplate: fallbackMeta.chatTemplate,
    };
  }

  const view = new DataView(buffer);
  const m0 = view.getUint8(0);
  const m1 = view.getUint8(1);
  const m2 = view.getUint8(2);
  const m3 = view.getUint8(3);

  // Magic bytes must be 'G', 'G', 'U', 'F' (0x47, 0x47, 0x55, 0x46)
  if (m0 !== 0x47 || m1 !== 0x47 || m2 !== 0x55 || m3 !== 0x46) {
    const hexSig = [m0, m1, m2, m3].map((b) => b.toString(16).padStart(2, '0')).join(' ');
    return {
      valid: false,
      error: `Invalid binary magic signature (0x${hexSig}). Expected 'GGUF' (0x47 0x47 0x55 0x46). The file is corrupted or not a genuine GGUF model.`,
      version: 0,
      tensorCount: 0,
      metadataKvCount: 0,
      architecture: fallbackMeta.architecture,
      modelName: fileName,
      quantization: fallbackQuant,
      contextLength: 2048,
      embeddingLength: 2048,
      blockCount: 24,
      supportsVision: false,
      supportsAudio: false,
      chatTemplate: fallbackMeta.chatTemplate,
    };
  }

  const version = view.getUint32(4, true);
  if (version < 2 || version > 3) {
    return {
      valid: false,
      error: `Unsupported GGUF format version ${version}. llama.cpp runtime requires GGUF v2 or v3.`,
      version,
      tensorCount: 0,
      metadataKvCount: 0,
      architecture: fallbackMeta.architecture,
      modelName: fileName,
      quantization: fallbackQuant,
      contextLength: 2048,
      embeddingLength: 2048,
      blockCount: 24,
      supportsVision: false,
      supportsAudio: false,
      chatTemplate: fallbackMeta.chatTemplate,
    };
  }

  const tensorCount = Number(view.getBigUint64(8, true));
  const metadataKvCount = Number(view.getBigUint64(16, true));

  let architecture = fallbackMeta.architecture;
  let modelName = fileName.replace(/\.gguf$/i, '');
  let quantization = fallbackQuant;
  let contextLength = 4096;
  let embeddingLength = 2048;
  let blockCount = 28;
  let supportsVision = fallbackMeta.supportsVision;
  let supportsAudio = fallbackMeta.supportsAudio;
  let chatTemplate: 'chatml' | 'llama3' | 'gemma2' = fallbackMeta.chatTemplate;

  // Walk binary metadata KV pairs safely within the provided header slice
  let offset = 24;
  const decoder = new TextDecoder('utf-8', { fatal: false });

  const readString = (): string | null => {
    if (offset + 8 > view.byteLength) return null;
    const len = Number(view.getBigUint64(offset, true));
    offset += 8;
    if (len < 0 || len > 65536 || offset + len > view.byteLength) return null;
    const strBytes = new Uint8Array(buffer, offset, len);
    offset += len;
    return decoder.decode(strBytes);
  };

  const skipValue = (valType: number): any => {
    switch (valType) {
      case 0: // UINT8
      case 1: // INT8
      case 7: // BOOL
        if (offset + 1 > view.byteLength) return null;
        const u8 = view.getUint8(offset);
        offset += 1;
        return u8;
      case 2: // UINT16
      case 3: // INT16
        if (offset + 2 > view.byteLength) return null;
        const u16 = view.getUint16(offset, true);
        offset += 2;
        return u16;
      case 4: // UINT32
      case 5: // INT32
      case 6: // FLOAT32
        if (offset + 4 > view.byteLength) return null;
        const u32 = view.getUint32(offset, true);
        offset += 4;
        return u32;
      case 8: // STRING
        return readString();
      case 9: // ARRAY
        if (offset + 12 > view.byteLength) return null;
        const elemType = view.getUint32(offset, true);
        const arrLen = Number(view.getBigUint64(offset + 4, true));
        offset += 12;
        if (arrLen > 10000) {
          offset = view.byteLength;
          return null;
        }
        for (let i = 0; i < arrLen; i++) {
          if (skipValue(elemType) === null) return null;
        }
        return 'array';
      case 10: // UINT64
      case 11: // INT64
      case 12: // FLOAT64
        if (offset + 8 > view.byteLength) return null;
        const u64 = Number(view.getBigUint64(offset, true));
        offset += 8;
        return u64;
      default:
        offset = view.byteLength;
        return null;
    }
  };

  const maxKvsToInspect = Math.min(metadataKvCount, 64);
  for (let i = 0; i < maxKvsToInspect && offset < view.byteLength; i++) {
    const key = readString();
    if (!key || offset + 4 > view.byteLength) break;
    const valType = view.getUint32(offset, true);
    offset += 4;
    const val = skipValue(valType);
    if (val === null) break;

    if (key === 'general.architecture' && typeof val === 'string') {
      architecture = val;
      if (val.includes('clip') || val.includes('llava') || val.includes('qwen2vl')) {
        supportsVision = true;
      }
      if (val.includes('whisper') || val.includes('audio')) {
        supportsAudio = true;
      }
    } else if (key === 'general.name' && typeof val === 'string') {
      modelName = val;
    } else if (key === 'general.file_type' && typeof val === 'number') {
      quantization = GGUF_FILE_TYPE_MAP[val] || quantization;
    } else if (key.endsWith('.context_length') && typeof val === 'number') {
      contextLength = val;
    } else if (key.endsWith('.embedding_length') && typeof val === 'number') {
      embeddingLength = val;
    } else if (key.endsWith('.block_count') && typeof val === 'number') {
      blockCount = val;
    } else if (key === 'tokenizer.ggml.chat_template' && typeof val === 'string') {
      if (val.includes('gemma')) chatTemplate = 'gemma2';
      else if (val.includes('start_header_id') || val.includes('llama3')) chatTemplate = 'llama3';
      else chatTemplate = 'chatml';
    }
  }

  return {
    valid: true,
    version,
    tensorCount,
    metadataKvCount,
    architecture,
    modelName,
    quantization,
    contextLength,
    embeddingLength,
    blockCount,
    supportsVision,
    supportsAudio,
    chatTemplate,
  };
}

/**
 * Evaluates memory requirements on the user's Realme P4 5G (8 GB total LPDDR4X RAM).
 * Android OS + Realme UI + system services reserve ~2,800 MB, leaving ~5,200 MB ceiling
 * before Android's Low Memory Killer (LMKd) terminates background/foreground heavy processes.
 */
export function evaluateRealmeRamSafety(
  fileSizeBytes: number,
  config: GgufModelConfig,
  blockCount = 28,
  embeddingLength = 2048
): RamSafetyReport {
  const deviceTotalRamMb = 8192;
  const deviceUsableBudgetMb = 5120; // 5.0 GB safe user-space native ceiling on 8GB Android

  const weightsMb = Math.max(64, Math.round(fileSizeBytes / (1024 * 1024)));
  // Approximate FP16 KV cache: 2 * layers * embedding * ctx_len * 2 bytes / GQA factor
  const kvCacheMb = Math.max(
    48,
    Math.round((blockCount * embeddingLength * config.contextLength * 0.5) / (1024 * 1024))
  );
  const runtimeOverheadMb = 320 + Math.round(config.batchSize * 0.35);
  const totalEstimatedMb = weightsMb + kvCacheMb + runtimeOverheadMb;

  if (totalEstimatedMb > deviceUsableBudgetMb) {
    return {
      status: 'critical',
      weightsMb,
      kvCacheMb,
      runtimeOverheadMb,
      totalEstimatedMb,
      deviceTotalRamMb,
      deviceUsableBudgetMb,
      summary: `Requires ~${(totalEstimatedMb / 1024).toFixed(2)} GB RAM, which exceeds Realme P4 5G's safe usable native budget (~5.0 GB out of 8 GB total). Even though the file fits on your 256 GB storage, Android LMKd will likely terminate initialization. Use a Q4_K_M model under 3.8 GB (e.g. 1.5B–4B parameters) or lower context length.`,
    };
  }

  if (totalEstimatedMb > 3800) {
    return {
      status: 'warning',
      weightsMb,
      kvCacheMb,
      runtimeOverheadMb,
      totalEstimatedMb,
      deviceTotalRamMb,
      deviceUsableBudgetMb,
      summary: `Requires ~${(totalEstimatedMb / 1024).toFixed(2)} GB RAM on your 8 GB Realme P4 5G. Close background apps before loading and keep context length at or below 2048 tokens to prevent thermal throttling or out-of-memory kills.`,
    };
  }

  return {
    status: 'safe',
    weightsMb,
    kvCacheMb,
    runtimeOverheadMb,
    totalEstimatedMb,
    deviceTotalRamMb,
    deviceUsableBudgetMb,
    summary: `Optimal for Realme P4 5G 8 GB RAM (~${(totalEstimatedMb / 1024).toFixed(2)} GB total footprint including KV cache). Safe for sustained offline arm64-v8a inference.`,
  };
}

/**
 * Generates a genuine spec-compliant GGUF v3 binary header buffer for testing and inspection.
 */
export function buildSampleGgufBuffer(options?: {
  architecture?: string;
  modelName?: string;
  contextLength?: number;
  fileType?: number;
  tensorCount?: number;
}): ArrayBuffer {
  const arch = options?.architecture ?? 'qwen2';
  const name = options?.modelName ?? 'Qwen2.5-1.5B-Instruct-GGUF';
  const ctxLen = options?.contextLength ?? 4096;
  const fileType = options?.fileType ?? 15; // Q4_K_M
  const tensors = options?.tensorCount ?? 291;

  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];

  const pushU32 = (v: number) => {
    const b = new ArrayBuffer(4);
    new DataView(b).setUint32(0, v, true);
    chunks.push(new Uint8Array(b));
  };
  const pushU64 = (v: number) => {
    const b = new ArrayBuffer(8);
    new DataView(b).setBigUint64(0, BigInt(v), true);
    chunks.push(new Uint8Array(b));
  };
  const pushStr = (s: string) => {
    const encoded = encoder.encode(s);
    pushU64(encoded.byteLength);
    chunks.push(encoded);
  };

  // Magic 'GGUF'
  chunks.push(new Uint8Array([0x47, 0x47, 0x55, 0x46]));
  // Version 3
  pushU32(3);
  // Tensor count
  pushU64(tensors);
  // KV count = 4
  pushU64(4);

  // KV 1: general.architecture (STRING = 8)
  pushStr('general.architecture');
  pushU32(8);
  pushStr(arch);

  // KV 2: general.name (STRING = 8)
  pushStr('general.name');
  pushU32(8);
  pushStr(name);

  // KV 3: <arch>.context_length (UINT32 = 4)
  pushStr(`${arch}.context_length`);
  pushU32(4);
  pushU32(ctxLen);

  // KV 4: general.file_type (UINT32 = 4)
  pushStr('general.file_type');
  pushU32(4);
  pushU32(fileType);

  const totalLen = chunks.reduce((acc, c) => acc + c.byteLength, 0);
  const out = new Uint8Array(totalLen);
  let pos = 0;
  for (const c of chunks) {
    out.set(c, pos);
    pos += c.byteLength;
  }
  return out.buffer;
}
