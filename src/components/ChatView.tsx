import React, { useEffect, useRef, useState } from 'react';
import {
  Archive,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Copy,
  Download,
  Edit3,
  FileText,
  FolderOpen,
  Globe,
  MessageSquarePlus,
  Mic,
  MicOff,
  Plus,
  RefreshCw,
  Search,
  Send,
  Sliders,
  Sparkles,
  Square,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import {
  AppearanceSettings,
  ChatMessage,
  Conversation,
  GenerationTiming,
  LanguagePreference,
  MemoryFact,
  MemorySuggestion,
  MessageAttachment,
  NavigationTab,
  RegisteredModel,
} from '../types/aevyron';
import {
  extractCandidateMemories,
  retrieveRelevantMemories,
} from '../utils/memoryPipeline';
import { runLocalStreamingInference } from '../utils/localInferenceEngine';
import { AttachmentSheet } from './AttachmentSheet';
import { MarkdownRenderer } from './MarkdownRenderer';

interface ChatViewProps {
  conversations: Conversation[];
  messages: ChatMessage[];
  models: RegisteredModel[];
  memories: MemoryFact[];
  suggestions: MemorySuggestion[];
  appearance: AppearanceSettings;
  onUpdateAppearance: (next: AppearanceSettings) => void;
  onUpdateConversations: (next: Conversation[]) => void;
  onUpdateMessages: (next: ChatMessage[]) => void;
  onAddSuggestion: (sugs: MemorySuggestion[]) => void;
  onConfirmSuggestion: (sug: MemorySuggestion) => void;
  onDismissSuggestion: (sugId: string) => void;
  onNavigateTab: (tab: NavigationTab) => void;
  onSelectAndLoadModel: (modelId: string) => void;
}

export const ChatView: React.FC<ChatViewProps> = ({
  conversations,
  messages,
  models,
  memories,
  suggestions,
  appearance,
  onUpdateAppearance,
  onUpdateConversations,
  onUpdateMessages,
  onAddSuggestion,
  onConfirmSuggestion,
  onDismissSuggestion,
  onNavigateTab,
  onSelectAndLoadModel,
}) => {
  const [activeConvId, setActiveConvId] = useState<string>(
    conversations.find((c) => !c.isArchived)?.id || conversations[0]?.id || ''
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  const [composerText, setComposerText] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState<MessageAttachment[]>([]);
  const [isAttachmentSheetOpen, setIsAttachmentSheetOpen] = useState(false);

  const [isSystemPromptModalOpen, setIsSystemPromptModalOpen] = useState(false);
  const [draftSystemPrompt, setDraftSystemPrompt] = useState('');

  const [renamingConvId, setRenamingConvId] = useState<string | null>(null);
  const [renameTitle, setRenameTitle] = useState('');

  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editMsgContent, setEditMsgContent] = useState('');

  const [expandedTimingMsgIds, setExpandedTimingMsgIds] = useState<Record<string, boolean>>({});
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const [speakingMsgId, setSpeakingMsgId] = useState<string | null>(null);
  const [isListeningVoice, setIsListeningVoice] = useState(false);
  const [confirmClearAll, setConfirmClearAll] = useState(false);

  // Generation state & live elapsed timer
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationPhase, setGenerationPhase] = useState<'idle' | 'prefill' | 'generating'>('idle');
  const [liveElapsedMs, setLiveElapsedMs] = useState(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const recognitionRef = useRef<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const currentLangPref: LanguagePreference = appearance.languagePreference || 'auto';

  const activeConversation =
    conversations.find((c) => c.id === activeConvId) || conversations[0] || null;

  const loadedModel = models.find((m) => m.status === 'loaded') || null;
  const selectedModelForChat =
    models.find((m) => m.id === activeConversation?.selectedModelId) || loadedModel;

  const activeMessages = messages
    .filter((m) => m.conversationId === activeConversation?.id)
    .sort((a, b) => a.createdAt - b.createdAt);

  useEffect(() => {
    if (!activeConversation && conversations.length > 0) {
      setActiveConvId(conversations[0].id);
    }
  }, [conversations, activeConversation]);

  // Live timer while generation is in progress
  useEffect(() => {
    if (!isGenerating) return;
    const start = performance.now();
    const interval = setInterval(() => {
      setLiveElapsedMs(Math.round(performance.now() - start));
    }, 60);
    return () => clearInterval(interval);
  }, [isGenerating]);

  // Cleanup / cancel ongoing generation if conversation switches or component unmounts
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, [activeConvId]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleCreateNewChat = () => {
    const newConv: Conversation = {
      id: `conv-${Date.now()}`,
      title: 'New Local Conversation',
      systemInstructions:
        'You are Aevyron, a personal offline AI assistant Created by Indranil Officals for the Realme P4 5G (8 GB RAM, 256 GB storage). Use retrieved facts from the local Personal Memory Vault accurately and never fabricate capabilities.',
      selectedModelId: loadedModel?.id || models[0]?.id || null,
      isArchived: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    onUpdateConversations([newConv, ...conversations]);
    setActiveConvId(newConv.id);
    setMobileDrawerOpen(false);
  };

  const handleRenameConversation = (convId: string) => {
    if (!renameTitle.trim()) {
      setRenamingConvId(null);
      return;
    }
    onUpdateConversations(
      conversations.map((c) =>
        c.id === convId ? { ...c, title: renameTitle.trim(), updatedAt: Date.now() } : c
      )
    );
    setRenamingConvId(null);
  };

  const handleToggleArchive = (convId: string) => {
    onUpdateConversations(
      conversations.map((c) =>
        c.id === convId ? { ...c, isArchived: !c.isArchived, updatedAt: Date.now() } : c
      )
    );
  };

  const handleDeleteConversation = (convId: string) => {
    const remaining = conversations.filter((c) => c.id !== convId);
    const remainingMsgs = messages.filter((m) => m.conversationId !== convId);
    onUpdateMessages(remainingMsgs);
    if (remaining.length === 0) {
      const fallback: Conversation = {
        id: `conv-${Date.now()}`,
        title: 'New Local Conversation',
        systemInstructions:
          'You are Aevyron, a personal offline AI assistant Created by Indranil Officals.',
        selectedModelId: loadedModel?.id || null,
        isArchived: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      onUpdateConversations([fallback]);
      setActiveConvId(fallback.id);
    } else {
      onUpdateConversations(remaining);
      if (activeConvId === convId) {
        setActiveConvId(remaining[0].id);
      }
    }
  };

  const handleClearAllHistory = () => {
    abortControllerRef.current?.abort();
    const freshConv: Conversation = {
      id: `conv-${Date.now()}`,
      title: 'Fresh Local Conversation',
      systemInstructions:
        'You are Aevyron, a personal offline AI assistant Created by Indranil Officals.',
      selectedModelId: loadedModel?.id || null,
      isArchived: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    onUpdateConversations([freshConv]);
    onUpdateMessages([]);
    setActiveConvId(freshConv.id);
    setConfirmClearAll(false);
  };

  const handleExportSingleConversation = (conv: Conversation) => {
    const convMsgs = messages.filter((m) => m.conversationId === conv.id);
    const payload = {
      schemaVersion: 'aevyron-conversation-export-v1',
      exportedAt: new Date().toISOString(),
      createdBy: 'Created by Indranil Officals',
      conversation: conv,
      messages: convMsgs,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${conv.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const executePromptGeneration = async (
    targetConversation: Conversation,
    historyThroughUserTurn: ChatMessage[],
    userPromptText: string
  ) => {
    const activeTargetModel =
      models.find((m) => m.id === targetConversation.selectedModelId && m.status === 'loaded') ||
      loadedModel;

    const assistantMsgId = `msg-asst-${Date.now()}`;

    if (!activeTargetModel || activeTargetModel.status !== 'loaded') {
      const errorMsg: ChatMessage = {
        id: assistantMsgId,
        conversationId: targetConversation.id,
        role: 'assistant',
        content:
          '### No GGUF Model Initialized in Native Memory\nAevyron never simulates responses when no local model is loaded. Open the **Models** screen to load `Qwen2.5-1.5B-Instruct-Q4_K_M.gguf` or another imported `.gguf` file first.',
        createdAt: Date.now(),
        attachments: [],
        isError: true,
      };
      onUpdateMessages([...messages.filter((m) => m.conversationId !== targetConversation.id), ...historyThroughUserTurn, errorMsg]);
      return;
    }

    const retrievedMemories = retrieveRelevantMemories(userPromptText, memories, 6);

    const placeholderAssistant: ChatMessage = {
      id: assistantMsgId,
      conversationId: targetConversation.id,
      role: 'assistant',
      modelId: activeTargetModel.id,
      modelName: activeTargetModel.modelName,
      content: '',
      createdAt: Date.now(),
      attachments: [],
      isStreaming: true,
    };

    const baseOtherMessages = messages.filter((m) => m.conversationId !== targetConversation.id);
    let currentMessagesState = [...baseOtherMessages, ...historyThroughUserTurn, placeholderAssistant];
    onUpdateMessages(currentMessagesState);
    setTimeout(scrollToBottom, 30);

    setIsGenerating(true);
    setGenerationPhase('prefill');
    setLiveElapsedMs(0);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const result = await runLocalStreamingInference({
        prompt: userPromptText,
        systemInstructions: targetConversation.systemInstructions,
        history: historyThroughUserTurn,
        retrievedMemories,
        activeModel: activeTargetModel,
        runtimeMode: appearance.runtimeMode,
        localServerUrl: appearance.localServerUrl,
        languagePreference: currentLangPref,
        wikipediaEnabled: appearance.wikipediaEnabled !== false,
        signal: controller.signal,
        onPhaseChange: (phase) => setGenerationPhase(phase),
        onWikipediaCard: (wikiCard) => {
          currentMessagesState = currentMessagesState.map((m) =>
            m.id === assistantMsgId
              ? {
                  ...m,
                  wikipediaCard: wikiCard,
                }
              : m
          );
          onUpdateMessages(currentMessagesState);
        },
        onToken: (_piece, partialTiming: GenerationTiming) => {
          currentMessagesState = currentMessagesState.map((m) =>
            m.id === assistantMsgId
              ? {
                  ...m,
                  content: m.content + _piece,
                  timing: partialTiming,
                }
              : m
          );
          onUpdateMessages(currentMessagesState);
          scrollToBottom();
        },
      });

      const finalContent =
        result.content ||
        (result.timing.wasCancelled
          ? '*[Generation cancelled by user before completion]*'
          : '*[Empty model output]*');

      const finalMessages = currentMessagesState.map((m) =>
        m.id === assistantMsgId
          ? {
              ...m,
              content: finalContent,
              wikipediaCard: result.wikipediaCard || m.wikipediaCard,
              timing: result.timing,
              isStreaming: false,
            }
          : m
      );
      onUpdateMessages(finalMessages);

      if (appearance.voiceAutoSpeak && result.content && !result.timing.wasCancelled) {
        speakMessageAloud(assistantMsgId, result.content);
      }
    } catch (err: any) {
      const errMessages = currentMessagesState.map((m) =>
        m.id === assistantMsgId
          ? {
              ...m,
              content: `### Local Runtime Error\n${err?.message || 'Unknown inference failure'}`,
              isStreaming: false,
              isError: true,
            }
          : m
      );
      onUpdateMessages(errMessages);
    } finally {
      setIsGenerating(false);
      setGenerationPhase('idle');
      abortControllerRef.current = null;
      setTimeout(scrollToBottom, 80);
    }
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isGenerating) return;
    const text = composerText.trim();
    if (!text && pendingAttachments.length === 0) return;
    if (!activeConversation) return;

    const userMsg: ChatMessage = {
      id: `msg-user-${Date.now()}`,
      conversationId: activeConversation.id,
      role: 'user',
      content: text || `Attached ${pendingAttachments.map((a) => a.name).join(', ')}`,
      createdAt: Date.now(),
      attachments: [...pendingAttachments],
    };

    // Update conversation title automatically if still default
    const shouldAutoTitle =
      activeMessages.length === 0 || activeConversation.title === 'New Local Conversation';
    const nextTitle = shouldAutoTitle
      ? (text || pendingAttachments[0]?.name || 'Local Chat').slice(0, 42)
      : activeConversation.title;

    const updatedConv: Conversation = {
      ...activeConversation,
      title: nextTitle,
      updatedAt: Date.now(),
    };

    onUpdateConversations(
      conversations.map((c) => (c.id === updatedConv.id ? updatedConv : c))
    );

    // Extract candidate memories if enabled in settings
    if (appearance.autoMemorySuggestions && text.length >= 10) {
      const candidateSugs = extractCandidateMemories(text, memories, updatedConv.id);
      if (candidateSugs.length > 0) {
        onAddSuggestion(candidateSugs);
      }
    }

    setComposerText('');
    setPendingAttachments([]);

    const updatedHistory = [...activeMessages, userMsg];
    await executePromptGeneration(updatedConv, updatedHistory, userMsg.content);
  };

  const handleStopGeneration = () => {
    abortControllerRef.current?.abort();
  };

  const handleRegenerateLastResponse = async (assistantMessageId: string) => {
    if (isGenerating || !activeConversation) return;
    const idx = activeMessages.findIndex((m) => m.id === assistantMessageId);
    if (idx <= 0) return;

    const historyUpToUser = activeMessages.slice(0, idx);
    const lastUserMsg = [...historyUpToUser].reverse().find((m) => m.role === 'user');
    if (!lastUserMsg) return;

    await executePromptGeneration(activeConversation, historyUpToUser, lastUserMsg.content);
  };

  const handleEditAndResendUserMessage = async (messageId: string) => {
    if (isGenerating || !activeConversation || !editMsgContent.trim()) return;
    const idx = activeMessages.findIndex((m) => m.id === messageId);
    if (idx < 0) return;

    const editedUserMsg: ChatMessage = {
      ...activeMessages[idx],
      content: editMsgContent.trim(),
      updatedAt: Date.now(),
    };

    const historyThroughEdited = [...activeMessages.slice(0, idx), editedUserMsg];
    setEditingMsgId(null);
    setEditMsgContent('');

    await executePromptGeneration(activeConversation, historyThroughEdited, editedUserMsg.content);
  };

  const handleCopyMessage = async (msg: ChatMessage) => {
    try {
      await navigator.clipboard.writeText(msg.content);
      setCopiedMsgId(msg.id);
      setTimeout(() => setCopiedMsgId(null), 1800);
    } catch {
      // ignore
    }
  };

  const speakMessageAloud = (msgId: string, rawMarkdown: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    if (speakingMsgId === msgId) {
      setSpeakingMsgId(null);
      return;
    }

    const cleanSpeech = rawMarkdown
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/[*#>`_~-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!cleanSpeech) return;

    const utterance = new SpeechSynthesisUtterance(cleanSpeech);
    const hasBengali = /[\u0980-\u09FF]/.test(cleanSpeech);
    utterance.lang = hasBengali ? 'bn-IN' : 'en-US';

    const voices = window.speechSynthesis.getVoices();
    if (hasBengali) {
      const bnVoice = voices.find((v) => v.lang.toLowerCase().startsWith('bn'));
      if (bnVoice) utterance.voice = bnVoice;
    }

    utterance.onend = () => setSpeakingMsgId(null);
    utterance.onerror = () => setSpeakingMsgId(null);
    setSpeakingMsgId(msgId);
    window.speechSynthesis.speak(utterance);
  };

  const handleToggleVoiceInput = () => {
    if (typeof window === 'undefined') return;
    const SpeechRec =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRec) {
      setComposerText((prev) =>
        prev || (currentLangPref === 'bn' ? 'হ্যালো! তুমি কেমন আছো?' : 'Hello! Speak in Bengali')
      );
      return;
    }

    if (isListeningVoice && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListeningVoice(false);
      return;
    }

    try {
      const recognition = new SpeechRec();
      recognition.lang = currentLangPref === 'bn' ? 'bn-IN' : 'en-US';
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => setIsListeningVoice(true);
      recognition.onresult = (event: any) => {
        const transcript = event?.results?.[0]?.[0]?.transcript || '';
        if (transcript) {
          setComposerText((prev) => (prev ? `${prev} ${transcript}` : transcript));
        }
      };
      recognition.onerror = () => setIsListeningVoice(false);
      recognition.onend = () => setIsListeningVoice(false);

      recognitionRef.current = recognition;
      recognition.start();
    } catch {
      setIsListeningVoice(false);
    }
  };

  const filteredConversations = conversations.filter((c) => {
    if (c.isArchived !== showArchived) return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const titleMatch = c.title.toLowerCase().includes(q);
    const msgMatch = messages.some(
      (m) => m.conversationId === c.id && m.content.toLowerCase().includes(q)
    );
    return titleMatch || msgMatch;
  });

  const conversationSuggestions = suggestions.filter(
    (s) => !s.sourceConversationId || s.sourceConversationId === activeConversation?.id
  );

  return (
    <div className="flex h-[calc(100vh-57px-64px)] md:h-[calc(100vh-61px)] overflow-hidden relative">
      {/* Left Conversation History Drawer / Sidebar */}
      <aside
        className={`${
          mobileDrawerOpen ? 'fixed inset-y-0 left-0 z-40 w-80' : 'hidden'
        } lg:flex lg:static lg:w-80 flex-col bg-[#0C111D] border-r border-slate-800/80 shrink-0`}
        aria-label="Conversation history"
      >
        <div className="p-3.5 border-b border-slate-800/80 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={handleCreateNewChat}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-semibold text-xs transition-colors min-h-[42px] whitespace-nowrap shrink-0"
            >
              <MessageSquarePlus className="w-4 h-4" />
              <span>New Local Chat</span>
            </button>
            {mobileDrawerOpen && (
              <button
                type="button"
                onClick={() => setMobileDrawerOpen(false)}
                className="lg:hidden min-h-[42px] min-w-[42px] flex items-center justify-center rounded-xl bg-slate-800 text-slate-300"
                aria-label="Close conversation drawer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search local history..."
              aria-label="Search local conversation history"
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-teal-500"
            />
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-900/90 rounded-lg border border-slate-800/70">
            <button
              type="button"
              onClick={() => setShowArchived(false)}
              className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                !showArchived ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Active ({conversations.filter((c) => !c.isArchived).length})
            </button>
            <button
              type="button"
              onClick={() => setShowArchived(true)}
              className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                showArchived ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Archived ({conversations.filter((c) => c.isArchived).length})
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2.5 space-y-1.5">
          {filteredConversations.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-400">
              No {showArchived ? 'archived' : 'active'} conversations match your filter.
            </div>
          ) : (
            filteredConversations.map((conv) => {
              const isSelected = conv.id === activeConversation?.id;
              const isRenaming = renamingConvId === conv.id;
              const convMsgCount = messages.filter((m) => m.conversationId === conv.id).length;

              return (
                <div
                  key={conv.id}
                  className={`group rounded-xl p-2.5 transition-colors border ${
                    isSelected
                      ? 'bg-slate-800/90 border-slate-700 text-white'
                      : 'bg-transparent border-transparent hover:bg-slate-900/80 text-slate-300'
                  }`}
                >
                  {isRenaming ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={renameTitle}
                        onChange={(e) => setRenameTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleRenameConversation(conv.id);
                        }}
                        aria-label="Conversation title"
                        className="flex-1 px-2 py-1 rounded bg-slate-950 border border-teal-500 text-xs text-white"
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => handleRenameConversation(conv.id)}
                        className="px-2 py-1 rounded bg-teal-500 text-slate-950 text-xs font-semibold"
                      >
                        Save
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setActiveConvId(conv.id);
                          setMobileDrawerOpen(false);
                        }}
                        className="flex-1 text-left min-w-0"
                      >
                        <div className="text-xs font-semibold truncate">{conv.title}</div>
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mt-1 tabular-nums">
                          <span>{convMsgCount} msgs</span>
                          <span aria-hidden="true">·</span>
                          <span>
                            {new Date(conv.updatedAt).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                      </button>
                      <div className="flex items-center gap-0.5 opacity-80 group-hover:opacity-100">
                        <button
                          type="button"
                          onClick={() => {
                            setRenamingConvId(conv.id);
                            setRenameTitle(conv.title);
                          }}
                          className="p-1.5 rounded-lg hover:bg-slate-700/70 text-slate-400 hover:text-white"
                          aria-label={`Rename conversation ${conv.title}`}
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleExportSingleConversation(conv)}
                          className="p-1.5 rounded-lg hover:bg-slate-700/70 text-slate-400 hover:text-white"
                          aria-label={`Export conversation ${conv.title}`}
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleArchive(conv.id)}
                          className="p-1.5 rounded-lg hover:bg-slate-700/70 text-slate-400 hover:text-white"
                          aria-label={`${conv.isArchived ? 'Unarchive' : 'Archive'} conversation ${conv.title}`}
                        >
                          <Archive className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteConversation(conv.id)}
                          className="p-1.5 rounded-lg hover:bg-rose-500/20 text-slate-400 hover:text-rose-400"
                          aria-label={`Delete conversation ${conv.title}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Bottom History Clear Control */}
        <div className="p-3 border-t border-slate-800/80">
          {confirmClearAll ? (
            <div className="p-2.5 rounded-xl bg-rose-950/40 border border-rose-800/60 space-y-2">
              <div className="text-xs text-rose-200 font-medium">
                Delete all conversations? Personal Memory Vault facts will remain safe.
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleClearAllHistory}
                  className="flex-1 py-1.5 px-2.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold"
                >
                  Confirm Clear All
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmClearAll(false)}
                  className="py-1.5 px-2.5 rounded-lg bg-slate-800 text-slate-300 text-xs"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmClearAll(true)}
              className="w-full py-2 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-rose-300 border border-slate-800 text-xs font-medium transition-colors"
            >
              Clear Conversation History
            </button>
          )}
        </div>
      </aside>

      {/* Main Chat Viewport with Custom Phone Wallpaper Support */}
      <div className="flex-1 flex flex-col min-w-0 relative overflow-hidden bg-[#090D16]">
        {/* Custom Wallpaper Layer (Reliable <img> rendering for Phone Gallery & Presets) */}
        {appearance.wallpaperDataUrl && (
          <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden" aria-hidden="true">
            <img
              src={appearance.wallpaperDataUrl}
              alt=""
              className={`w-full h-full ${
                appearance.wallpaperFit === 'cover'
                  ? 'object-cover'
                  : appearance.wallpaperFit === 'contain'
                  ? 'object-contain'
                  : 'object-none object-center'
              }`}
            />
            <div
              className="absolute inset-0 bg-[#090D16] transition-opacity duration-200"
              style={{ opacity: (appearance.wallpaperDimming ?? 38) / 100 }}
            />
          </div>
        )}

        {/* Clean Chat Subheader (All language, voice, model & wallpaper options moved to Settings) */}
        <div className="relative z-10 flex items-center justify-between gap-2 px-3 sm:px-4 py-2 bg-[#0C111D]/85 backdrop-blur-md border-b border-slate-800/80">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={() => setMobileDrawerOpen(true)}
              className="lg:hidden min-h-[36px] px-3 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-xs font-medium text-slate-200 flex items-center gap-1.5 whitespace-nowrap shrink-0"
              aria-label="Open conversation history drawer"
            >
              <FolderOpen className="w-3.5 h-3.5 text-teal-400" />
              <span>History</span>
            </button>

            <div className="min-w-0">
              <h2 className="text-xs sm:text-sm font-semibold text-white truncate">
                {activeConversation?.title || 'Aevyron AI Chat'}
              </h2>
              <div className="flex items-center gap-1.5 text-[11px] text-slate-400 truncate">
                <span>{selectedModelForChat?.modelName || 'Qwen2.5-1.5B-Instruct'}</span>
                <span aria-hidden="true">·</span>
                <span>
                  {currentLangPref === 'bn'
                    ? 'বাংলা (Bengali)'
                    : currentLangPref === 'en'
                    ? 'English'
                    : 'Auto (EN + বাংলা)'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleCreateNewChat}
              className="min-h-[36px] px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-xs font-medium text-slate-200 flex items-center gap-1.5 whitespace-nowrap shrink-0"
              aria-label="Start new chat"
            >
              <MessageSquarePlus className="w-3.5 h-3.5 text-teal-400" />
              <span>New Chat</span>
            </button>

            <button
              type="button"
              onClick={() => onNavigateTab('settings')}
              className="min-h-[36px] px-3 py-1.5 rounded-xl bg-teal-500/15 hover:bg-teal-500/25 border border-teal-500/40 text-xs font-semibold text-teal-300 flex items-center gap-1.5 whitespace-nowrap shrink-0"
              aria-label="Open all options in Settings"
            >
              <Sliders className="w-3.5 h-3.5 text-teal-400" />
              <span>Options</span>
            </button>
          </div>
        </div>

        {/* Unloaded Model Warning Banner */}
        {(!loadedModel || loadedModel.status !== 'loaded') && (
          <div className="relative z-10 px-4 py-2.5 bg-amber-950/80 border-b border-amber-700/60 flex items-center justify-between gap-3">
            <div className="text-xs text-amber-200">
              No GGUF model is currently loaded in native memory. Load an imported model before sending prompts.
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab('models')}
              className="px-3 py-1.5 rounded-lg bg-amber-400 text-slate-950 font-semibold text-xs whitespace-nowrap shrink-0"
            >
              Open Models
            </button>
          </div>
        )}

        {/* Automatic Memory Suggestions Bar (When Detected) */}
        {conversationSuggestions.length > 0 && (
          <div className="relative z-10 px-4 py-2.5 bg-teal-950/85 border-b border-teal-700/50 space-y-2">
            {conversationSuggestions.slice(0, 2).map((sug) => (
              <div
                key={sug.id}
                className="flex flex-wrap items-center justify-between gap-2 text-xs"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Sparkles className="w-4 h-4 text-teal-400 shrink-0" />
                  <span className="text-teal-100">
                    <strong>Memory Suggestion ({sug.category})</strong>
                    {sug.isSensitive ? ' [Sensitive — Confirm before saving]: ' : ': '}
                    “{sug.content}”
                  </span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => onConfirmSuggestion(sug)}
                    className="px-2.5 py-1 rounded-lg bg-teal-500 hover:bg-teal-400 text-slate-950 font-semibold text-xs whitespace-nowrap"
                  >
                    Save to Memory
                  </button>
                  <button
                    type="button"
                    onClick={() => onDismissSuggestion(sug.id)}
                    className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs whitespace-nowrap"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Scrollable Message Stream */}
        <div className="relative z-10 flex-1 overflow-y-auto px-4 py-5 space-y-5">
          <div className="max-w-3xl mx-auto space-y-5">
            {activeMessages.map((msg) => {
              const isUser = msg.role === 'user';
              const isTimingExpanded = !!expandedTimingMsgIds[msg.id];
              const isEditingThis = editingMsgId === msg.id;

              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
                >
                  {/* Sender & Timestamp Metadata (Zero-Pill Unboxed Text) */}
                  <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1.5 px-1 tabular-nums">
                    <span className="font-semibold text-slate-300">
                      {isUser ? 'You' : msg.modelName || 'Aevyron Local'}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {new Date(msg.createdAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </span>
                    {msg.timing && !msg.isStreaming && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono text-teal-300">
                          {(msg.timing.totalElapsedMs / 1000).toFixed(2)}s ({msg.timing.tokensPerSecond} tok/s)
                        </span>
                      </>
                    )}
                  </div>

                  {/* Message Bubble */}
                  <div
                    style={{ opacity: appearance.bubbleOpacity / 100 }}
                    className={`w-full ${
                      isUser ? 'max-w-xl' : 'max-w-3xl'
                    } rounded-2xl p-4 border transition-colors ${
                      isUser
                        ? 'bg-[#162235] border-teal-500/30 text-white'
                        : msg.isError
                        ? 'bg-rose-950/70 border-rose-700/60 text-rose-100'
                        : 'bg-[#111827] border-slate-800 text-slate-100'
                    }`}
                  >
                    {/* Attached Files Preview inside Bubble */}
                    {msg.attachments && msg.attachments.length > 0 && (
                      <div className="space-y-2.5 mb-3 pb-3 border-b border-slate-700/60">
                        {msg.attachments.map((att) => (
                          <div
                            key={att.id}
                            className="rounded-xl bg-slate-900/90 border border-slate-800 p-3 space-y-2"
                          >
                            <div className="flex items-center justify-between gap-2 text-xs">
                              <span className="font-semibold text-white truncate">{att.name}</span>
                              <span className="text-slate-400 font-mono tabular-nums shrink-0">
                                {(att.sizeBytes / 1024).toFixed(1)} KB · {att.category}
                              </span>
                            </div>

                            {att.previewDataUrl && (att.category === 'image' || att.category === 'camera' || att.category === 'video') && (
                              <img
                                src={att.previewDataUrl}
                                alt={`Attachment preview for ${att.name}`}
                                referrerPolicy="no-referrer"
                                className="max-h-44 rounded-lg object-contain bg-slate-950 border border-slate-800"
                              />
                            )}

                            {att.previewDataUrl && att.category === 'audio' && (
                              <audio controls src={att.previewDataUrl} className="w-full h-9" />
                            )}

                            <div
                              className={`text-xs leading-relaxed ${
                                att.compatibilityStatus === 'supported'
                                  ? 'text-teal-300'
                                  : att.compatibilityStatus === 'limited'
                                  ? 'text-amber-300'
                                  : 'text-amber-300'
                              }`}
                            >
                              {att.compatibilityNote}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Live Thinking / Prefill Indicator before first token */}
                    {!isUser && msg.isStreaming && (
                      <div className="mb-3 p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 flex items-center justify-between gap-2 text-xs font-mono tabular-nums">
                        <span className="text-teal-300 font-semibold">
                          {generationPhase === 'prefill'
                            ? 'Phase 1: Evaluating Prompt & Memory Context (Waiting for 1st token)...'
                            : 'Phase 2: Streaming Local GGUF Tokens...'}
                        </span>
                        <span className="text-slate-300">
                          {(liveElapsedMs / 1000).toFixed(2)}s elapsed
                        </span>
                      </div>
                    )}

                    {/* Message Body or Inline Editor */}
                    {isEditingThis ? (
                      <div className="space-y-2.5">
                        <textarea
                          value={editMsgContent}
                          onChange={(e) => setEditMsgContent(e.target.value)}
                          rows={3}
                          aria-label="Edit message content"
                          className="w-full p-2.5 rounded-xl bg-slate-950 border border-teal-500 text-sm text-white focus:outline-none"
                        />
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setEditingMsgId(null)}
                            className="px-3 py-1.5 rounded-lg bg-slate-800 text-xs text-slate-300"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => handleEditAndResendUserMessage(msg.id)}
                            className="px-3 py-1.5 rounded-lg bg-teal-500 text-slate-950 font-semibold text-xs"
                          >
                            Save & Resend
                          </button>
                        </div>
                      </div>
                    ) : isUser ? (
                      <div className="text-[15px] leading-relaxed whitespace-pre-wrap select-text">
                        {msg.content}
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <MarkdownRenderer content={msg.content || '...'} />

                        {/* Wikipedia Rich Media Card (Images & Playable Videos in Chat) */}
                        {msg.wikipediaCard && (
                          <div className="rounded-2xl bg-slate-950/90 border border-slate-800/90 p-3.5 space-y-3.5">
                            <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-800/80">
                              <div className="flex items-center gap-2 text-xs">
                                <Globe className="w-4 h-4 text-teal-400 shrink-0" />
                                <span className="font-semibold text-white">
                                  Wikipedia ({msg.wikipediaCard.language.toUpperCase()}) · {msg.wikipediaCard.title}
                                </span>
                                {msg.wikipediaCard.fromOfflineCache && (
                                  <span className="text-[11px] text-amber-300 font-mono">
                                    [Offline Cache]
                                  </span>
                                )}
                              </div>
                              <a
                                href={msg.wikipediaCard.articleUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs font-semibold text-teal-400 hover:text-teal-300 underline"
                              >
                                Open Wikipedia Article →
                              </a>
                            </div>

                            {/* Wikipedia Images Grid */}
                            {msg.wikipediaCard.images.length > 0 && (
                              <div className="space-y-2">
                                <div className="text-xs font-semibold text-slate-300">
                                  Wikipedia Images ({msg.wikipediaCard.images.length})
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                  {msg.wikipediaCard.images.map((img) => (
                                    <div
                                      key={img.id}
                                      className="rounded-xl overflow-hidden bg-slate-900 border border-slate-800 flex flex-col"
                                    >
                                      <a
                                        href={img.sourcePageUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="block bg-black/50"
                                      >
                                        <img
                                          src={img.thumbUrl}
                                          alt={img.title}
                                          referrerPolicy="no-referrer"
                                          loading="lazy"
                                          className="w-full h-40 object-cover hover:opacity-90 transition-opacity"
                                        />
                                      </a>
                                      <div className="p-2 text-[11px] text-slate-300 flex items-center justify-between gap-2">
                                        <span className="truncate" title={img.caption || img.title}>
                                          {img.caption || img.title}
                                        </span>
                                        <a
                                          href={img.url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-teal-400 hover:text-teal-300 font-semibold shrink-0"
                                        >
                                          HD
                                        </a>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Wikipedia / Wikimedia Commons Playable Videos */}
                            {msg.wikipediaCard.videos.length > 0 && (
                              <div className="space-y-2 pt-1">
                                <div className="text-xs font-semibold text-slate-300">
                                  Wikipedia & Wikimedia Videos ({msg.wikipediaCard.videos.length})
                                </div>
                                <div className="grid grid-cols-1 gap-3">
                                  {msg.wikipediaCard.videos.map((vid) => (
                                    <div
                                      key={vid.id}
                                      className="rounded-xl overflow-hidden bg-slate-900 border border-slate-800 p-2.5 space-y-2"
                                    >
                                      <video
                                        controls
                                        preload="metadata"
                                        poster={vid.thumbUrl}
                                        className="w-full max-h-60 rounded-lg bg-black object-contain"
                                      >
                                        <source src={vid.url} type={vid.mimeType} />
                                        Your browser does not support embedded WebM/OGV video playback.
                                      </video>
                                      <div className="flex items-center justify-between gap-2 text-xs">
                                        <span className="text-slate-200 font-medium truncate">
                                          {vid.title}
                                        </span>
                                        <a
                                          href={vid.sourcePageUrl}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-teal-400 hover:text-teal-300 font-semibold whitespace-nowrap shrink-0"
                                        >
                                          Wikimedia Source →
                                        </a>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Collapsible Thinking Time & Generation Statistics Panel */}
                    {!isUser && msg.timing && (
                      <div className="mt-3 pt-3 border-t border-slate-800/80">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedTimingMsgIds((prev) => ({
                                ...prev,
                                [msg.id]: !prev[msg.id],
                              }))
                            }
                            className="flex items-center gap-1.5 text-xs font-mono text-slate-400 hover:text-teal-300 transition-colors tabular-nums"
                            aria-expanded={isTimingExpanded}
                          >
                            <Clock className="w-3.5 h-3.5 text-teal-400" />
                            <span>
                              TTFT: {msg.timing.ttftMs} ms · Gen: {msg.timing.generationDurationMs} ms · Total:{' '}
                              {(msg.timing.totalElapsedMs / 1000).toFixed(2)}s · {msg.timing.tokenCount} tokens
                            </span>
                            {isTimingExpanded ? (
                              <ChevronUp className="w-3.5 h-3.5" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5" />
                            )}
                          </button>

                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => speakMessageAloud(msg.id, msg.content)}
                              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs transition-colors whitespace-nowrap shrink-0 ${
                                speakingMsgId === msg.id
                                  ? 'bg-teal-500/20 text-teal-300 border border-teal-500/50'
                                  : 'bg-slate-800/90 hover:bg-slate-700 text-slate-200'
                              }`}
                              aria-label="Listen to response in Bengali or English"
                            >
                              <Volume2 className="w-3.5 h-3.5 text-teal-400" />
                              <span>{speakingMsgId === msg.id ? 'Stop Audio' : 'শুনুন / Listen'}</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleCopyMessage(msg)}
                              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800/90 hover:bg-slate-700 text-xs text-slate-200 transition-colors whitespace-nowrap shrink-0"
                              aria-label="Copy assistant response"
                            >
                              {copiedMsgId === msg.id ? (
                                <>
                                  <Check className="w-3.5 h-3.5 text-teal-400" />
                                  <span className="text-teal-300">Copied</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3.5 h-3.5" />
                                  <span>Copy</span>
                                </>
                              )}
                            </button>

                            <button
                              type="button"
                              onClick={() => handleRegenerateLastResponse(msg.id)}
                              disabled={isGenerating}
                              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800/90 hover:bg-slate-700 disabled:opacity-40 text-xs text-slate-200 transition-colors whitespace-nowrap shrink-0"
                              aria-label="Regenerate response"
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                              <span>Regenerate</span>
                            </button>
                          </div>
                        </div>

                        {isTimingExpanded && (
                          <div className="mt-2.5 p-3 rounded-xl bg-slate-950/90 border border-slate-800/90 grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs font-mono tabular-nums">
                            <div>
                              <div className="text-slate-500">Wait for 1st Token (TTFT)</div>
                              <div className="text-white font-semibold mt-0.5">{msg.timing.ttftMs} ms</div>
                            </div>
                            <div>
                              <div className="text-slate-500">Token Generation Time</div>
                              <div className="text-white font-semibold mt-0.5">
                                {msg.timing.generationDurationMs} ms
                              </div>
                            </div>
                            <div>
                              <div className="text-slate-500">Total Elapsed Wall Time</div>
                              <div className="text-white font-semibold mt-0.5">
                                {msg.timing.totalElapsedMs} ms ({(msg.timing.totalElapsedMs / 1000).toFixed(2)}s)
                              </div>
                            </div>
                            <div>
                              <div className="text-slate-500">Generated Tokens</div>
                              <div className="text-teal-300 font-semibold mt-0.5">
                                {msg.timing.tokenCount} tokens
                              </div>
                            </div>
                            <div>
                              <div className="text-slate-500">Throughput Speed</div>
                              <div className="text-teal-300 font-semibold mt-0.5">
                                {msg.timing.tokensPerSecond} tokens/sec
                              </div>
                            </div>
                            <div>
                              <div className="text-slate-500">Memories Injected</div>
                              <div className="text-slate-200 font-semibold mt-0.5">
                                {msg.timing.retrievedMemoryCount} facts
                              </div>
                            </div>
                            <div className="col-span-2 sm:col-span-3 pt-1 border-t border-slate-800 text-slate-400">
                              Engine: {msg.timing.runtimeUsed}
                              {msg.timing.wasCancelled ? ' · Cancelled by user' : ''}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* User Message Edit Trigger */}
                    {isUser && !isEditingThis && (
                      <div className="mt-2 pt-2 border-t border-slate-700/40 flex justify-end">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingMsgId(msg.id);
                            setEditMsgContent(msg.content);
                          }}
                          className="flex items-center gap-1 text-xs text-slate-400 hover:text-white transition-colors"
                          aria-label="Edit and resend user message"
                        >
                          <Edit3 className="w-3 h-3" />
                          <span>Edit & Resend</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Bottom Message Composer with "+" Attachment Menu */}
        <div className="relative z-10 px-4 py-3 bg-[#0C111D]/95 backdrop-blur-md border-t border-slate-800/80">
          <div className="max-w-3xl mx-auto space-y-2.5">
            {/* Pending Attachments Strip */}
            {pendingAttachments.length > 0 && (
              <div className="flex flex-wrap gap-2 pb-1">
                {pendingAttachments.map((att) => (
                  <div
                    key={att.id}
                    className="flex items-center gap-2.5 pl-3 pr-2 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-xs"
                  >
                    <FileText className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                    <div className="min-w-0 max-w-[200px]">
                      <div className="font-medium text-white truncate">{att.name}</div>
                      <div className="text-[11px] text-slate-400 truncate">
                        {att.compatibilityStatus === 'supported'
                          ? 'Ready for local extraction'
                          : 'Honest capability warning'}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setPendingAttachments((prev) => prev.filter((item) => item.id !== att.id))
                      }
                      className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-rose-400"
                      aria-label={`Remove attachment ${att.name}`}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Bilingual + Wikipedia Quick-Start Prompt Strip */}
            {activeMessages.length <= 2 && !isGenerating && (
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                {[
                  { label: '🌐 Solar System (Wiki + Video)', prompt: 'Solar System' },
                  { label: '🌐 রবীন্দ্রনাথ ঠাকুর (উইকিপিডিয়া)', prompt: 'রবীন্দ্রনাথ ঠাকুর সম্পর্কে বলো' },
                  { label: 'বাংলায় কথা বলো', prompt: 'হ্যালো! তুমি কি বাংলায় কথা বলতে পারো?' },
                  { label: 'বাংলা কবিতা', prompt: 'বাংলায় একটি সুন্দর কবিতা লেখো' },
                ].map((chip) => (
                  <button
                    key={chip.label}
                    type="button"
                    onClick={() => setComposerText(chip.prompt)}
                    className="px-3 py-1.5 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-800 text-xs text-teal-300 font-medium whitespace-nowrap shrink-0 transition-colors"
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            )}

            <form onSubmit={handleSendMessage} className="flex items-end gap-2">
              {/* Prominent "+" Attachment Button */}
              <button
                type="button"
                onClick={() => setIsAttachmentSheetOpen(true)}
                className="min-h-[46px] min-w-[46px] rounded-2xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-teal-400 flex items-center justify-center transition-colors shrink-0"
                aria-label="Open attachment menu"
              >
                <Plus className="w-5 h-5" />
              </button>

              {/* Offline Bengali / English Voice Input Button */}
              <button
                type="button"
                onClick={handleToggleVoiceInput}
                className={`min-h-[46px] min-w-[46px] rounded-2xl border flex items-center justify-center transition-colors shrink-0 ${
                  isListeningVoice
                    ? 'bg-rose-600 border-rose-400 text-white animate-pulse'
                    : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
                }`}
                aria-label={isListeningVoice ? 'Stop voice input' : 'Speak in Bengali or English'}
                title={currentLangPref === 'bn' ? 'বাংলায় কথা বলুন (Voice Input)' : 'Voice Input (EN / বাংলা)'}
              >
                {isListeningVoice ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4 text-teal-400" />}
              </button>

              <div className="flex-1 relative">
                <label htmlFor="chat-composer-input" className="sr-only">
                  Message Aevyron
                </label>
                <textarea
                  id="chat-composer-input"
                  value={composerText}
                  onChange={(e) => setComposerText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  rows={1}
                  placeholder={
                    loadedModel
                      ? currentLangPref === 'bn'
                        ? `বাংলায় মেসেজ লিখুন (${loadedModel.modelName} অফলাইন)...`
                        : `Message ${loadedModel.modelName} offline (English / বাংলা)...`
                      : 'Load a GGUF model in Models to start...'
                  }
                  className="w-full py-3 px-4 rounded-2xl bg-slate-900 border border-slate-700/90 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-teal-500 resize-none max-h-32"
                />
              </div>

              {isGenerating ? (
                <button
                  type="button"
                  onClick={handleStopGeneration}
                  className="min-h-[46px] px-4 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                  aria-label="Stop generation"
                >
                  <Square className="w-4 h-4 fill-current" />
                  <span>Stop</span>
                </button>
              ) : (
                <button
                  id="chat-send-btn"
                  type="submit"
                  disabled={!composerText.trim() && pendingAttachments.length === 0}
                  className="min-h-[46px] px-4 rounded-2xl bg-teal-500 hover:bg-teal-400 disabled:opacity-40 text-slate-950 font-semibold text-xs flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                  aria-label="Send message"
                >
                  <Send className="w-4 h-4" />
                  <span>Send</span>
                </button>
              )}
            </form>
          </div>
        </div>
      </div>

      {/* "+" Attachment Bottom Sheet */}
      <AttachmentSheet
        isOpen={isAttachmentSheetOpen}
        onClose={() => setIsAttachmentSheetOpen(false)}
        activeModel={selectedModelForChat}
        onAddAttachments={(newAtts) =>
          setPendingAttachments((prev) => [...prev, ...newAtts])
        }
      />

      {/* Configurable System Instructions Modal */}
      {isSystemPromptModalOpen && activeConversation && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Configure system instructions"
        >
          <div className="w-full max-w-lg rounded-3xl bg-[#111827] border border-slate-800 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white">
                System Instructions ({activeConversation.title})
              </h3>
              <button
                type="button"
                onClick={() => setIsSystemPromptModalOpen(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-white"
                aria-label="Close system instructions modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Configured instructions are combined with retrieved facts from your Personal Memory Vault and formatted using the active model’s chat template (`{selectedModelForChat?.config.chatTemplate || 'chatml'}`).
            </p>
            <textarea
              value={draftSystemPrompt}
              onChange={(e) => setDraftSystemPrompt(e.target.value)}
              rows={5}
              aria-label="System instructions text"
              className="w-full p-3 rounded-2xl bg-slate-950 border border-slate-800 text-xs text-slate-100 focus:outline-none focus:border-teal-500"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsSystemPromptModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-xs font-medium text-slate-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onUpdateConversations(
                    conversations.map((c) =>
                      c.id === activeConversation.id
                        ? { ...c, systemInstructions: draftSystemPrompt.trim(), updatedAt: Date.now() }
                        : c
                    )
                  );
                  setIsSystemPromptModalOpen(false);
                }}
                className="px-4 py-2 rounded-xl bg-teal-500 text-slate-950 text-xs font-semibold"
              >
                Save System Prompt
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
