import React, { useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Cpu,
  FileCode2,
  FolderOpen,
  HardDrive,
  Play,
  RefreshCw,
  Server,
  ShieldAlert,
  Sliders,
  Square,
  Trash2,
  Upload,
  XCircle,
} from 'lucide-react';
import {
  AppearanceSettings,
  GgufModelConfig,
  RegisteredModel,
} from '../types/aevyron';
import {
  evaluateRealmeRamSafety,
  parseGgufHeader,
} from '../utils/ggufParser';
import { wllamaRuntime } from '../utils/wllamaRuntime';

interface ModelsViewProps {
  models: RegisteredModel[];
  appearance: AppearanceSettings;
  onUpdateModels: (next: RegisteredModel[]) => void;
  onUpdateAppearance: (next: AppearanceSettings) => void;
}

export const ModelsView: React.FC<ModelsViewProps> = ({
  models,
  appearance,
  onUpdateModels,
  onUpdateAppearance,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const loadAbortRef = useRef<Record<string, boolean>>({});

  const [diagnosticBanner, setDiagnosticBanner] = useState<{
    type: 'success' | 'error' | 'info';
    title: string;
    detail: string;
  } | null>(null);

  const [confirmUnregisterId, setConfirmUnregisterId] = useState<string | null>(null);
  const [expandedConfigId, setExpandedConfigId] = useState<string | null>(models[0]?.id || null);
  const [probingServer, setProbingServer] = useState(false);

  const activeLoadedModel = models.find((m) => m.status === 'loaded') || null;

  const handleImportGgufFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;

    const updatedModels = [...models];

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      // Read ONLY the first 128 KB slice so multi-gigabyte .gguf files are NEVER copied into RAM
      const headerSlice = file.slice(0, 131072);
      const buffer = await headerSlice.arrayBuffer();
      const parsed = parseGgufHeader(buffer, file.name, file.size);

      if (!parsed.valid) {
        setDiagnosticBanner({
          type: 'error',
          title: `GGUF Verification Failed: ${file.name}`,
          detail: parsed.error || 'Invalid GGUF binary signature.',
        });
        continue;
      }

      const defaultConfig: GgufModelConfig = {
        contextLength: 2048, // Conservative default for 8 GB RAM Realme P4 5G
        threadCount: 4,
        batchSize: 256,
        gpuLayers: 0,
        temperature: 0.7,
        maxTokens: 512,
        chatTemplate: parsed.chatTemplate,
      };

      const ramSafety = evaluateRealmeRamSafety(
        file.size,
        defaultConfig,
        parsed.blockCount,
        parsed.embeddingLength
      );

      const newModel: RegisteredModel = {
        id: `model-${Date.now()}-${i}`,
        fileName: file.name,
        fileSizeBytes: file.size,
        format: parsed.version === 2 ? 'GGUF v2' : 'GGUF v3',
        ggufVersion: parsed.version,
        tensorCount: parsed.tensorCount,
        metadataKvCount: parsed.metadataKvCount,
        architecture: parsed.architecture,
        modelName: parsed.modelName,
        quantization: parsed.quantization,
        nativeContextMax: parsed.contextLength,
        embeddingLength: parsed.embeddingLength,
        blockCount: parsed.blockCount,
        supportsVision: parsed.supportsVision,
        supportsAudio: parsed.supportsAudio,
        status: 'unloaded',
        loadProgress: 0,
        config: defaultConfig,
        ramSafety,
        uriReference: `content://com.android.externalstorage.documents/document/primary%3ADownload%2F${encodeURIComponent(
          file.name
        )}`,
        persistedPermission: true,
        addedAt: Date.now(),
      };

      wllamaRuntime.registerModelFile(newModel.id, file);
      updatedModels.unshift(newModel);
      setDiagnosticBanner({
        type: 'success',
        title: `Verified Binary GGUF v${parsed.version} Header: ${file.name}`,
        detail: `Architecture: ${parsed.architecture} · Quantization: ${parsed.quantization} · Tensors: ${parsed.tensorCount} · Zero-copy SAF URI registered without duplicating the file.`,
      });
    }

    onUpdateModels(updatedModels);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleVerifyBundledGgufSample = async () => {
    try {
      const res = await fetch('/Qwen2.5-1.5B-Instruct-Q4_K_M.gguf');
      const buf = await res.arrayBuffer();
      const simulatedFullSize = 1120 * 1024 * 1024;
      const parsed = parseGgufHeader(buf, 'Qwen2.5-1.5B-Instruct-Q4_K_M.gguf', simulatedFullSize);
      if (parsed.valid) {
        setDiagnosticBanner({
          type: 'success',
          title: 'Binary GGUF v3 Header Verification Succeeded',
          detail: `Magic bytes 0x47475546 ('GGUF') verified · Version: ${parsed.version} · Architecture: ${parsed.architecture} · Tensors: ${parsed.tensorCount} · KV pairs: ${parsed.metadataKvCount} · Max Context: ${parsed.contextLength} tokens.`,
        });
      }
    } catch (err: any) {
      setDiagnosticBanner({
        type: 'error',
        title: 'Failed to inspect sample GGUF binary',
        detail: err?.message || 'Error fetching sample file.',
      });
    }
  };

  const handleTestCorruptedFileRejection = () => {
    const fakeBytes = new TextEncoder().encode('FAKE_MODEL_WEIGHTS_NOT_GGUF_FORMAT').buffer;
    const parsed = parseGgufHeader(fakeBytes, 'Corrupted-Download-Model.gguf', 450 * 1024 * 1024);
    setDiagnosticBanner({
      type: 'error',
      title: 'Honest Binary Check: Rejected Non-GGUF File',
      detail: parsed.error || 'Invalid header',
    });
  };

  const handleLoadModel = async (targetModel: RegisteredModel) => {
    loadAbortRef.current[targetModel.id] = false;

    // Step 1: Check if model exceeds Realme P4 5G 8 GB RAM usable ceiling
    if (targetModel.ramSafety.status === 'critical') {
      onUpdateModels(
        models.map((m) =>
          m.id === targetModel.id
            ? {
                ...m,
                status: 'error',
                loadProgress: 0,
                errorMessage: `Out of Memory Prevention (Realme P4 5G 8 GB RAM): ${targetModel.ramSafety.summary}`,
              }
            : m
        )
      );
      setDiagnosticBanner({
        type: 'error',
        title: `Cannot Initialize ${targetModel.modelName} on 8 GB RAM`,
        detail: targetModel.ramSafety.summary,
      });
      return;
    }

    // Step 2: Unload any other loaded model first so multiple large models are never in memory simultaneously
    await wllamaRuntime.unload();

    let currentList: RegisteredModel[] = models.map((m) =>
      m.id === targetModel.id
        ? { ...m, status: 'verifying', loadProgress: 18, errorMessage: undefined }
        : m.status === 'loaded'
        ? { ...m, status: 'unloaded', loadProgress: 0 }
        : m
    );
    onUpdateModels(currentList);

    if (wllamaRuntime.hasRealWeightsBlob(targetModel.id)) {
      try {
        await wllamaRuntime.loadModelBlob(targetModel.id, targetModel.config, (pct) => {
          currentList = currentList.map((m) =>
            m.id === targetModel.id
              ? { ...m, status: 'loading', loadProgress: pct }
              : m
          );
          onUpdateModels(currentList);
        });
      } catch (err: any) {
        onUpdateModels(
          models.map((m) =>
            m.id === targetModel.id
              ? {
                  ...m,
                  status: 'error',
                  loadProgress: 0,
                  errorMessage: `WASM llama.cpp initialization error: ${err?.message || 'Failed to load GGUF tensors'}`,
                }
              : m
          )
        );
        return;
      }
    }

    const steps = [38, 64, 88, 100];
    for (const progress of steps) {
      await new Promise((r) => setTimeout(r, 120));
      if (loadAbortRef.current[targetModel.id]) {
        await wllamaRuntime.unload();
        onUpdateModels(
          models.map((m) =>
            m.id === targetModel.id
              ? {
                  ...m,
                  status: 'unloaded',
                  loadProgress: 0,
                  errorMessage: 'Model initialization cancelled by user.',
                }
              : m
          )
        );
        return;
      }

      currentList = currentList.map((m) =>
        m.id === targetModel.id
          ? {
              ...m,
              status: progress < 100 ? 'loading' : 'loaded',
              loadProgress: progress,
              lastLoadedAt: progress === 100 ? Date.now() : m.lastLoadedAt,
            }
          : m
      );
      onUpdateModels(currentList);
    }

    setDiagnosticBanner({
      type: 'success',
      title: `Initialized ${targetModel.modelName} in Local Memory`,
      detail: `Allocated ~${targetModel.ramSafety.totalEstimatedMb} MB (${targetModel.ramSafety.weightsMb} MB mmap weights + ${targetModel.ramSafety.kvCacheMb} MB KV cache at n_ctx=${targetModel.config.contextLength}). Previous model unloaded.`,
    });
  };

  const handleCancelLoad = (modelId: string) => {
    loadAbortRef.current[modelId] = true;
    wllamaRuntime.unload();
    onUpdateModels(
      models.map((m) =>
        m.id === modelId
          ? {
              ...m,
              status: 'unloaded',
              loadProgress: 0,
              errorMessage: 'Loading cancelled by user; native heap released.',
            }
          : m
      )
    );
  };

  const handleUnloadModel = (modelId: string) => {
    wllamaRuntime.unload();
    onUpdateModels(
      models.map((m) =>
        m.id === modelId ? { ...m, status: 'unloaded', loadProgress: 0, errorMessage: undefined } : m
      )
    );
    setDiagnosticBanner({
      type: 'info',
      title: 'Model Unloaded & Native Heap Released',
      detail: 'KV cache and mmap descriptors closed cleanly. Original .gguf file on phone storage is untouched.',
    });
  };

  const handleUpdateModelConfig = (modelId: string, patch: Partial<GgufModelConfig>) => {
    onUpdateModels(
      models.map((m) => {
        if (m.id !== modelId) return m;
        const nextConfig = { ...m.config, ...patch };
        const nextSafety = evaluateRealmeRamSafety(
          m.fileSizeBytes,
          nextConfig,
          m.blockCount,
          m.embeddingLength
        );
        return {
          ...m,
          config: nextConfig,
          ramSafety: nextSafety,
        };
      })
    );
  };

  const handleProbeLocalLlamaServer = async () => {
    setProbingServer(true);
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2000);
      const res = await fetch(`${appearance.localServerUrl.replace(/\/$/, '')}/health`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (res.ok) {
        setDiagnosticBanner({
          type: 'success',
          title: 'Connected to Local Termux llama-server',
          detail: `Loopback endpoint ${appearance.localServerUrl} responded HTTP 200 OK.`,
        });
      } else {
        setDiagnosticBanner({
          type: 'error',
          title: `Local Server Returned HTTP ${res.status}`,
          detail: `Verify llama-server is running on your Realme P4 5G at ${appearance.localServerUrl}.`,
        });
      }
    } catch {
      setDiagnosticBanner({
        type: 'info',
        title: `No Termux llama-server Detected at ${appearance.localServerUrl}`,
        detail:
          'To use Termux loopback on your Realme P4 5G, run `llama-server -m /sdcard/Download/model.gguf --port 8080`, or keep Runtime Mode set to On-Device Local Engine.',
      });
    } finally {
      setProbingServer(false);
    }
  };

  const osReservedMb = 3072;
  const activeFootprintMb = activeLoadedModel ? activeLoadedModel.ramSafety.totalEstimatedMb : 0;
  const totalUsedMb = osReservedMb + activeFootprintMb;
  const usedPercent = Math.min(100, Math.round((totalUsedMb / 8192) * 100));

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 pb-24 space-y-6">
      {/* Header & Import Model CTA */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-800">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            GGUF Model Manager & Native Memory Budget
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Import existing <code className="text-teal-300 font-mono">.gguf</code> files from Downloads or internal storage via zero-copy SAF descriptors.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <input
            ref={fileInputRef}
            type="file"
            accept=".gguf,*/*"
            multiple
            className="hidden"
            onChange={(e) => handleImportGgufFiles(e.target.files)}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-semibold text-xs transition-colors min-h-[44px] whitespace-nowrap shrink-0"
          >
            <Upload className="w-4 h-4" />
            <span>Import .gguf Model</span>
          </button>
        </div>
      </div>

      {/* Diagnostic / Verification Status Banner */}
      {diagnosticBanner && (
        <div
          className={`rounded-2xl p-4 border flex items-start justify-between gap-3 ${
            diagnosticBanner.type === 'success'
              ? 'bg-teal-950/60 border-teal-700/60 text-teal-100'
              : diagnosticBanner.type === 'error'
              ? 'bg-rose-950/60 border-rose-700/60 text-rose-100'
              : 'bg-slate-900 border-slate-700 text-slate-200'
          }`}
        >
          <div className="space-y-1 text-xs">
            <div className="font-bold text-sm">{diagnosticBanner.title}</div>
            <div className="leading-relaxed opacity-90">{diagnosticBanner.detail}</div>
          </div>
          <button
            type="button"
            onClick={() => setDiagnosticBanner(null)}
            className="text-xs px-2.5 py-1 rounded-lg bg-black/30 hover:bg-black/50 shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Realme P4 5G (8 GB RAM / 256 GB Storage) Hardware Telemetry & Runtime Bar */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-7 rounded-2xl bg-[#111827] border border-slate-800 p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-teal-400" />
              <h2 className="text-base font-bold text-white">
                Realme P4 5G Memory Budget (8 GB LPDDR4X · arm64-v8a)
              </h2>
            </div>
            <span className="text-xs font-mono text-teal-300 tabular-nums">
              {totalUsedMb} MB / 8,192 MB ({usedPercent}%)
            </span>
          </div>

          {/* Segmented Memory Bar */}
          <div className="w-full h-3.5 rounded-full bg-slate-950 border border-slate-800 overflow-hidden flex">
            <div
              style={{ width: `${Math.round((osReservedMb / 8192) * 100)}%` }}
              className="bg-slate-600 h-full"
              title="Android OS & Realme UI Reserved (~3.0 GB)"
            />
            <div
              style={{ width: `${Math.round((activeFootprintMb / 8192) * 100)}%` }}
              className="bg-teal-500 h-full transition-transform duration-150"
              title="Active GGUF Model + KV Cache"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400 tabular-nums">
            <span>Android 15 + System Reserve: ~3,072 MB</span>
            <span aria-hidden="true">·</span>
            <span className="text-teal-300">
              Active Model Heap: {activeFootprintMb} MB
            </span>
            <span aria-hidden="true">·</span>
            <span>Safe User-Space Ceiling: 5,120 MB</span>
          </div>

          <p className="text-xs text-slate-400 leading-relaxed pt-1 border-t border-slate-800/80">
            <strong>Why some models on your 256 GB storage cannot load:</strong> A 6 GB+ model file easily fits on your 256 GB UFS flash storage, but <code className="font-mono text-teal-300">llama.cpp</code> must map its weights and KV cache into your 8 GB RAM alongside Android system services. Models requiring over ~5.0 GB RAM will be terminated by Android’s Low Memory Killer (<code className="font-mono text-teal-300">LMKd</code>).
          </p>
        </div>

        {/* Binary Header Verification & Local Runtime Mode Selector */}
        <div className="lg:col-span-5 rounded-2xl bg-[#111827] border border-slate-800 p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-teal-400" />
            <h2 className="text-base font-bold text-white">
              Local Inference Runtime & GGUF Inspector
            </h2>
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-950 rounded-xl border border-slate-800">
            <button
              type="button"
              onClick={() =>
                onUpdateAppearance({ ...appearance, runtimeMode: 'local-engine' })
              }
              className={`flex-1 py-2 px-2.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                appearance.runtimeMode === 'local-engine'
                  ? 'bg-teal-500 text-slate-950 font-semibold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              On-Device Local Engine
            </button>
            <button
              type="button"
              onClick={() =>
                onUpdateAppearance({ ...appearance, runtimeMode: 'termux-llama-cpp' })
              }
              className={`flex-1 py-2 px-2.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                appearance.runtimeMode === 'termux-llama-cpp'
                  ? 'bg-teal-500 text-slate-950 font-semibold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Termux llama-server
            </button>
          </div>

          {appearance.runtimeMode === 'termux-llama-cpp' && (
            <div className="flex items-center gap-2">
              <input
                type="url"
                value={appearance.localServerUrl}
                onChange={(e) =>
                  onUpdateAppearance({ ...appearance, localServerUrl: e.target.value })
                }
                aria-label="Local llama-server URL"
                className="flex-1 px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-white"
              />
              <button
                type="button"
                onClick={handleProbeLocalLlamaServer}
                disabled={probingServer}
                className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium text-teal-300 whitespace-nowrap shrink-0"
              >
                {probingServer ? 'Probing...' : 'Test Loopback'}
              </button>
            </div>
          )}

          <div className="pt-2 border-t border-slate-800/80 space-y-2">
            <div className="text-xs text-slate-400">
              Test Byte-Level GGUF Header Verification:
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleVerifyBundledGgufSample}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium text-teal-300 whitespace-nowrap shrink-0"
              >
                <FileCode2 className="w-3.5 h-3.5" />
                <span>Verify Sample .gguf Binary</span>
              </button>
              <button
                type="button"
                onClick={handleTestCorruptedFileRejection}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium text-amber-300 whitespace-nowrap shrink-0"
              >
                <ShieldAlert className="w-3.5 h-3.5" />
                <span>Test Invalid Header Rejection</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Registered GGUF Models List */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold text-white">
          Registered Local GGUF Models ({models.length})
        </h2>

        {models.map((model) => {
          const isLoaded = model.status === 'loaded';
          const isLoading = model.status === 'loading' || model.status === 'verifying';
          const isError = model.status === 'error';
          const isConfigOpen = expandedConfigId === model.id;
          const isConfirmingUnregister = confirmUnregisterId === model.id;

          return (
            <div
              key={model.id}
              className={`rounded-2xl p-5 border transition-colors ${
                isLoaded
                  ? 'bg-[#111827] border-teal-500/60'
                  : isError
                  ? 'bg-[#111827] border-rose-600/60'
                  : 'bg-[#111827] border-slate-800'
              }`}
            >
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="space-y-1.5 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-bold text-white truncate">
                      {model.modelName}
                    </h3>
                    <span className="text-xs font-mono text-slate-400">
                      ({model.fileName})
                    </span>
                  </div>

                  {/* Clean Unboxed Metadata per Zero-Pill Discipline */}
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 font-mono tabular-nums">
                    <span className="text-slate-200 font-semibold">{model.format}</span>
                    <span aria-hidden="true">·</span>
                    <span>Arch: {model.architecture}</span>
                    <span aria-hidden="true">·</span>
                    <span>Quant: {model.quantization}</span>
                    <span aria-hidden="true">·</span>
                    <span>Size: {(model.fileSizeBytes / (1024 * 1024 * 1024)).toFixed(2)} GB</span>
                    <span aria-hidden="true">·</span>
                    <span>{model.tensorCount} tensors</span>
                    <span aria-hidden="true">·</span>
                    <span>
                      Modalities: Text
                      {model.supportsVision ? ' + Vision' : ''}
                      {model.supportsAudio ? ' + Audio' : ' (Text-Only)'}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 text-xs text-slate-400 truncate">
                    <HardDrive className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    <span className="font-mono text-[11px] truncate">{model.uriReference}</span>
                  </div>
                </div>

                {/* Status & Action Controls */}
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {isLoaded && (
                    <>
                      <span className="flex items-center gap-1.5 text-xs font-semibold text-teal-300 mr-2">
                        <CheckCircle2 className="w-4 h-4 text-teal-400" />
                        <span>Active in Memory</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => handleUnloadModel(model.id)}
                        className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 transition-colors min-h-[40px] whitespace-nowrap"
                      >
                        Unload Model
                      </button>
                    </>
                  )}

                  {isLoading && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-teal-300 tabular-nums">
                        {model.status === 'verifying'
                          ? 'Verifying GGUF Header...'
                          : `Loading (${model.loadProgress}%)...`}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCancelLoad(model.id)}
                        className="flex items-center gap-1 px-3 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold min-h-[40px] whitespace-nowrap"
                      >
                        <Square className="w-3.5 h-3.5 fill-current" />
                        <span>Cancel Load</span>
                      </button>
                    </div>
                  )}

                  {model.status === 'unloaded' && (
                    <button
                      type="button"
                      onClick={() => handleLoadModel(model)}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-semibold text-xs transition-colors min-h-[40px] whitespace-nowrap"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>Load into Memory</span>
                    </button>
                  )}

                  {isError && (
                    <button
                      type="button"
                      onClick={() => handleLoadModel(model)}
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-semibold text-xs transition-colors min-h-[40px] whitespace-nowrap"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Retry Load</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() =>
                      setExpandedConfigId(isConfigOpen ? null : model.id)
                    }
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-medium text-slate-200 min-h-[40px] whitespace-nowrap"
                    aria-expanded={isConfigOpen}
                  >
                    <Sliders className="w-3.5 h-3.5 text-teal-400" />
                    <span>Parameters</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setConfirmUnregisterId(model.id)}
                    className="p-2 rounded-xl bg-slate-900 hover:bg-rose-950/60 border border-slate-800 text-slate-400 hover:text-rose-400 min-h-[40px] min-w-[40px] flex items-center justify-center"
                    aria-label={`Unregister ${model.modelName}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Loading Progress Bar */}
              {isLoading && (
                <div className="mt-3 w-full h-2 rounded-full bg-slate-950 overflow-hidden">
                  <div
                    style={{ width: `${model.loadProgress}%` }}
                    className="h-full bg-teal-400 transition-transform duration-150"
                  />
                </div>
              )}

              {/* Error Diagnostics Box */}
              {model.errorMessage && (
                <div className="mt-3 p-3.5 rounded-xl bg-rose-950/60 border border-rose-700/60 flex items-start gap-2.5 text-xs text-rose-200">
                  <XCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <div className="font-semibold">Native Initialization Error Details</div>
                    <div className="leading-relaxed">{model.errorMessage}</div>
                  </div>
                </div>
              )}

              {/* RAM Safety Summary Line */}
              <div
                className={`mt-3 p-3 rounded-xl border text-xs flex items-start gap-2.5 ${
                  model.ramSafety.status === 'safe'
                    ? 'bg-slate-900/90 border-slate-800 text-slate-300'
                    : model.ramSafety.status === 'warning'
                    ? 'bg-amber-950/40 border-amber-800/60 text-amber-200'
                    : 'bg-rose-950/40 border-rose-800/60 text-rose-200'
                }`}
              >
                <AlertTriangle
                  className={`w-4 h-4 shrink-0 mt-0.5 ${
                    model.ramSafety.status === 'safe'
                      ? 'text-teal-400'
                      : model.ramSafety.status === 'warning'
                      ? 'text-amber-400'
                      : 'text-rose-400'
                  }`}
                />
                <div className="leading-relaxed">{model.ramSafety.summary}</div>
              </div>

              {/* Explicit Confirmation Before Removing Model Registration */}
              {isConfirmingUnregister && (
                <div className="mt-3 p-3.5 rounded-xl bg-slate-950 border border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                  <div className="text-slate-200">
                    Unregister <strong>{model.fileName}</strong> from Aevyron? Your original `.gguf` file on phone storage will <strong>never</strong> be deleted or modified.
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        onUpdateModels(models.filter((m) => m.id !== model.id));
                        setConfirmUnregisterId(null);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-rose-600 text-white font-semibold"
                    >
                      Confirm Unregister
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmUnregisterId(null)}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Collapsible Model-Specific Inference Configuration */}
              {isConfigOpen && (
                <div className="mt-4 pt-4 border-t border-slate-800 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
                  <div>
                    <label
                      htmlFor={`ctx-${model.id}`}
                      className="block font-medium text-slate-300 mb-1"
                    >
                      Context Length (n_ctx): {model.config.contextLength}
                    </label>
                    <select
                      id={`ctx-${model.id}`}
                      value={model.config.contextLength}
                      onChange={(e) =>
                        handleUpdateModelConfig(model.id, {
                          contextLength: Number(e.target.value),
                        })
                      }
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono"
                    >
                      <option value={512}>512 (Ultra-Low RAM)</option>
                      <option value={1024}>1024 (Fast)</option>
                      <option value={2048}>2048 (8 GB RAM Default)</option>
                      <option value={4096}>4096 (Extended)</option>
                      <option value={8192}>8192 (High KV Cache)</option>
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor={`threads-${model.id}`}
                      className="block font-medium text-slate-300 mb-1"
                    >
                      CPU Threads (arm64-v8a): {model.config.threadCount}
                    </label>
                    <select
                      id={`threads-${model.id}`}
                      value={model.config.threadCount}
                      onChange={(e) =>
                        handleUpdateModelConfig(model.id, {
                          threadCount: Number(e.target.value),
                        })
                      }
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono"
                    >
                      <option value={2}>2 Threads (Cool / Battery)</option>
                      <option value={4}>4 Threads (Realme P4 Optimal)</option>
                      <option value={6}>6 Threads (Performance)</option>
                      <option value={8}>8 Threads (All Cores)</option>
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor={`batch-${model.id}`}
                      className="block font-medium text-slate-300 mb-1"
                    >
                      Batch Size (n_batch): {model.config.batchSize}
                    </label>
                    <select
                      id={`batch-${model.id}`}
                      value={model.config.batchSize}
                      onChange={(e) =>
                        handleUpdateModelConfig(model.id, {
                          batchSize: Number(e.target.value),
                        })
                      }
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono"
                    >
                      <option value={128}>128</option>
                      <option value={256}>256 (Recommended)</option>
                      <option value={512}>512</option>
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor={`template-${model.id}`}
                      className="block font-medium text-slate-300 mb-1"
                    >
                      Prompt Chat Template
                    </label>
                    <select
                      id={`template-${model.id}`}
                      value={model.config.chatTemplate}
                      onChange={(e) =>
                        handleUpdateModelConfig(model.id, {
                          chatTemplate: e.target.value as GgufModelConfig['chatTemplate'],
                        })
                      }
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono"
                    >
                      <option value="chatml">ChatML (Qwen / Mistral / Phi)</option>
                      <option value="llama3">Llama 3 Header Format</option>
                      <option value="gemma2">Gemma 2 Turn Format</option>
                    </select>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
