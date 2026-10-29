import React, { useRef, useState } from 'react';
import {
  Check,
  Code2,
  Copy,
  Cpu,
  Download,
  FileArchive,
  Globe,
  Image as ImageIcon,
  RotateCcw,
  ShieldCheck,
  Sliders,
  Smartphone,
  Trash2,
  Upload,
  Volume2,
  VolumeX,
} from 'lucide-react';
import {
  AppearanceSettings,
  ChatMessage,
  Conversation,
  LanguagePreference,
  MemoryFact,
  MemorySuggestion,
  RegisteredModel,
  WallpaperFitMode,
} from '../types/aevyron';
import {
  applyBackupRestore,
  createVersionedBackup,
  RestoreConflictStrategy,
  validateBackupJson,
} from '../utils/backupManager';
import { ANDROID_PROJECT_FILES } from '../utils/androidProjectFiles';
import { Marquee } from './Marquee';

interface SettingsViewProps {
  appearance: AppearanceSettings;
  memories: MemoryFact[];
  suggestions: MemorySuggestion[];
  conversations: Conversation[];
  messages: ChatMessage[];
  models: RegisteredModel[];
  isInstallable?: boolean;
  isInstalled?: boolean;
  isIOS?: boolean;
  onInstallPwa?: () => Promise<void>;
  onUpdateAppearance: (next: AppearanceSettings) => void;
  onUpdateConversations: (next: Conversation[]) => void;
  onSelectAndLoadModel: (modelId: string) => void;
  onRestoreData: (data: {
    memories: MemoryFact[];
    conversations: Conversation[];
    messages: ChatMessage[];
  }) => void;
  onResetAllData: () => void;
}

