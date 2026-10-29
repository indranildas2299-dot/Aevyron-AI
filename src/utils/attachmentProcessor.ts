import { AttachmentCategory, MessageAttachment, RegisteredModel } from '../types/aevyron';

export function sanitizeTextContent(raw: string): string {
  return raw
    .replace(/\u0000/g, '')
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '[sanitized-script-block]')
    .trim();
}

export function chunkDocumentText(
  rawText: string,
  maxCharsPerChunk = 2400,
  maxTotalChunks = 4
): { boundedText: string; chunkCount: number; wasTruncated: boolean } {
  const clean = sanitizeTextContent(rawText);
  if (!clean) {
    return { boundedText: '', chunkCount: 0, wasTruncated: false };
  }
  const totalChunks = Math.ceil(clean.length / maxCharsPerChunk);
  const includedChunks = Math.min(totalChunks, maxTotalChunks);
  const sliceLen = includedChunks * maxCharsPerChunk;
  const wasTruncated = clean.length > sliceLen;
  const boundedText = wasTruncated
    ? `${clean.slice(0, sliceLen)}\n\n[... Bounded chunking: ${includedChunks}/${totalChunks} chunks included to fit 8 GB RAM phone context window ...]`
    : clean;

  return {
    boundedText,
    chunkCount: includedChunks,
    wasTruncated,
  };
}

/**
 * Evaluates honest attachment compatibility against the active local GGUF model.
 * Never claims a text-only GGUF model can inspect pixels, video frames, or raw audio waveforms.
 */
export function evaluateAttachmentCompatibility(
  category: AttachmentCategory,
  fileName: string,
  mimeType: string,
  activeModel: RegisteredModel | null
): Pick<MessageAttachment, 'compatibilityStatus' | 'compatibilityNote'> {
  const lowerName = fileName.toLowerCase();

  if (category === 'image' || category === 'camera') {
    if (!activeModel) {
      return {
        compatibilityStatus: 'limited',
        compatibilityNote:
          'Image preview attached locally. Load a vision-capable GGUF model (e.g. LLaVA / Qwen2-VL / MiniCPM-V with mmproj) for local visual analysis.',
      };
    }
    if (activeModel.supportsVision) {
      return {
        compatibilityStatus: 'supported',
        compatibilityNote: `Vision projector detected on ${activeModel.modelName}. Image pixels will be passed to the local multimodal encoder.`,
      };
    }
    return {
      compatibilityStatus: 'unsupported',
      compatibilityNote: `Honest Capability Notice: "${activeModel.modelName}" (${activeModel.architecture}) is a text-only GGUF model and cannot see image pixels. Aevyron will attach the image metadata to your conversation without pretending to analyze visual content.`,
    };
  }

  if (category === 'video') {
    if (activeModel?.supportsVision) {
      return {
        compatibilityStatus: 'supported',
        compatibilityNote: `Keyframes extracted locally from "${fileName}" and ready for vision-capable model ${activeModel.modelName}.`,
      };
    }
    return {
      compatibilityStatus: 'unsupported',
      compatibilityNote: `Honest Capability Notice: Keyframe thumbnails were extracted locally on-device, but ${
        activeModel ? `"${activeModel.modelName}" is a text-only GGUF model` : 'no vision GGUF model is loaded'
      }. Arbitrary video understanding is unavailable without a local vision/multimodal projector.`,
    };
  }

  if (category === 'audio') {
    if (activeModel?.supportsAudio) {
      return {
        compatibilityStatus: 'supported',
        compatibilityNote: `Local audio runtime supported by ${activeModel.modelName}.`,
      };
    }
    return {
      compatibilityStatus: 'unsupported',
      compatibilityNote: `Honest Capability Notice: Local audio playback is ready, but standard llama.cpp text GGUF models cannot transcribe audio. Import a dedicated whisper.cpp / Qwen2-Audio model for local transcription.`,
    };
  }

  // Document category
  const readableExts = ['.txt', '.md', '.csv', '.json', '.log', '.xml', '.yaml', '.yml', '.kt', '.py', '.js', '.ts', '.html'];
  const isDirectlyReadable =
    readableExts.some((ext) => lowerName.endsWith(ext)) ||
    mimeType.startsWith('text/') ||
    mimeType.includes('json') ||
    mimeType.includes('csv');

  if (isDirectlyReadable) {
    return {
      compatibilityStatus: 'supported',
      compatibilityNote:
        'Readable text extracted locally in bounded chunks and injected into the local model prompt.',
    };
  }

  if (lowerName.endsWith('.pdf')) {
    return {
      compatibilityStatus: 'limited',
      compatibilityNote:
        'PDF text streams extracted locally in bounded chunks. Scanned/image-only PDF pages require a vision model or OCR.',
    };
  }

  return {
    compatibilityStatus: 'unsupported',
    compatibilityNote: `Binary document format (${mimeType || 'unknown'}) cannot be parsed as plain text locally. File reference is attached without fabricated text analysis.`,
  };
}
