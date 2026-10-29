/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import {
  Brain,
  Cpu,
  MessageSquare,
  Settings as SettingsIcon,
  WifiOff,
} from 'lucide-react';
import {
  AppearanceSettings,
  ChatMessage,
  Conversation,
  MemoryFact,
  MemorySuggestion,
  NavigationTab,
  RegisteredModel,
} from './types/aevyron';
import {
  DEFAULT_APPEARANCE,
  INITIAL_CONVERSATIONS,
  INITIAL_MEMORIES,
  INITIAL_MESSAGES,
  INITIAL_MODELS,
  INITIAL_SUGGESTIONS,
  StorageVault,
} from './utils/storageVault';
import { useOnlineStatus, usePWAInstall } from './utils/usePWAInstall';
import { ChatView } from './components/ChatView';
import { Marquee } from './components/Marquee';
import { MemoryView } from './components/MemoryView';
import { ModelsView } from './components/ModelsView';
import { SettingsView } from './components/SettingsView';

export default function App() {
  const [activeTab, setActiveTab] = useState<NavigationTab>('chat');

  const [models, setModels] = useState<RegisteredModel[]>(() => StorageVault.loadModels());
  const [conversations, setConversations] = useState<Conversation[]>(() =>
    StorageVault.loadConversations()
  );
  const [messages, setMessages] = useState<ChatMessage[]>(() => StorageVault.loadMessages());
  const [memories, setMemories] = useState<MemoryFact[]>(() => StorageVault.loadMemories());
  const [suggestions, setSuggestions] = useState<MemorySuggestion[]>(() =>
    StorageVault.loadSuggestions()
  );
  const [appearance, setAppearance] = useState<AppearanceSettings>(() =>
    StorageVault.loadAppearance()
  );

  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const isOnline = useOnlineStatus();

  useEffect(() => {
    StorageVault.saveModels(models);
  }, [models]);

  useEffect(() => {
    StorageVault.saveConversations(conversations);
  }, [conversations]);

  useEffect(() => {
    StorageVault.saveMessages(messages);
  }, [messages]);

  useEffect(() => {
    StorageVault.saveMemories(memories);
  }, [memories]);

  useEffect(() => {
    StorageVault.saveSuggestions(suggestions);
  }, [suggestions]);

  useEffect(() => {
    StorageVault.saveAppearance(appearance);
  }, [appearance]);

  const activeLoadedModel = models.find((m) => m.status === 'loaded') || null;

  const handleSelectAndLoadModel = (modelId: string) => {
    const target = models.find((m) => m.id === modelId);
    if (!target) return;
    if (target.status === 'loaded') return;
    if (target.ramSafety.status === 'critical') {
      setActiveTab('models');
      return;
    }
    setModels((prev) =>
      prev.map((m) =>
        m.id === modelId
          ? { ...m, status: 'loaded', loadProgress: 100, lastLoadedAt: Date.now() }
          : m.status === 'loaded'
          ? { ...m, status: 'unloaded', loadProgress: 0 }
          : m
      )
    );
  };

  const handleConfirmSuggestion = (sug: MemorySuggestion) => {
    const newFact: MemoryFact = {
      id: `mem-${Date.now()}`,
      content: sug.content,
      category: sug.category,
      tags: [sug.category.toLowerCase(), 'confirmed'],
      sourceConversationId: sug.sourceConversationId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setMemories((prev) => [newFact, ...prev]);
    setSuggestions((prev) => prev.filter((s) => s.id !== sug.id));
  };

  const handleDismissSuggestion = (sugId: string) => {
    setSuggestions((prev) => prev.filter((s) => s.id !== sugId));
  };

  const handleAddSuggestions = (newSugs: MemorySuggestion[]) => {
    setSuggestions((prev) => {
      const existingContents = new Set(prev.map((p) => p.content.toLowerCase()));
      const uniqueNew = newSugs.filter((n) => !existingContents.has(n.content.toLowerCase()));
      return [...uniqueNew, ...prev];
    });
  };

  const handleResetAllData = () => {
    StorageVault.clearAllPersonalData();
    setModels(INITIAL_MODELS);
    setConversations(INITIAL_CONVERSATIONS);
    setMessages(INITIAL_MESSAGES);
    setMemories(INITIAL_MEMORIES);
    setSuggestions(INITIAL_SUGGESTIONS);
    setAppearance(DEFAULT_APPEARANCE);
  };

  return (
    <div
      className={`min-h-screen flex flex-col ${
        appearance.themeMode === 'light'
          ? 'bg-slate-50 text-slate-900'
          : 'bg-[#090D16] text-slate-100'
      }`}
    >
      {/* Top Bar: "Aevyron AI" + Creator <Marquee/> + Desktop Navigation */}
      <header className="sticky top-0 z-30 bg-[#090D16]/95 backdrop-blur-md border-b border-slate-800/90">
        <div className="flex items-center justify-between gap-4 px-4 sm:px-6 h-12 sm:h-14">
          {/* Brand Title: "Aevyron AI" */}
          <a
            href="#chat"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('chat');
            }}
            className="text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0"
          >
            Aevyron AI
          </a>

          {/* Scrolling <Marquee/> Banner showing "Created by Indranil Officals" */}
          <div className="flex-1 min-w-0 max-w-xl mx-2 py-1 px-2 rounded-lg bg-slate-900/80 border border-slate-800/80 overflow-hidden">
            <Marquee text="Created by Indranil Officals · Aevyron AI · Offline Local LLM & Wikipedia Media · English & বাংলা (Bengali)" />
          </div>

          {/* Desktop Navigation Links */}
          <nav
            className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-400 shrink-0"
            aria-label="Primary navigation"
          >
            {(
              [
                { id: 'chat', label: 'Chat' },
                { id: 'memory', label: 'Memory' },
                { id: 'models', label: 'Models' },
                { id: 'settings', label: 'Settings' },
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
                  activeTab === item.id
                    ? 'text-white border-teal-400 font-semibold'
                    : 'border-transparent hover:text-white'
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {/* Non-intrusive Offline Connectivity Indicator */}
      {!isOnline && (
        <div className="px-4 py-1.5 bg-amber-500/90 text-slate-950 text-xs font-semibold flex items-center justify-center gap-2">
          <WifiOff className="w-3.5 h-3.5" />
          <span>Offline Mode Active — Local GGUF Runtime & Memory Vault Operating Without Internet</span>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 min-w-0">
        {activeTab === 'chat' && (
          <ChatView
            conversations={conversations}
            messages={messages}
            models={models}
            memories={memories}
            suggestions={suggestions}
            appearance={appearance}
            onUpdateAppearance={setAppearance}
            onUpdateConversations={setConversations}
            onUpdateMessages={setMessages}
            onAddSuggestion={handleAddSuggestions}
            onConfirmSuggestion={handleConfirmSuggestion}
            onDismissSuggestion={handleDismissSuggestion}
            onNavigateTab={setActiveTab}
            onSelectAndLoadModel={handleSelectAndLoadModel}
          />
        )}

        {activeTab === 'memory' && (
          <MemoryView
            memories={memories}
            suggestions={suggestions}
            activeModel={activeLoadedModel}
            appearance={appearance}
            onUpdateMemories={setMemories}
            onUpdateSuggestions={setSuggestions}
            onUpdateAppearance={setAppearance}
          />
        )}

        {activeTab === 'models' && (
          <ModelsView
            models={models}
            appearance={appearance}
            onUpdateModels={setModels}
            onUpdateAppearance={setAppearance}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsView
            appearance={appearance}
            memories={memories}
            suggestions={suggestions}
            conversations={conversations}
            messages={messages}
            models={models}
            isInstallable={isInstallable}
            isInstalled={isInstalled}
            isIOS={isIOS}
            onInstallPwa={install}
            onUpdateAppearance={setAppearance}
            onUpdateConversations={setConversations}
            onSelectAndLoadModel={handleSelectAndLoadModel}
            onRestoreData={({ memories: nextM, conversations: nextC, messages: nextMsg }) => {
              setMemories(nextM);
              setConversations(nextC);
              setMessages(nextMsg);
            }}
            onResetAllData={handleResetAllData}
          />
        )}
      </main>

      {/* Mobile Fixed Bottom Tab Bar (Thumb-Zone Ergonomics) */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-[#0C111D]/95 backdrop-blur-md border-t border-slate-800 grid grid-cols-4 items-center h-16"
        aria-label="Mobile navigation"
      >
        {(
          [
            { id: 'chat', label: 'Chat', icon: MessageSquare },
            { id: 'memory', label: 'Memory', icon: Brain },
            { id: 'models', label: 'Models', icon: Cpu },
            { id: 'settings', label: 'Settings', icon: SettingsIcon },
          ] as const
        ).map((tab) => {
          const IconComponent = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`min-h-[48px] flex flex-col items-center justify-center transition-colors ${
                isActive ? 'text-teal-400 font-semibold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <IconComponent className="w-5 h-5" />
              <span className="text-[11px] tracking-tight mt-1">{tab.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
