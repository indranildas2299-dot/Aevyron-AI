import React, { useState } from 'react';
import {
  AlertTriangle,
  Brain,
  Check,
  Edit3,
  Plus,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import {
  AppearanceSettings,
  MemoryCategory,
  MemoryFact,
  MemorySuggestion,
  RegisteredModel,
} from '../types/aevyron';
import {
  buildBoundedContextPrompt,
  findDuplicateMemory,
  retrieveRelevantMemories,
} from '../utils/memoryPipeline';

interface MemoryViewProps {
  memories: MemoryFact[];
  suggestions: MemorySuggestion[];
  activeModel: RegisteredModel | null;
  appearance: AppearanceSettings;
  onUpdateMemories: (next: MemoryFact[]) => void;
  onUpdateSuggestions: (next: MemorySuggestion[]) => void;
  onUpdateAppearance: (next: AppearanceSettings) => void;
}

const CATEGORIES: MemoryCategory[] = [
  'Preference',
  'Goal',
  'Project',
  'Instruction',
  'Personal',
];

export const MemoryView: React.FC<MemoryViewProps> = ({
  memories,
  suggestions,
  activeModel,
  appearance,
  onUpdateMemories,
  onUpdateSuggestions,
  onUpdateAppearance,
}) => {
  const [newContent, setNewContent] = useState('');
  const [newCategory, setNewCategory] = useState<MemoryCategory>('Preference');
  const [newTagsInput, setNewTagsInput] = useState('');
  const [duplicateWarning, setDuplicateWarning] = useState<MemoryFact | null>(null);

  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<'All' | MemoryCategory>('All');
  const [searchQuery, setSearchQuery] = useState('');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editCategory, setEditCategory] = useState<MemoryCategory>('Personal');

  const [testRetrievalQuery, setTestRetrievalQuery] = useState(
    'What are my Realme P4 5G memory limits and offline architecture preferences?'
  );

  const handleCheckAndAddFact = (e: React.FormEvent, forceSave = false) => {
    e.preventDefault();
    const trimmed = newContent.trim();
    if (!trimmed) return;

    if (!forceSave) {
      const existingDup = findDuplicateMemory(trimmed, memories);
      if (existingDup) {
        setDuplicateWarning(existingDup);
        return;
      }
    }

    const parsedTags = newTagsInput
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);

    const newFact: MemoryFact = {
      id: `mem-${Date.now()}`,
      content: trimmed,
      category: newCategory,
      tags: parsedTags.length > 0 ? parsedTags : [newCategory.toLowerCase()],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    onUpdateMemories([newFact, ...memories]);
    setNewContent('');
    setNewTagsInput('');
    setDuplicateWarning(null);
  };

  const handleUpdateExistingFromDuplicate = () => {
    if (!duplicateWarning || !newContent.trim()) return;
    onUpdateMemories(
      memories.map((m) =>
        m.id === duplicateWarning.id
          ? {
              ...m,
              content: newContent.trim(),
              category: newCategory,
              updatedAt: Date.now(),
            }
          : m
      )
    );
    setNewContent('');
    setNewTagsInput('');
    setDuplicateWarning(null);
  };

  const handleSaveEditedFact = (factId: string) => {
    if (!editContent.trim()) return;
    onUpdateMemories(
      memories.map((m) =>
        m.id === factId
          ? {
              ...m,
              content: editContent.trim(),
              category: editCategory,
              updatedAt: Date.now(),
            }
          : m
      )
    );
    setEditingId(null);
  };

  const handleDeleteFact = (factId: string) => {
    onUpdateMemories(memories.filter((m) => m.id !== factId));
  };

  const handleConfirmSuggestion = (sug: MemorySuggestion) => {
    const newFact: MemoryFact = {
      id: `mem-${Date.now()}`,
      content: sug.content,
      category: sug.category,
      tags: [sug.category.toLowerCase(), 'auto-suggested'],
      sourceConversationId: sug.sourceConversationId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    onUpdateMemories([newFact, ...memories]);
    onUpdateSuggestions(suggestions.filter((s) => s.id !== sug.id));
  };

  const filteredMemories = memories.filter((m) => {
    if (selectedCategoryFilter !== 'All' && m.category !== selectedCategoryFilter) {
      return false;
    }
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      m.content.toLowerCase().includes(q) ||
      m.category.toLowerCase().includes(q) ||
      m.tags.some((t) => t.toLowerCase().includes(q))
    );
  });

  const liveRetrieved = retrieveRelevantMemories(testRetrievalQuery, memories, 4);
  const livePromptPreview = buildBoundedContextPrompt({
    systemInstructions:
      'You are Aevyron, a personal offline AI assistant Created by Indranil Officals.',
    memories: liveRetrieved,
    messages: [
      {
        id: 'preview-q',
        conversationId: 'preview',
        role: 'user',
        content: testRetrievalQuery,
        createdAt: Date.now(),
        attachments: [],
      },
    ],
    chatTemplate: activeModel?.config.chatTemplate || 'chatml',
    maxContextTokens: activeModel?.config.contextLength || 2048,
  });

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 pb-24 space-y-8">
      {/* Header & Memory Pipeline Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-slate-800">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            Long-Term Personal Memory Vault
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Persistent, editable local SQLite/Room facts injected into your GGUF system prompt across chats and restarts.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs">
          <label className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 cursor-pointer">
            <input
              type="checkbox"
              checked={appearance.autoMemorySuggestions}
              onChange={(e) =>
                onUpdateAppearance({
                  ...appearance,
                  autoMemorySuggestions: e.target.checked,
                })
              }
              className="rounded border-slate-700 text-teal-500 focus:ring-teal-500"
            />
            <span>Auto-Suggest Facts After Messages</span>
          </label>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column (7 cols): Add Fact, Suggestions Queue & Stored Facts List */}
        <div className="lg:col-span-7 space-y-6">
          {/* Manual Memory Creation Form */}
          <form
            onSubmit={(e) => handleCheckAndAddFact(e, false)}
            className="rounded-2xl bg-[#111827] border border-slate-800 p-5 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Brain className="w-4 h-4 text-teal-400" />
                <span>Add Personal Memory Fact</span>
              </h2>
              <span className="text-xs text-slate-400 tabular-nums">
                {memories.length} saved facts
              </span>
            </div>

            <div>
              <label htmlFor="memory-fact-input" className="block text-xs font-medium text-slate-300 mb-1.5">
                Fact, Preference, Goal, or Recurring Instruction
              </label>
              <textarea
                id="memory-fact-input"
                value={newContent}
                onChange={(e) => {
                  setNewContent(e.target.value);
                  if (duplicateWarning) setDuplicateWarning(null);
                }}
                rows={2}
                placeholder="e.g., Always format Android native code using Kotlin + CMake for arm64-v8a..."
                className="w-full p-3 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-teal-500"
              />
            </div>

            {/* Duplicate Detection Alert */}
            {duplicateWarning && (
              <div className="p-3.5 rounded-xl bg-amber-950/60 border border-amber-700/60 space-y-2.5 text-xs">
                <div className="flex items-start gap-2 text-amber-200">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-semibold">Similar Memory Already Exists</div>
                    <div className="text-amber-300/90 mt-0.5">
                      Existing ({duplicateWarning.category}): “{duplicateWarning.content}”
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleUpdateExistingFromDuplicate}
                    className="px-3 py-1.5 rounded-lg bg-amber-400 text-slate-950 font-semibold"
                  >
                    Replace Existing Fact
                  </button>
                  <button
                    type="button"
                    onClick={(e) => handleCheckAndAddFact(e as any, true)}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-200"
                  >
                    Save as Separate Fact Anyway
                  </button>
                  <button
                    type="button"
                    onClick={() => setDuplicateWarning(null)}
                    className="px-3 py-1.5 rounded-lg bg-slate-900 text-slate-400"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="memory-category-select" className="block text-xs font-medium text-slate-400 mb-1">
                  Category
                </label>
                <select
                  id="memory-category-select"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value as MemoryCategory)}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs font-medium text-slate-200 focus:outline-none focus:border-teal-500"
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="memory-tags-input" className="block text-xs font-medium text-slate-400 mb-1">
                  Keywords / Tags (comma-separated)
                </label>
                <input
                  id="memory-tags-input"
                  type="text"
                  value={newTagsInput}
                  onChange={(e) => setNewTagsInput(e.target.value)}
                  placeholder="android, realme, kotlin"
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-teal-500"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={!newContent.trim()}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-teal-500 hover:bg-teal-400 disabled:opacity-40 text-slate-950 font-semibold text-xs transition-colors min-h-[42px] whitespace-nowrap shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span>Save Fact to Memory Vault</span>
              </button>
            </div>
          </form>

          {/* Pending Automatic Memory Suggestions Queue */}
          {suggestions.length > 0 && (
            <div className="rounded-2xl bg-[#111827] border border-teal-800/50 p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-teal-400" />
                  <h3 className="text-sm font-bold text-white">
                    Automatic Memory Suggestions ({suggestions.length})
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => onUpdateSuggestions([])}
                  className="text-xs text-slate-400 hover:text-rose-400"
                >
                  Clear Suggestions
                </button>
              </div>
              <p className="text-xs text-slate-400">
                Review candidate facts extracted from your conversations before storing them permanently.
              </p>
              <div className="space-y-2.5">
                {suggestions.map((sug) => (
                  <div
                    key={sug.id}
                    className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <div className="text-xs text-slate-400">
                        {sug.category} · {sug.reason}
                        {sug.isSensitive ? ' · Sensitive Personal Detail (Requires Confirmation)' : ''}
                      </div>
                      <div className="text-sm text-white font-medium">“{sug.content}”</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleConfirmSuggestion(sug)}
                        className="px-3 py-1.5 rounded-lg bg-teal-500 hover:bg-teal-400 text-slate-950 font-semibold text-xs whitespace-nowrap"
                      >
                        Confirm & Save
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateSuggestions(suggestions.filter((s) => s.id !== sug.id))
                        }
                        className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs whitespace-nowrap"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Search & Category Filter Controls */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-2.5">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search saved personal memories..."
                  aria-label="Search saved personal memories"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#111827] border border-slate-800 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-teal-500"
                />
              </div>
            </div>

            {/* Interactive Category Filter Bar (Functional Buttons) */}
            <div className="flex items-center gap-1 p-1 bg-[#111827] rounded-xl border border-slate-800 overflow-x-auto">
              {(['All', ...CATEGORIES] as const).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategoryFilter(cat)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                    selectedCategoryFilter === cat
                      ? 'bg-teal-500 text-slate-950 font-semibold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Stored Memory Facts List */}
          <div className="space-y-3">
            {filteredMemories.length === 0 ? (
              <div className="rounded-2xl bg-[#111827] border border-slate-800 p-8 text-center text-sm text-slate-400">
                No stored personal memories match this filter.
              </div>
            ) : (
              filteredMemories.map((fact) => {
                const isEditing = editingId === fact.id;
                return (
                  <div
                    key={fact.id}
                    className="rounded-2xl bg-[#111827] border border-slate-800 p-4 space-y-2.5"
                  >
                    {isEditing ? (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <select
                            value={editCategory}
                            onChange={(e) => setEditCategory(e.target.value as MemoryCategory)}
                            aria-label="Edit memory category"
                            className="px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white"
                          >
                            {CATEGORIES.map((cat) => (
                              <option key={cat} value={cat}>
                                {cat}
                              </option>
                            ))}
                          </select>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleSaveEditedFact(fact.id)}
                              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-teal-500 text-slate-950 font-semibold text-xs"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>Save</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingId(null)}
                              className="p-1.5 rounded-lg bg-slate-800 text-slate-300"
                              aria-label="Cancel editing memory"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                        <textarea
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          rows={2}
                          aria-label="Edit memory text"
                          className="w-full p-2.5 rounded-xl bg-slate-950 border border-teal-500 text-sm text-white focus:outline-none"
                        />
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between gap-2">
                          {/* Clean Unboxed Metadata per Zero-Pill Discipline */}
                          <div className="flex items-center gap-2 text-xs text-slate-400 tabular-nums">
                            <span className="font-semibold text-teal-300">{fact.category}</span>
                            <span aria-hidden="true">·</span>
                            <span>
                              Updated {new Date(fact.updatedAt).toLocaleDateString()}
                            </span>
                            {fact.tags.length > 0 && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span>{fact.tags.join(', ')}</span>
                              </>
                            )}
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingId(fact.id);
                                setEditContent(fact.content);
                                setEditCategory(fact.category);
                              }}
                              className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
                              aria-label={`Edit memory fact: ${fact.content.slice(0, 25)}`}
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteFact(fact.id)}
                              className="p-1.5 rounded-lg hover:bg-rose-500/20 text-slate-400 hover:text-rose-400"
                              aria-label={`Delete memory fact: ${fact.content.slice(0, 25)}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        <p className="text-sm text-slate-100 leading-relaxed">{fact.content}</p>
                      </>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column (5 cols): Live Memory Retrieval & Prompt Context Inspector */}
        <div className="lg:col-span-5 rounded-2xl bg-[#111827] border border-slate-800 p-5 space-y-4 sticky top-20">
          <div>
            <h2 className="text-base font-bold text-white">
              Live Memory Retrieval & Context Prompt Inspector
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Inspect how Aevyron retrieves relevant facts for a question and formats the bounded GGUF context prompt.
            </p>
          </div>

          <div>
            <label htmlFor="test-retrieval-input" className="block text-xs font-medium text-slate-300 mb-1">
              Test Question for Local Retrieval
            </label>
            <input
              id="test-retrieval-input"
              type="text"
              value={testRetrievalQuery}
              onChange={(e) => setTestRetrievalQuery(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-teal-500"
            />
          </div>

          <div className="space-y-1.5">
            <div className="text-xs font-semibold text-slate-300">
              Top Retrieved Memories ({liveRetrieved.length})
            </div>
            {liveRetrieved.map((m, i) => (
              <div
                key={m.id}
                className="text-xs text-slate-300 p-2.5 rounded-xl bg-slate-900/90 border border-slate-800/80"
              >
                <span className="font-mono text-teal-400 mr-1.5">#{i + 1}</span>
                <span className="font-semibold text-white">[{m.category}]</span> {m.content}
              </div>
            ))}
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-slate-400 font-mono tabular-nums">
              <span>Template: {activeModel?.config.chatTemplate || 'chatml'}</span>
              <span>
                Est. Tokens: {livePromptPreview.estimatedPromptTokens} /{' '}
                {activeModel?.config.contextLength || 2048}
              </span>
            </div>
            <pre className="p-3 rounded-xl bg-[#070A12] border border-slate-800 text-[11px] font-mono text-slate-300 overflow-x-auto max-h-64 whitespace-pre-wrap">
              {livePromptPreview.formattedPrompt}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
};