const BUILTIN_OFFLINE_WALLPAPERS = [
  {
    id: 'wp-emerald-aurora',
    name: 'Emerald Cyber Aurora',
    dataUrl:
      'data:image/svg+xml;utf8,' +
      encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1400" viewBox="0 0 800 1400">
          <defs>
            <linearGradient id="bg1" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stop-color="#042f2e"/>
              <stop offset="45%" stop-color="#0f172a"/>
              <stop offset="100%" stop-color="#022c22"/>
            </linearGradient>
            <radialGradient id="glow1" cx="0.7" cy="0.25" r="0.55">
              <stop offset="0%" stop-color="#14b8a6" stop-opacity="0.65"/>
              <stop offset="60%" stop-color="#0d9488" stop-opacity="0.18"/>
              <stop offset="100%" stop-color="#0f172a" stop-opacity="0"/>
            </radialGradient>
            <radialGradient id="glow2" cx="0.25" cy="0.8" r="0.5">
              <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.5"/>
              <stop offset="100%" stop-color="#0f172a" stop-opacity="0"/>
            </radialGradient>
          </defs>
          <rect width="800" height="1400" fill="url(#bg1)"/>
          <rect width="800" height="1400" fill="url(#glow1)"/>
          <rect width="800" height="1400" fill="url(#glow2)"/>
          <path d="M0,980 Q240,860 440,960 T800,890 L800,1400 L0,1400 Z" fill="#0d9488" fill-opacity="0.22"/>
          <path d="M0,1120 Q300,1020 550,1110 T800,1050 L800,1400 L0,1400 Z" fill="#14b8a6" fill-opacity="0.18"/>
          <g fill="#5eead4" fill-opacity="0.55">
            <circle cx="140" cy="210" r="3"/><circle cx="640" cy="180" r="4"/><circle cx="420" cy="340" r="2.5"/>
            <circle cx="220" cy="520" r="3.5"/><circle cx="690" cy="580" r="3"/><circle cx="120" cy="760" r="2.5"/>
          </g>
        </svg>`
      ),
  },
  {
    id: 'wp-royal-indigo',
    name: 'Royal Indigo Horizon',
    dataUrl:
      'data:image/svg+xml;utf8,' +
      encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1400" viewBox="0 0 800 1400">
          <defs>
            <linearGradient id="bg2" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#1e1b4b"/>
              <stop offset="50%" stop-color="#311042"/>
              <stop offset="100%" stop-color="#090d16"/>
            </linearGradient>
            <radialGradient id="sun2" cx="0.5" cy="0.58" r="0.38">
              <stop offset="0%" stop-color="#f43f5e" stop-opacity="0.65"/>
              <stop offset="55%" stop-color="#8b5cf6" stop-opacity="0.28"/>
              <stop offset="100%" stop-color="#090d16" stop-opacity="0"/>
            </radialGradient>
          </defs>
          <rect width="800" height="1400" fill="url(#bg2)"/>
          <rect width="800" height="1400" fill="url(#sun2)"/>
          <polygon points="0,1080 220,820 430,1020 640,770 800,960 800,1400 0,1400" fill="#1e1b4b" fill-opacity="0.85"/>
          <polygon points="0,1180 180,980 410,1140 600,930 800,1100 800,1400 0,1400" fill="#090d16" fill-opacity="0.95"/>
        </svg>`
      ),
  },
  {
    id: 'wp-golden-twilight',
    name: 'Golden Bengal Twilight',
    dataUrl:
      'data:image/svg+xml;utf8,' +
      encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1400" viewBox="0 0 800 1400">
          <defs>
            <linearGradient id="bg3" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stop-color="#451a03"/>
              <stop offset="48%" stop-color="#1e293b"/>
              <stop offset="100%" stop-color="#090d16"/>
            </linearGradient>
            <radialGradient id="orb3" cx="0.3" cy="0.3" r="0.45">
              <stop offset="0%" stop-color="#f59e0b" stop-opacity="0.6"/>
              <stop offset="65%" stop-color="#ea580c" stop-opacity="0.2"/>
              <stop offset="100%" stop-color="#090d16" stop-opacity="0"/>
            </radialGradient>
          </defs>
          <rect width="800" height="1400" fill="url(#bg3)"/>
          <rect width="800" height="1400" fill="url(#orb3)"/>
          <circle cx="240" cy="420" r="150" fill="#fbbf24" fill-opacity="0.18"/>
          <path d="M0,1040 C260,960 520,1140 800,1010 L800,1400 L0,1400 Z" fill="#0f172a" fill-opacity="0.8"/>
        </svg>`
      ),
  },
  {
    id: 'wp-obsidian-grid',
    name: 'Obsidian Neon Matrix',
    dataUrl:
      'data:image/svg+xml;utf8,' +
      encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1400" viewBox="0 0 800 1400">
          <rect width="800" height="1400" fill="#07111e"/>
          <g stroke="#2dd4bf" stroke-opacity="0.32" stroke-width="2" fill="none">
            <circle cx="400" cy="700" r="140"/>
            <circle cx="400" cy="700" r="280"/>
            <circle cx="400" cy="700" r="420"/>
            <circle cx="400" cy="700" r="560"/>
            <path d="M0 280 H800 M0 560 H800 M0 840 H800 M0 1120 H800 M200 0 V1400 M400 0 V1400 M600 0 V1400"/>
          </g>
        </svg>`
      ),
  },
];

/**
 * Compresses & resizes high-resolution phone gallery images so they fit cleanly in localStorage
 * and render immediately without hitting browser storage quota limits.
 */
function compressImageFileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.onload = () => {
      const rawDataUrl = String(reader.result || '');
      const img = new Image();
      img.onload = () => {
        try {
          const maxDim = 1280;
          let width = img.width || 720;
          let height = img.height || 1280;
          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(rawDataUrl);
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);
          const compressed = canvas.toDataURL('image/jpeg', 0.84);
          resolve(compressed);
        } catch {
          resolve(rawDataUrl);
        }
      };
      img.onerror = () => resolve(rawDataUrl);
      img.src = rawDataUrl;
    };
    reader.readAsDataURL(file);
  });
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  appearance,
  memories,
  suggestions,
  conversations,
  messages,
  models,
  isInstallable = false,
  isInstalled = false,
  isIOS = false,
  onInstallPwa,
  onUpdateAppearance,
  onUpdateConversations,
  onSelectAndLoadModel,
  onRestoreData,
  onResetAllData,
}) => {
  const wallpaperInputRef = useRef<HTMLInputElement>(null);
  const backupInputRef = useRef<HTMLInputElement>(null);

  const activeConversation = conversations.find((c) => !c.isArchived) || conversations[0] || null;
  const loadedModel = models.find((m) => m.status === 'loaded') || models[0] || null;

  const [systemPromptDraft, setSystemPromptDraft] = useState<string>(
    activeConversation?.systemInstructions ||
      'You are Aevyron AI, a helpful personal assistant Created by Indranil Officals.'
  );
  const [systemPromptSaved, setSystemPromptSaved] = useState(false);
  const [wallpaperSavedMsg, setWallpaperSavedMsg] = useState<string | null>(null);

  // Backup & Restore state
  const [includeAttachmentsInBackup, setIncludeAttachmentsInBackup] = useState(false);
  const [restoreValidation, setRestoreValidation] = useState<ReturnType<
    typeof validateBackupJson
  > | null>(null);
  const [restoreStrategy, setRestoreStrategy] =
    useState<RestoreConflictStrategy>('merge-skip-duplicates');
  const [restoreStatusBanner, setRestoreStatusBanner] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Native Android Source Inspector state
  const [selectedSourceIdx, setSelectedSourceIdx] = useState(0);
  const [copiedSource, setCopiedSource] = useState(false);
  const [confirmClearData, setConfirmClearData] = useState(false);

  const handleSelectPhoneWallpaper = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    try {
      const compressedDataUrl = await compressImageFileToDataUrl(file);
      onUpdateAppearance({
        ...appearance,
        wallpaperDataUrl: compressedDataUrl,
        wallpaperName: file.name,
      });
      setWallpaperSavedMsg(`Applied "${file.name}" to your Chat background!`);
      setTimeout(() => setWallpaperSavedMsg(null), 3000);
    } catch {
      setWallpaperSavedMsg('Could not load selected image file.');
    }
  };

  const handleSelectPresetWallpaper = (url: string, name: string) => {
    onUpdateAppearance({
      ...appearance,
      wallpaperDataUrl: url,
      wallpaperName: name,
    });
    setWallpaperSavedMsg(`Applied "${name}" wallpaper to Chat immediately!`);
    setTimeout(() => setWallpaperSavedMsg(null), 2500);
  };

  const handleRemoveWallpaper = () => {
    onUpdateAppearance({
      ...appearance,
      wallpaperDataUrl: null,
      wallpaperName: null,
    });
    setWallpaperSavedMsg('Restored default Aevyron obsidian canvas.');
    setTimeout(() => setWallpaperSavedMsg(null), 2500);
  };

  const handleSaveSystemPrompt = () => {
    if (!activeConversation) return;
    onUpdateConversations(
      conversations.map((c) =>
        c.id === activeConversation.id
          ? { ...c, systemInstructions: systemPromptDraft.trim(), updatedAt: Date.now() }
          : c
      )
    );
    setSystemPromptSaved(true);
    setTimeout(() => setSystemPromptSaved(false), 2200);
  };

  const handleExportBackup = () => {
    const payload = createVersionedBackup({
      memories,
      memorySuggestions: suggestions,
      conversations,
      messages,
      models,
      appearance,
      includeAttachments: includeAttachmentsInBackup,
    });
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aevyron-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setRestoreStatusBanner({
      type: 'success',
      text: `Exported versioned JSON backup (${memories.length} memories, ${conversations.length} conversations).`,
    });
  };

  const handleBackupFileSelected = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const raw = await files[0].text();
    const validation = validateBackupJson(raw);
    setRestoreValidation(validation);
    if (!validation.valid) {
      setRestoreStatusBanner({
        type: 'error',
        text: validation.error || 'Invalid backup file.',
      });
    } else {
      setRestoreStatusBanner(null);
    }
  };

  const handleConfirmRestoreBackup = () => {
    if (!restoreValidation?.valid || !restoreValidation.payload) return;
    const result = applyBackupRestore({
      existingMemories: memories,
      existingConversations: conversations,
      existingMessages: messages,
      backup: restoreValidation.payload,
      strategy: restoreStrategy,
    });
    onRestoreData({
      memories: result.memories,
      conversations: result.conversations,
      messages: result.messages,
    });
    setRestoreValidation(null);
    setRestoreStatusBanner({
      type: 'success',
      text: `Restore complete: ${result.addedMemories} memories and ${result.addedConversations} conversations applied.`,
    });
  };

  const activeSourceFile = ANDROID_PROJECT_FILES[selectedSourceIdx] || ANDROID_PROJECT_FILES[0];

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 pb-24 space-y-6">
      {/* Header & Creator <Marquee/> Banner */}
      <div className="rounded-2xl bg-[#111827] border border-slate-800 p-4 sm:p-5 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              Aevyron AI — All Options & Settings
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Language (English / বাংলা), Voice Talk, Wikipedia Media, Active Model, Custom Wallpaper, Backup & Android APK
            </p>
          </div>
          <span className="text-xs font-mono text-teal-400 font-semibold">
            Realme P4 5G (8 GB RAM / 256 GB)
          </span>
        </div>

        <div className="py-2 px-3 rounded-xl bg-slate-950 border border-teal-500/30">
          <Marquee text="Created by Indranil Officals · Aevyron AI · 100% Offline Local LLM + Wikipedia Images & Videos · English & বাংলা (Bengali) Voice & Chat" />
        </div>
      </div>

      {/* SECTION 1: AI CHAT, BENGALI LANGUAGE, VOICE TALK, WIKIPEDIA & MODEL OPTIONS */}
      <div className="rounded-2xl bg-[#111827] border border-slate-800 p-5 space-y-5">
        <div className="flex items-center gap-2 pb-2 border-b border-slate-800">
          <Sliders className="w-4 h-4 text-teal-400" />
          <h2 className="text-base font-bold text-white">
            1. Chat, Language (English / বাংলা), Voice & Wikipedia Options
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Language Selector */}
          <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2">
            <label
              htmlFor="settings-lang-select"
              className="flex items-center gap-1.5 text-xs font-semibold text-white"
            >
              <Globe className="w-3.5 h-3.5 text-teal-400" />
              <span>Chat & Talk Language</span>
            </label>
            <select
              id="settings-lang-select"
              value={appearance.languagePreference || 'auto'}
              onChange={(e) =>
                onUpdateAppearance({
                  ...appearance,
                  languagePreference: e.target.value as LanguagePreference,
                })
              }
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs font-semibold text-white focus:outline-none focus:border-teal-500"
            >
              <option value="auto">Auto (English + বাংলা)</option>
              <option value="bn">বাংলা (Always Bengali)</option>
              <option value="en">English</option>
            </select>
            <p className="text-[11px] text-slate-400">
              Speak or type in Bengali (`বাংলা`), Banglish, or English.
            </p>
          </div>

          {/* Voice Auto-Speak Toggle */}
          <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                {appearance.voiceAutoSpeak ? (
                  <Volume2 className="w-3.5 h-3.5 text-teal-400" />
                ) : (
                  <VolumeX className="w-3.5 h-3.5 text-slate-400" />
                )}
                <span>Voice Auto-Speak</span>
              </span>
            </div>
            <button
              type="button"
              onClick={() =>
                onUpdateAppearance({
                  ...appearance,
                  voiceAutoSpeak: !appearance.voiceAutoSpeak,
                })
              }
              className={`w-full py-2 px-3 rounded-xl text-xs font-semibold transition-colors ${
                appearance.voiceAutoSpeak
                  ? 'bg-teal-500 text-slate-950'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
              }`}
            >
              {appearance.voiceAutoSpeak ? 'Enabled (🔊 Speaking Replies)' : 'Disabled (Tap to Enable)'}
            </button>
            <p className="text-[11px] text-slate-400">
              Automatically reads replies aloud in Bengali (`bn-IN`) or English.
            </p>
          </div>

          {/* Wikipedia + Media Toggle */}
          <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2">
            <div className="text-xs font-semibold text-white flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-teal-400" />
              <span>Wikipedia + Images & Video</span>
            </div>
            <button
              type="button"
              onClick={() =>
                onUpdateAppearance({
                  ...appearance,
                  wikipediaEnabled: appearance.wikipediaEnabled === false ? true : false,
                })
              }
              className={`w-full py-2 px-3 rounded-xl text-xs font-semibold transition-colors ${
                appearance.wikipediaEnabled !== false
                  ? 'bg-teal-500 text-slate-950'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
              }`}
            >
              {appearance.wikipediaEnabled !== false
                ? 'Connected (Info + Images + Videos)'
                : 'Disabled (Offline Local Only)'}
            </button>
            <p className="text-[11px] text-slate-400">
              Sends Wikipedia facts, images, and playable videos in Chat.
            </p>
          </div>

          {/* Active Model Selector */}
          <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2">
            <label
              htmlFor="settings-model-select"
              className="flex items-center gap-1.5 text-xs font-semibold text-white"
            >
              <Cpu className="w-3.5 h-3.5 text-teal-400" />
              <span>Active Local GGUF Model</span>
            </label>
            <select
              id="settings-model-select"
              value={loadedModel?.id || ''}
              onChange={(e) => {
                const nextId = e.target.value;
                if (activeConversation) {
                  onUpdateConversations(
                    conversations.map((c) =>
                      c.id === activeConversation.id ? { ...c, selectedModelId: nextId } : c
                    )
                  );
                }
                onSelectAndLoadModel(nextId);
              }}
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs font-semibold text-white focus:outline-none focus:border-teal-500"
            >
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.status === 'loaded' ? `[Loaded] ${m.modelName}` : m.modelName} ({m.quantization})
                </option>
              ))}
            </select>
            <p className="text-[11px] text-slate-400">
              Zero API keys required. Import `.gguf` files in the Models tab.
            </p>
          </div>
        </div>

        {/* System Instructions Editor */}
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="settings-sys-prompt" className="text-xs font-semibold text-white">
              System Instructions (Active Chat Persona)
            </label>
            {systemPromptSaved && (
              <span className="text-xs text-teal-400 font-semibold">✓ Saved to Chat</span>
            )}
          </div>
          <div className="flex flex-col sm:flex-row gap-2.5">
            <textarea
              id="settings-sys-prompt"
              value={systemPromptDraft}
              onChange={(e) => setSystemPromptDraft(e.target.value)}
              rows={2}
              className="flex-1 p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-100 focus:outline-none focus:border-teal-500"
            />
            <button
              type="button"
              onClick={handleSaveSystemPrompt}
              className="px-4 py-2.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-semibold text-xs whitespace-nowrap shrink-0 self-end sm:self-stretch"
            >
              Save Instructions
            </button>
          </div>
        </div>
      </div>

      {/* SECTION 2: CUSTOM PHONE WALLPAPER & APPEARANCE (INSTANT APPLY) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-7 rounded-2xl bg-[#111827] border border-slate-800 p-5 space-y-5">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <ImageIcon className="w-4 h-4 text-teal-400" />
              <span>2. Custom Chat Wallpaper & Appearance (Instant Apply)</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Pick any photo from your phone gallery or tap a preset wallpaper below. Changes apply immediately to your Chat screen!
            </p>
          </div>

          <input
            ref={wallpaperInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => handleSelectPhoneWallpaper(e.target.files)}
          />

          <div className="flex flex-wrap gap-2.5">
            <button
              type="button"
              onClick={() => wallpaperInputRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs transition-colors min-h-[42px] whitespace-nowrap"
            >
              <Upload className="w-4 h-4" />
              <span>Upload Wallpaper from Phone Gallery</span>
            </button>

            {appearance.wallpaperDataUrl && (
              <button
                type="button"
                onClick={handleRemoveWallpaper}
                className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-rose-950/60 hover:bg-rose-900/70 border border-rose-700/60 text-rose-200 text-xs font-semibold transition-colors min-h-[42px] whitespace-nowrap"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Remove Wallpaper</span>
              </button>
            )}
          </div>

          {/* 4 Visual Preset Wallpaper Cards */}
          <div className="space-y-2">
            <div className="text-xs font-semibold text-slate-300">
              Instant Offline Wallpapers (Tap any card to apply immediately):
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {BUILTIN_OFFLINE_WALLPAPERS.map((preset) => {
                const isSelected = appearance.wallpaperName === preset.name;
                return (
                  <button
                    key={preset.id}
                    id={preset.id}
                    type="button"
                    onClick={() => handleSelectPresetWallpaper(preset.dataUrl, preset.name)}
                    className={`group relative rounded-xl overflow-hidden border text-left transition-all ${
                      isSelected
                        ? 'border-teal-400 ring-2 ring-teal-500/40'
                        : 'border-slate-800 hover:border-slate-600'
                    }`}
                  >
                    <img
                      src={preset.dataUrl}
                      alt={preset.name}
                      className="w-full h-24 object-cover"
                    />
                    <div className="p-2 bg-slate-950/90 text-[11px] font-semibold text-white truncate">
                      {preset.name}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Live Fit / Dimming / Opacity Controls (Immediate Update) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Wallpaper Scaling Mode
              </label>
              <div className="flex items-center gap-1 p-1 bg-slate-950 rounded-xl border border-slate-800">
                {(
                  [
                    { id: 'cover', label: 'Cover' },
                    { id: 'contain', label: 'Fit' },
                    { id: 'center', label: 'Center' },
                  ] as const
                ).map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() =>
                      onUpdateAppearance({
                        ...appearance,
                        wallpaperFit: mode.id as WallpaperFitMode,
                      })
                    }
                    className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                      appearance.wallpaperFit === mode.id
                        ? 'bg-teal-500 text-slate-950 font-semibold'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label
                htmlFor="wallpaper-dimming-range"
                className="block text-xs font-medium text-slate-300 mb-1.5 tabular-nums"
              >
                Background Dimming: {appearance.wallpaperDimming}%
              </label>
              <input
                id="wallpaper-dimming-range"
                type="range"
                min={10}
                max={85}
                value={appearance.wallpaperDimming}
                onChange={(e) =>
                  onUpdateAppearance({
                    ...appearance,
                    wallpaperDimming: Number(e.target.value),
                  })
                }
                className="w-full accent-teal-500"
              />
            </div>

            <div>
              <label
                htmlFor="bubble-opacity-range"
                className="block text-xs font-medium text-slate-300 mb-1.5 tabular-nums"
              >
                Chat Bubble Opacity: {appearance.bubbleOpacity}%
              </label>
              <input
                id="bubble-opacity-range"
                type="range"
                min={70}
                max={100}
                value={appearance.bubbleOpacity}
                onChange={(e) =>
                  onUpdateAppearance({
                    ...appearance,
                    bubbleOpacity: Number(e.target.value),
                  })
                }
                className="w-full accent-teal-500"
              />
            </div>
          </div>

          {wallpaperSavedMsg && (
            <div className="p-3 rounded-xl bg-teal-950/70 border border-teal-500/50 text-xs text-teal-200 font-semibold">
              ✓ {wallpaperSavedMsg}
            </div>
          )}
        </div>

        {/* Live Chat Wallpaper Preview Card */}
        <div className="lg:col-span-5 rounded-2xl bg-[#111827] border border-slate-800 p-5 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-white">Live Chat Wallpaper Preview</span>
            <span className="text-teal-300 font-semibold truncate max-w-[180px]">
              {appearance.wallpaperName || 'Default Obsidian Canvas'}
            </span>
          </div>

          <div className="relative h-72 rounded-2xl overflow-hidden border border-slate-700 bg-[#090D16] p-4 flex flex-col justify-between">
            {appearance.wallpaperDataUrl && (
              <div className="absolute inset-0 pointer-events-none overflow-hidden">
                <img
                  src={appearance.wallpaperDataUrl}
                  alt="Active wallpaper preview"
                  className={`w-full h-full ${
                    appearance.wallpaperFit === 'cover'
                      ? 'object-cover'
                      : appearance.wallpaperFit === 'contain'
                      ? 'object-contain'
                      : 'object-none object-center'
                  }`}
                />
                <div
                  className="absolute inset-0 bg-[#090D16]"
                  style={{ opacity: (appearance.wallpaperDimming ?? 38) / 100 }}
                />
              </div>
            )}

            <div className="relative z-10 space-y-3">
              <div
                style={{ opacity: appearance.bubbleOpacity / 100 }}
                className="ml-auto max-w-[80%] rounded-2xl p-3 bg-[#162235] border border-teal-500/30 text-xs text-white"
              >
                হ্যালো! Wallpaper is live behind my chat bubbles!
              </div>
              <div
                style={{ opacity: appearance.bubbleOpacity / 100 }}
                className="mr-auto max-w-[85%] rounded-2xl p-3 bg-[#111827] border border-slate-800 text-xs text-slate-100"
              >
                Active wallpaper: <strong>{appearance.wallpaperName || 'Default'}</strong> (Dimming:{' '}
                <strong>{appearance.wallpaperDimming}%</strong>).
              </div>
            </div>

            <div className="relative z-10 text-[11px] text-slate-300 text-center bg-slate-950/70 py-1 rounded-lg">
              Automatically saved to Chat · Works 100% Offline
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 3: INSTALL ON PHONE (PWA) & NATIVE ANDROID APK STUDIO */}
      <div className="rounded-2xl bg-[#111827] border border-slate-800 p-5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Smartphone className="w-5 h-5 text-teal-400 shrink-0" />
              <span>3. Install on Phone & Native Android `arm64-v8a` APK Studio</span>
            </h2>
            <p className="text-xs text-slate-400 leading-relaxed max-w-3xl">
              Install Aevyron AI directly on your <strong>Realme P4 5G</strong> as a standalone offline app, or download the complete Android Studio Kotlin + JNI <code className="font-mono text-teal-300">llama.cpp</code> source project (<code className="font-mono text-teal-300">aevyron-android-source.zip</code>).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {isInstallable && onInstallPwa && (
              <button
                type="button"
                onClick={onInstallPwa}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs transition-colors min-h-[42px]"
              >
                <Download className="w-4 h-4" />
                <span>Install App on Phone</span>
              </button>
            )}
            <a
              href="/aevyron-android-source.zip"
              download="aevyron-android-source.zip"
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-teal-300 font-bold text-xs transition-colors min-h-[42px] whitespace-nowrap"
            >
              <FileArchive className="w-4 h-4" />
              <span>Download Android Studio Project (.zip)</span>
            </a>
          </div>
        </div>

        {!isInstalled && !isInstallable && (
          <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 text-xs text-slate-300">
            {isIOS ? (
              <span>
                <strong>Install on iPhone/iPad:</strong> Tap the Safari <strong>Share</strong> button and choose <strong>Add to Home Screen</strong>.
              </span>
            ) : (
              <span>
                <strong>Install on Realme P4 5G:</strong> Tap the 3-dot menu in Chrome and select <strong>Install app / Add to Home screen</strong> for full-screen offline mode.
              </span>
            )}
          </div>
        )}

        {/* Native Source Code Inspector */}
        <div className="rounded-xl bg-slate-950 border border-slate-800 overflow-hidden">
          <div className="p-3 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 overflow-x-auto">
              {ANDROID_PROJECT_FILES.map((file, idx) => (
                <button
                  key={file.path}
                  type="button"
                  onClick={() => setSelectedSourceIdx(idx)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-mono transition-colors whitespace-nowrap shrink-0 ${
                    selectedSourceIdx === idx
                      ? 'bg-teal-500 text-slate-950 font-semibold'
                      : 'bg-slate-900 text-slate-400 hover:text-white'
                  }`}
                >
                  {file.path}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(activeSourceFile.content);
                setCopiedSource(true);
                setTimeout(() => setCopiedSource(false), 1800);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 whitespace-nowrap shrink-0"
            >
              {copiedSource ? (
                <>
                  <Check className="w-3.5 h-3.5 text-teal-400" />
                  <span className="text-teal-300">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy File</span>
                </>
              )}
            </button>
          </div>

          <div className="px-3.5 py-2 bg-slate-900/70 border-b border-slate-800/80 text-xs text-slate-400 flex items-center gap-2">
            <Code2 className="w-4 h-4 text-teal-400 shrink-0" />
            <span>{activeSourceFile.description}</span>
          </div>

          <pre className="p-3.5 bg-[#070A12] text-xs font-mono text-slate-200 overflow-x-auto max-h-72 leading-relaxed">
            <code>{activeSourceFile.content}</code>
          </pre>
        </div>
      </div>

      {/* SECTION 4: BACKUP, RESTORE, PRIVACY & ABOUT */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-2xl bg-[#111827] border border-slate-800 p-5 space-y-4">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Download className="w-4 h-4 text-teal-400" />
            <span>4. Local JSON Backup & Restore</span>
          </h2>
          <p className="text-xs text-slate-400 leading-relaxed">
            Export or restore your confirmed personal memories ({memories.length}), conversations ({conversations.length}), and settings offline.
          </p>

          <label className="flex items-center gap-2 text-xs text-slate-200 cursor-pointer">
            <input
              type="checkbox"
              checked={includeAttachmentsInBackup}
              onChange={(e) => setIncludeAttachmentsInBackup(e.target.checked)}
              className="rounded border-slate-700 text-teal-500"
            />
            <span>Include attachment previews in JSON backup</span>
          </label>

          <div className="flex flex-wrap gap-2.5">
            <button
              type="button"
              onClick={handleExportBackup}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-semibold text-xs transition-colors min-h-[42px]"
            >
              <Download className="w-4 h-4" />
              <span>Export Backup (.json)</span>
            </button>

            <input
              ref={backupInputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(e) => handleBackupFileSelected(e.target.files)}
            />

            <button
              type="button"
              onClick={() => backupInputRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-semibold text-xs transition-colors min-h-[42px]"
            >
              <Upload className="w-4 h-4 text-teal-400" />
              <span>Restore Backup (.json)</span>
            </button>
          </div>

          {restoreValidation?.valid && restoreValidation.summary && (
            <div className="p-3.5 rounded-xl bg-slate-950 border border-teal-500/50 space-y-2.5 text-xs">
              <div className="font-bold text-teal-300">
                Backup Verified ({restoreValidation.summary.memoriesCount} memories,{' '}
                {restoreValidation.summary.conversationsCount} chats)
              </div>
              <select
                value={restoreStrategy}
                onChange={(e) => setRestoreStrategy(e.target.value as RestoreConflictStrategy)}
                className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white"
              >
                <option value="merge-skip-duplicates">Merge & Skip Duplicates</option>
                <option value="merge-overwrite">Merge & Overwrite Duplicates</option>
                <option value="replace-all">Replace All Local Data</option>
              </select>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleConfirmRestoreBackup}
                  className="px-3.5 py-2 rounded-lg bg-teal-500 text-slate-950 font-semibold"
                >
                  Confirm Restore
                </button>
                <button
                  type="button"
                  onClick={() => setRestoreValidation(null)}
                  className="px-3 py-2 rounded-lg bg-slate-800 text-slate-300"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {restoreStatusBanner && (
            <div
              className={`p-3 rounded-xl border text-xs ${
                restoreStatusBanner.type === 'success'
                  ? 'bg-teal-950/60 border-teal-700/60 text-teal-200'
                  : 'bg-rose-950/60 border-rose-700/60 text-rose-200'
              }`}
            >
              {restoreStatusBanner.text}
            </div>
          )}
        </div>

        {/* About & Privacy Reset */}
        <div className="rounded-2xl bg-[#111827] border border-slate-800 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-teal-400" />
                <span>About Aevyron AI & Privacy</span>
              </h2>
              <p className="text-sm font-bold text-teal-400 mt-1">
                Created by Indranil Officals
              </p>
            </div>
            <span className="text-xs font-mono text-slate-400">v2.0-realme-p4</span>
          </div>

          <p className="text-xs text-slate-300 leading-relaxed">
            Built for the <strong>Realme P4 5G (8 GB RAM, 256 GB storage)</strong>. Features 100% offline bilingual (English & বাংলা) AI chat, voice talk, Personal Memory Vault, local GGUF model execution, and Wikipedia Encyclopedia + Image & Video integration with zero API keys.
          </p>

          <div className="pt-2 border-t border-slate-800">
            {confirmClearData ? (
              <div className="p-3 rounded-xl bg-rose-950/50 border border-rose-700/60 space-y-2.5 text-xs">
                <div className="text-rose-200 font-semibold">
                  Erase all saved memories, conversations, and custom settings from this device?
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onResetAllData();
                      setConfirmClearData(false);
                    }}
                    className="px-3.5 py-2 rounded-lg bg-rose-600 text-white font-semibold"
                  >
                    Confirm Erase All
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmClearData(false)}
                    className="px-3 py-2 rounded-lg bg-slate-800 text-slate-300"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmClearData(true)}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-rose-950/40 hover:bg-rose-900/50 border border-rose-800/60 text-rose-300 text-xs font-semibold transition-colors min-h-[42px]"
              >
                <Trash2 className="w-4 h-4" />
                <span>Clear All Personal Data & Reset Vault</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
