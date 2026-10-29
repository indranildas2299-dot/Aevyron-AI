import React, { useRef } from 'react';
import {
  Camera,
  FileText,
  Film,
  Image as ImageIcon,
  Music,
  Sparkles,
  X,
} from 'lucide-react';
import {
  AttachmentCategory,
  MessageAttachment,
  RegisteredModel,
} from '../types/aevyron';
import {
  chunkDocumentText,
  evaluateAttachmentCompatibility,
} from '../utils/attachmentProcessor';

interface AttachmentSheetProps {
  isOpen: boolean;
  onClose: () => void;
  activeModel: RegisteredModel | null;
  onAddAttachments: (newAttachments: MessageAttachment[]) => void;
}

export const AttachmentSheet: React.FC<AttachmentSheetProps> = ({
  isOpen,
  onClose,
  activeModel,
  onAddAttachments,
}) => {
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const extractVideoFramePreview = (file: File): Promise<{ frameUrl?: string; duration?: number }> => {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.muted = true;
      video.playsInline = true;
      video.src = url;

      const cleanup = () => {
        URL.revokeObjectURL(url);
      };

      const timeout = setTimeout(() => {
        cleanup();
        resolve({});
      }, 2500);

      video.onloadedmetadata = () => {
        video.currentTime = Math.min(1.0, (video.duration || 2) * 0.25);
      };

      video.onseeked = () => {
        clearTimeout(timeout);
        try {
          const canvas = document.createElement('canvas');
          canvas.width = 320;
          canvas.height = Math.round((320 * (video.videoHeight || 180)) / (video.videoWidth || 320));
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const frameUrl = canvas.toDataURL('image/jpeg', 0.75);
            const duration = Math.round(video.duration || 0);
            cleanup();
            resolve({ frameUrl, duration });
            return;
          }
        } catch {
          // ignore canvas error
        }
        cleanup();
        resolve({ duration: Math.round(video.duration || 0) });
      };

      video.onerror = () => {
        clearTimeout(timeout);
        cleanup();
        resolve({});
      };
    });
  };

  const readFileAsDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  };

  const handleFilesSelected = async (
    files: FileList | null,
    category: AttachmentCategory
  ) => {
    if (!files || files.length === 0) return;
    const processed: MessageAttachment[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const compat = evaluateAttachmentCompatibility(
        category,
        file.name,
        file.type,
        activeModel
      );

      let previewDataUrl: string | undefined;
      let extractedText: string | undefined;
      let chunkCount: number | undefined;
      let videoFramesDataUrls: string[] | undefined;
      let durationSeconds: number | undefined;

      try {
        if ((category === 'image' || category === 'camera') && file.size <= 15 * 1024 * 1024) {
          previewDataUrl = await readFileAsDataUrl(file);
        } else if (category === 'video') {
          const videoMeta = await extractVideoFramePreview(file);
          if (videoMeta.frameUrl) {
            previewDataUrl = videoMeta.frameUrl;
            videoFramesDataUrls = [videoMeta.frameUrl];
          }
          durationSeconds = videoMeta.duration;
        } else if (category === 'audio' && file.size <= 25 * 1024 * 1024) {
          previewDataUrl = await readFileAsDataUrl(file);
        } else if (category === 'document') {
          const rawText = await file.text();
          const chunked = chunkDocumentText(rawText, 2400, 4);
          if (chunked.boundedText) {
            extractedText = chunked.boundedText;
            chunkCount = chunked.chunkCount;
          }
        }
      } catch {
        // Gracefully handle unreadable files
      }

      processed.push({
        id: `att-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
        name: file.name,
        mimeType: file.type || 'application/octet-stream',
        sizeBytes: file.size,
        category,
        previewDataUrl,
        extractedText,
        chunkCount,
        videoFramesDataUrls,
        durationSeconds,
        compatibilityStatus: compat.compatibilityStatus,
        compatibilityNote: compat.compatibilityNote,
      });
    }

    onAddAttachments(processed);
    onClose();
  };

  const handleAttachSampleSpecDoc = () => {
    const sampleMarkdown = `# Realme P4 5G Local Inference Benchmark Notes
- SoC Architecture: 64-bit ARMv8.2-A (arm64-v8a) with dotprod and fp16 NEON instructions
- Physical Memory: 8,192 MB LPDDR4X RAM (~5,120 MB usable native heap budget)
- Internal Storage: 256 GB UFS (GGUF models accessed in-place via SAF /proc/self/fd mmap)
- Recommended Quantizations: Q4_K_M and Q4_K_S for 1.5B to 4B parameter models
- Default Context Window: n_ctx = 2048, n_batch = 256, n_threads = 4`;

    const compat = evaluateAttachmentCompatibility(
      'document',
      'realme-p4-5g-benchmark-notes.md',
      'text/markdown',
      activeModel
    );
    const chunked = chunkDocumentText(sampleMarkdown, 2400, 4);

    onAddAttachments([
      {
        id: `att-sample-${Date.now()}`,
        name: 'realme-p4-5g-benchmark-notes.md',
        mimeType: 'text/markdown',
        sizeBytes: sampleMarkdown.length,
        category: 'document',
        extractedText: chunked.boundedText,
        chunkCount: chunked.chunkCount,
        compatibilityStatus: compat.compatibilityStatus,
        compatibilityNote: compat.compatibilityNote,
      },
    ]);
    onClose();
  };

  const handleAttachSampleImageWithHonestCheck = () => {
    const compat = evaluateAttachmentCompatibility(
      'image',
      'camera_capture_pcb_layout.png',
      'image/png',
      activeModel
    );
    onAddAttachments([
      {
        id: `att-img-${Date.now()}`,
        name: 'camera_capture_pcb_layout.png',
        mimeType: 'image/png',
        sizeBytes: 184320,
        category: 'image',
        previewDataUrl: '/pwa-192x192.png',
        compatibilityStatus: compat.compatibilityStatus,
        compatibilityNote: compat.compatibilityNote,
      },
    ]);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Add attachment to message"
    >
      <div className="w-full max-w-xl rounded-t-3xl sm:rounded-3xl bg-[#111827] border-t sm:border border-slate-800 p-5 shadow-2xl">
        <div className="w-10 h-1.5 bg-slate-700 rounded-full mx-auto mb-4 sm:hidden" />

        <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
          <div>
            <h3 className="text-base font-bold text-white">Attach Device Files</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Processed locally on your phone · Never uploaded to cloud servers
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            aria-label="Close attachment menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Hidden native Android/Browser file pickers */}
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => handleFilesSelected(e.target.files, 'image')}
        />
        <input
          ref={videoInputRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={(e) => handleFilesSelected(e.target.files, 'video')}
        />
        <input
          ref={docInputRef}
          type="file"
          accept=".pdf,.txt,.md,.csv,.json,.xml,.yaml,.yml,.log,.kt,.py,.js,.ts"
          multiple
          className="hidden"
          onChange={(e) => handleFilesSelected(e.target.files, 'document')}
        />
        <input
          ref={audioInputRef}
          type="file"
          accept="audio/*"
          className="hidden"
          onChange={(e) => handleFilesSelected(e.target.files, 'audio')}
        />
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => handleFilesSelected(e.target.files, 'camera')}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-4">
          <button
            type="button"
            onClick={() => imageInputRef.current?.click()}
            className="flex items-center gap-3.5 p-3.5 rounded-2xl bg-slate-900/90 hover:bg-slate-800 border border-slate-800 text-left transition-colors min-h-[60px]"
          >
            <div className="w-10 h-10 rounded-xl bg-teal-500/15 text-teal-400 flex items-center justify-center shrink-0">
              <ImageIcon className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-white">Photos and Images</div>
              <div className="text-xs text-slate-400 truncate">
                {activeModel?.supportsVision
                  ? 'Vision projector supported'
                  : 'Preview + honest capability check'}
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => videoInputRef.current?.click()}
            className="flex items-center gap-3.5 p-3.5 rounded-2xl bg-slate-900/90 hover:bg-slate-800 border border-slate-800 text-left transition-colors min-h-[60px]"
          >
            <div className="w-10 h-10 rounded-xl bg-sky-500/15 text-sky-400 flex items-center justify-center shrink-0">
              <Film className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-white">Videos</div>
              <div className="text-xs text-slate-400 truncate">
                Extracts local keyframe preview
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => docInputRef.current?.click()}
            className="flex items-center gap-3.5 p-3.5 rounded-2xl bg-slate-900/90 hover:bg-slate-800 border border-slate-800 text-left transition-colors min-h-[60px]"
          >
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 text-amber-400 flex items-center justify-center shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-white">Files and Documents</div>
              <div className="text-xs text-slate-400 truncate">
                TXT, MD, CSV, JSON, PDF chunk parser
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => audioInputRef.current?.click()}
            className="flex items-center gap-3.5 p-3.5 rounded-2xl bg-slate-900/90 hover:bg-slate-800 border border-slate-800 text-left transition-colors min-h-[60px]"
          >
            <div className="w-10 h-10 rounded-xl bg-rose-500/15 text-rose-400 flex items-center justify-center shrink-0">
              <Music className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-white">Audio and Music</div>
              <div className="text-xs text-slate-400 truncate">
                Local player + runtime check
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => cameraInputRef.current?.click()}
            className="flex items-center gap-3.5 p-3.5 rounded-2xl bg-slate-900/90 hover:bg-slate-800 border border-slate-800 text-left transition-colors min-h-[60px] sm:col-span-2"
          >
            <div className="w-10 h-10 rounded-xl bg-purple-500/15 text-purple-400 flex items-center justify-center shrink-0">
              <Camera className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-white">Camera Capture</div>
              <div className="text-xs text-slate-400 truncate">
                Capture photo directly from Realme P4 5G camera
              </div>
            </div>
          </button>
        </div>

        {/* Instant Verification Fixtures for Phone Testing */}
        <div className="mt-4 pt-3.5 border-t border-slate-800/80">
          <div className="text-xs font-medium text-slate-400 mb-2">
            Quick Local Test Fixtures (Verify Document Chunking & Honest Vision Warning)
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleAttachSampleSpecDoc}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium text-teal-300 transition-colors whitespace-nowrap shrink-0"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Attach Sample Markdown Spec</span>
            </button>
            <button
              type="button"
              onClick={handleAttachSampleImageWithHonestCheck}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium text-amber-300 transition-colors whitespace-nowrap shrink-0"
            >
              <ImageIcon className="w-3.5 h-3.5" />
              <span>Attach Test Image (Honest Check)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
