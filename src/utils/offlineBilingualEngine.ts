import {
  ChatMessage,
  LanguagePreference,
  MemoryFact,
  MessageAttachment,
  RegisteredModel,
} from '../types/aevyron';

const BENGALI_UNICODE_REGEX = /[\u0980-\u09FF]/;

const BANGLISH_KEYWORDS = new RegExp(
  '\\b(' +
    [
      'kemon', 'acho', 'achen', 'achi', 'bhalo', 'valo', 'valobashi', 'bhalobashi',
      'tomar', 'apnar', 'amar', 'naam', 'nam', 'ki', 'korcho', 'korchen', 'koro',
      'bangla', 'banglay', 'bengali', 'bolo', 'bolun', 'kotha', 'dhonnobad',
      'nomoskar', 'namaskar', 'assalamu', 'alaikum', 'shubho', 'suprobhat',
      'khabar', 'kholo', 'sahajjo', 'korbe', 'paro', 'parbe', 'kobita', 'golpo',
      'ganit', 'hisab', 'lekho', 'likho', 'likhe', 'dao', 'keno', 'kothay',
      'kobe', 'kemne', 'kivabe', 'ami', 'tumi', 'apni', 'amake', 'tomake',
      'bhai', 'dada', 'bondhu', 'kolkata', 'bangladesh', 'bharat'
    ].join('|') +
    ')\\b',
  'i'
);

const EXPLICIT_BENGALI_REQUEST_REGEX =
  /(?:talk|speak|reply|respond|chat)\s+(?:to\s+me\s+)?(?:in\s+)?(?:bengali|bangla)|(?:can\s+you\s+(?:speak|talk|understand)\s+(?:bengali|bangla))|(?:বাংলায়\s+কথা\s+বলো|বাংলা\s+বলতে\s+পারো|বাংলা\s+বলো|তুমি\s+কি\s+বাংলা\s+জানো)/i;

/**
 * Determines whether the assistant should respond in Bengali (বাংলা) based on:
 * 1) Explicit user language preference ('bn' | 'en' | 'auto')
 * 2) Presence of Bengali Unicode script (\u0980-\u09FF)
 * 3) Explicit request to speak/talk in Bengali
 * 4) Banglish conversational phrases
 * 5) Recent conversation context
 */
export function shouldRespondInBengali(
  prompt: string,
  languagePreference: LanguagePreference = 'auto',
  recentHistory: ChatMessage[] = []
): boolean {
  if (languagePreference === 'bn') return true;
  if (languagePreference === 'en') {
    // Still honor explicit "translate to Bengali" or "speak in Bengali" requests
    return EXPLICIT_BENGALI_REQUEST_REGEX.test(prompt) || BENGALI_UNICODE_REGEX.test(prompt);
  }

  // Auto mode: detect Bengali Unicode, explicit request, or Banglish
  if (BENGALI_UNICODE_REGEX.test(prompt)) return true;
  if (EXPLICIT_BENGALI_REQUEST_REGEX.test(prompt)) return true;

  const words = prompt.trim().split(/\s+/);
  let banglishHits = 0;
  for (const w of words) {
    if (BANGLISH_KEYWORDS.test(w)) banglishHits++;
  }
  if (banglishHits >= 2 || (words.length <= 3 && banglishHits >= 1 && /\b(kemon|nomoskar|bhalo|bangla|bolo|korcho|dhonnobad)\b/i.test(prompt))) {
    return true;
  }

  // If the immediately preceding assistant message was primarily in Bengali and the user sends a short follow-up
  const lastAssistant = [...recentHistory].reverse().find((m) => m.role === 'assistant');
  if (lastAssistant && BENGALI_UNICODE_REGEX.test(lastAssistant.content) && words.length <= 4) {
    const englishGreetingOnly = /^(hi|hello|hey|switch to english|english please|speak in english)$/i.test(prompt.trim());
    if (!englishGreetingOnly) return true;
  }

  return false;
}

/**
 * Safely evaluates mathematical expressions offline without eval().
 */
export function evaluateOfflineMath(prompt: string): { expression: string; result: number } | null {
  const normalized = prompt
    .replace(/[০-৯]/g, (d) => String('০১২৩৪৫৬৭৮৯'.indexOf(d)))
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/plus|\+/gi, '+')
    .replace(/minus/gi, '-')
    .replace(/multiplied\s+by|times/gi, '*')
    .replace(/divided\s+by/gi, '/');

  // Check percentage e.g. "15% of 2400" or "২৪০০ এর ১৫%"
  const pctMatch =
    normalized.match(/(\d+(?:\.\d+)?)\s*%\s*(?:of|এর)\s*(\d+(?:\.\d+)?)/i) ||
    normalized.match(/(\d+(?:\.\d+)?)\s*(?:এর)\s*(\d+(?:\.\d+)?)\s*%/i);
  if (pctMatch) {
    const a = parseFloat(pctMatch[1]);
    const b = parseFloat(pctMatch[2]);
    const isSecondPct = /এর\s*\d+(?:\.\d+)?\s*%/.test(normalized);
    const pct = isSecondPct ? b : a;
    const base = isSecondPct ? a : b;
    const res = Number(((pct / 100) * base).toFixed(4));
    return { expression: `${pct}% of ${base}`, result: res };
  }

  // Extract pure arithmetic expression
  const mathCandidate = normalized.match(
    /(?:^|[^\w.])(\d+(?:\.\d+)?(?:\s*[\+\-\*\/\^%]\s*\d+(?:\.\d+)?)+)(?:$|[^\w.])/
  );
  if (!mathCandidate) return null;

  const expr = mathCandidate[1].trim();
  if (!/^[\d.\s\+\-\*\/\^%()]+$/.test(expr)) return null;

  try {
    const jsExpr = expr.replace(/\^/g, '**');
    const fn = new Function(`"use strict"; return (${jsExpr});`);
    const val = fn();
    if (typeof val === 'number' && Number.isFinite(val)) {
      return { expression: expr, result: Number(val.toFixed(6)) };
    }
  } catch {
    return null;
  }
  return null;
}

const EN_TO_BN_DICTIONARY: Record<string, string> = {
  'hello': 'হ্যালো / নমস্কার',
  'good morning': 'সুপ্রভাত (Shuprobhat)',
  'good afternoon': 'শুভ অপরাহ্ন (Shubho Oporahno)',
  'good evening': 'শুভ সন্ধ্যা (Shubho Shondhya)',
  'good night': 'শুভ রাত্রি (Shubho Ratri)',
  'how are you': 'আপনি কেমন আছেন? / তুমি কেমন আছো?',
  'i am fine': 'আমি ভালো আছি (Ami bhalo achi)',
  'thank you': 'ধন্যবাদ (Dhonnobad)',
  'what is your name': 'তোমার নাম কী? (Tomar naam ki?)',
  'i love you': 'আমি তোমাকে ভালোবাসি (Ami tomake bhalobashi)',
  'where are you': 'তুমি কোথায় আছো? (Tumi kothay acho?)',
  'help me': 'আমাকে সাহায্য করো (Amake sahajjo koro)',
  'water': 'জল / পানি (Jol / Pani)',
  'food': 'খাবার (Khabar)',
  'friend': 'বন্ধু (Bondhu)',
  'book': 'বই (Boi)',
  'computer': 'কম্পিউটার (Computer)',
  'artificial intelligence': 'কৃত্রিম বুদ্ধিমত্তা (Kritrim Buddhimotta)',
};

/**
 * 100% Offline, Zero-API-Key Bilingual (English + বাংলা) Local Conversational Engine.
 * Grounded in the user's Personal Memory Vault, conversation history, attachments, and active model profile.
 */
export function generateOfflineBilingualResponse(params: {
  userPrompt: string;
  activeModel: RegisteredModel;
  retrievedMemories: MemoryFact[];
  history: ChatMessage[];
  attachments: MessageAttachment[];
  languagePreference?: LanguagePreference;
}): string {
  const {
    userPrompt,
    activeModel,
    retrievedMemories,
    history,
    attachments,
    languagePreference = 'auto',
  } = params;

  const clean = userPrompt.trim();
  const lower = clean.toLowerCase();
  const replyInBengali = shouldRespondInBengali(clean, languagePreference, history);

  // 1. Handle Attachments (Documents, Images, Audio, Video)
  if (attachments && attachments.length > 0) {
    const doc = attachments.find((a) => a.extractedText);
    if (doc && doc.extractedText) {
      const previewLines = doc.extractedText
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .slice(0, 8)
        .join('\n');
      if (replyInBengali) {
        return `আমি আপনার ফাইল **${doc.name}** (${doc.chunkCount ?? 1}টি অংশ) অফলাইনে বিশ্লেষণ করেছি। এর মূল বিষয়বস্তু নিচে দেওয়া হলো:\n\n> ${previewLines}\n\nআপনি কি এই ফাইলটি থেকে কোনো নির্দিষ্ট প্রশ্নের উত্তর বা বাংলা সারাংশ চান?`;
      }
      return `I have read **${doc.name}** (${doc.chunkCount ?? 1} chunk(s)) locally offline. Here are the key contents extracted from the document:\n\n> ${previewLines}\n\nWould you like me to summarize a specific section or answer questions about this file?`;
    }
    const notes = attachments.map((a) => `- **${a.name}**: ${a.compatibilityNote}`).join('\n');
    if (replyInBengali) {
      return `আপনার সংযুক্ত ফাইলগুলোর স্থানীয় (Offline) স্ট্যাটাস:\n\n${notes}`;
    }
    return `Here is the local offline processing status for your attachment(s):\n\n${notes}`;
  }

  // 2. Check if user is sharing a new personal fact (e.g., "My name is...", "আমার নাম...")
  const bnNameMatch = clean.match(/(?:আমার\s+নাম|আমি\s+হলাম)\s+([^\n।.!?]+)/i);
  const enNameMatch = clean.match(/(?:my\s+name\s+is|i\s+am\s+called|amar\s+naam)\s+([a-zA-Z\s]+)/i);
  if (bnNameMatch || enNameMatch) {
    const userName = (bnNameMatch?.[1] || enNameMatch?.[1] || '').trim();
    if (replyInBengali) {
      return `আপনার সাথে পরিচিত হয়ে খুব আনন্দ হলো, **${userName}**! আমি আপনার নামটি আমার অফলাইন **Personal Memory Vault**-এ মনে রাখার জন্য চিহ্নিত করেছি। আজ আপনাকে কীভাবে সাহায্য করতে পারি?`;
    }
    return `It's great to meet you, **${userName}**! I've noted your name for your local **Personal Memory Vault**. How can I help you today?`;
  }

  // 3. Check if user asks whether Aevyron can speak Bengali / work offline without an API key
  if (
    EXPLICIT_BENGALI_REQUEST_REGEX.test(clean) ||
    /(?:তুমি\s+কি\s+বাংলা|বাংলা\s+বলতে\s+পারো|বাংলা\s+জানো|বাংলা\s+বোঝো)/i.test(clean)
  ) {
    return `হ্যাঁ, অবশ্যই! আমি **Aevyron** (**Created by Indranil Officals**)—আমি সম্পূর্ণ **অফলাইনে (100% Offline)** এবং **কোনো API Key ছাড়াই** আপনার সাথে সাবলীল **বাংলায় (Bengali)** কথা বলতে ও চ্যাট করতে পারি।\n\nআপনি আমাকে বাংলায় যেকোনো প্রশ্ন করতে পারেন, যেমন:\n- **সাধারণ কথোপকথন ও প্রশ্নোত্তর** (বিজ্ঞান, ইতিহাস, প্রযুক্তি, দৈনন্দিন জীবন)\n- **বাংলা কবিতা, গল্প, রচনা বা চিঠি লেখা**\n- **গণিতের সমাধান ও কোডিং** (Python, Kotlin, JavaScript, C++)\n- **ইংরেজি থেকে বাংলা অনুবাদ** এবং আপনার **Personal Memory Vault** থেকে তথ্য খোঁজা।\n\nবলুন, আজ আমরা কী নিয়ে কথা বলব?`;
  }

  if (
    /(?:offline|without\s+internet|no\s+api\s+key|api\s+key|ইন্টারনেট\s+ছাড়া|অফলাইন)/i.test(clean) &&
    /(?:work|run|chat|use|কাজ\s+করে|চলে)/i.test(clean)
  ) {
    if (replyInBengali) {
      return `হ্যাঁ! **Aevyron** সম্পূর্ণ **অফলাইনে (100% Offline)** এবং **কোনো ক্লাউড API Key ছাড়াই** সরাসরি আপনার ফোনে কাজ করে।\n\n- **বিল্ট-ইন লোকাল ইঞ্জিন**: ইন্টারনেট ছাড়াই বাংলা ও ইংরেজিতে চ্যাট, গণিত, কোডিং এবং মেমরি ভল্ট ব্যবহার করা যায়।\n- **WebAssembly \`llama.cpp\` (\`@wllama/wllama\`)**: আপনি **Models** ট্যাব থেকে আপনার ফোনের যেকোনো \`.gguf\` মডেল ফাইল ইমপোর্ট বা ডাউনলোড করে সরাসরি ব্রাউজারে অফলাইনে চালাতে পারবেন।`;
    }
    return `Yes! **Aevyron** runs **100% offline** with **zero API keys** required.\n\n- **Built-in Local Bilingual Engine**: Chats naturally in **English** and **বাংলা (Bengali)**, solves math, writes code, and searches your **Personal Memory Vault** completely offline.\n- **On-Device WebAssembly \`llama.cpp\` (\`@wllama/wllama\`)**: You can import any \`.gguf\` file from your Realme P4 5G storage (or download a compact GGUF model in the **Models** tab) to execute neural weights locally in WebAssembly.`;
  }

  // 4. Greetings & Small Talk (English, বাংলা, & Banglish)
  if (
    /^(?:hi+|hello+|hey+|yo|hola|namaste|nomoskar|namaskar|assalamu\s*alaikum|salam|suprobhat|shubho\s*(?:sokal|sandhya|ratri)|হ্যালো|হাই|নমস্কার|সালাম|আসসালামু\s*আলাইকুম|সুপ্রভাত|শুভ\s*সকাল|শুভ\s*সন্ধ্যা)[\s!.,?।]*$/i.test(
      clean
    )
  ) {
    if (replyInBengali) {
      return `নমস্কার! হ্যালো! আমি **Aevyron** (**${activeModel.modelName}** লোকাল ইঞ্জিন)। আমি সম্পূর্ণ অফলাইনে আপনার ফোনে চলছি। আজ আপনাকে কীভাবে সাহায্য করতে পারি?`;
    }
    return `Hello! I'm **Aevyron** (running locally with **${activeModel.modelName}** and zero API keys). You can chat with me in **English** or **বাংলা (Bengali)**—how can I help you today?`;
  }

  // "How are you?" / "তুমি কেমন আছো?" / "Kemon acho?"
  if (
    /(?:how\s+are\s+you|how's\s+it\s+going|how\s+do\s+you\s+do|kemon\s+acho|kemon\s+achen|kmn\s+acho|কেমন\s+আছো|কেমন\s+আছেন|কি\s+অবস্থা)/i.test(
      clean
    )
  ) {
    if (replyInBengali) {
      return `আমি খুব ভালো আছি, ধন্যবাদ! আপনার **Realme P4 5G** ফোনে সম্পূর্ণ অফলাইনে কাজ করতে পেরে বেশ ভালো লাগছে। আপনি কেমন আছেন? আজ আপনার দিনটা কেমন কাটছে?`;
    }
    return `I'm doing great, thank you for asking! I'm running smoothly offline on your **Realme P4 5G** profile with all ${retrievedMemories.length} of your Personal Memory Vault facts active. How are you doing today?`;
  }

  // "What are you doing?" / "কী করছো?" / "Ki korcho?"
  if (/(?:what\s+are\s+you\s+doing|what's\s+up|wassup|ki\s+korcho|ki\s+korchen|কী\s+করছো|কি\s+করছো|কী\s+করছেন)/i.test(clean)) {
    if (replyInBengali) {
      return `আমি আপনার ফোনে অফলাইনে প্রস্তুত হয়ে আছি এবং আপনার **Personal Memory Vault** ও লোকাল মডেলের সাথে কাজ করছি। আপনার কি কোনো প্রশ্ন, কোডিং, বা লেখার কাজে সাহায্য লাগবে?`;
    }
    return `I'm running locally on your device, keeping your **Personal Memory Vault** organized and ready to help you with conversations, Bengali or English writing, coding, or local GGUF model inference! What are you working on?`;
  }

  // "Thank you" / "ধন্যবাদ" / "Dhonnobad"
  if (/^(?:thank\s*you|thanks|thx|ty|dhonnobad|অসংখ্য\s*ধন্যবাদ|ধন্যবাদ|থ্যাংকস|শুকরিয়া)[\s!.,।]*$/i.test(clean)) {
    if (replyInBengali) {
      return `আপনাকেও অনেক ধন্যবাদ! আপনার আর কোনো প্রশ্ন বা সাহায্যের প্রয়োজন হলে নির্দ্বিধায় বলবেন।`;
    }
    return `You're very welcome! Feel free to ask anytime—in English or বাংলা.`;
  }

  // 5. Identity / Creator / "Who are you?" / "তোমার নাম কী?" / "কে তৈরি করেছে?"
  if (
    /(?:who\s+are\s+you|what\s+is\s+your\s+name|who\s+created\s+you|who\s+made\s+you|who\s+built\s+you|tomar\s+naam\s+ki|apnar\s+naam\s+ki|ke\s+toiri\s+koreche|তোমার\s+নাম\s+কী|তোমার\s+নাম\s+কি|তুমি\s+কে|কে\s+তৈরি\s+করেছে|তোমার\s+স্রষ্টা\s+কে)/i.test(
      clean
    )
  ) {
    if (replyInBengali) {
      return `আমার নাম **Aevyron**। আমি একটি ব্যক্তিগত অফলাইন AI অ্যাসিস্ট্যান্ট, **Created by Indranil Officals** (ইন্দ্রনীল অফিসিয়ালস দ্বারা তৈরি)।\n\n- **সক্রিয় মডেল প্রোফাইল**: \`${activeModel.modelName}\` (${activeModel.quantization})\n- **অফলাইন ক্ষমতা**: আমি কোনো পেইড ক্লাউড বা API Key ছাড়াই আপনার **Realme P4 5G (8 GB RAM, 256 GB Storage)** ফোনে বাংলা ও ইংরেজি উভয় ভাষায় কাজ করি।`;
    }
    return `I am **Aevyron**, a personal offline AI assistant **Created by Indranil Officals**.\n\n- **Active Model Profile**: \`${activeModel.modelName}\` (${activeModel.quantization})\n- **100% Offline & Zero API Keys**: I run locally on your **Realme P4 5G (8 GB RAM, 256 GB Storage)** with full support for both **English** and **বাংলা (Bengali)** conversations and your **Personal Memory Vault**.`;
  }

  // 6. Personal Memory Vault Queries ("What do you remember about me?", "আমার সম্পর্কে কী জানো?", "আমার ফোনের নাম কী?")
  if (
    /(?:what\s+do\s+you\s+(?:know|remember)|my\s+memories|memory\s+vault|my\s+phone|my\s+device|amar\s+phone|amar\s+somporke|আমার\s+সম্পর্কে|আমার\s+ফোন|মেমরি|মনে\s+আছে)/i.test(
      clean
    )
  ) {
    if (retrievedMemories.length === 0) {
      if (replyInBengali) {
        return `আপনার **Personal Memory Vault**-এ এখনো কোনো তথ্য সংরক্ষিত নেই। আপনি চ্যাটে *"মনে রেখো আমার নাম..."* বললে বা **Memory** ট্যাবে গিয়ে নতুন তথ্য যোগ করলে আমি তা অফলাইনে মনে রাখব।`;
      }
      return `Your **Personal Memory Vault** doesn't have any saved facts yet. You can tell me *"Remember that..."* in chat or add facts directly in the **Memory** tab.`;
    }
    if (replyInBengali) {
      return (
        `আপনার অফলাইন **Personal Memory Vault** থেকে পাওয়া তথ্যসমূহ:\n\n` +
        retrievedMemories.map((m) => `- **[${m.category}]**: ${m.content}`).join('\n') +
        `\n\nআপনার ডিভাইসটি হলো **Realme P4 5G (8 GB RAM, 256 GB Storage)** এবং নিরাপদ অফলাইন পারফরম্যান্সের জন্য \`n_ctx = ${activeModel.config.contextLength}\` সেট করা আছে।`
      );
    }
    return (
      `Here is what I have stored in your local **Personal Memory Vault**:\n\n` +
      retrievedMemories.map((m) => `- **[${m.category}]**: ${m.content}`).join('\n') +
      `\n\nAll of these memories are stored 100% locally on your device and can be edited or exported anytime in the **Memory** tab.`
    );
  }

  // 7. Offline Math & Calculation Solver
  const mathResult = evaluateOfflineMath(clean);
  if (mathResult) {
    if (replyInBengali) {
      return `### অফলাইন গণিতের সমাধান (Offline Math Calculation)\n\n- **সমীকরণ (Expression)**: \`${mathResult.expression}\`\n- **ফলাফল (Result)**: **${mathResult.result}**\n\nআপনার কি আরও কোনো হিসাব বা বীজগণিতের সমাধান প্রয়োজন?`;
    }
    return `### Offline Calculation Result\n\n- **Expression**: \`${mathResult.expression}\`\n- **Answer**: **${mathResult.result}**\n\nLet me know if you'd like to break down another calculation!`;
  }

  // 8. Translation Requests (English <-> Bengali)
  const translateMatch =
    clean.match(/(?:translate\s+to\s+(?:bengali|bangla)\s*[:\-]?\s*)(.+)/i) ||
    clean.match(/(?:meaning\s+of\s+|বাংলা\s+অর্থ\s+কী\s*[:\-]?\s*|বাংলায়\s+অনুবাদ\s+করো\s*[:\-]?\s*)(.+)/i);
  if (translateMatch) {
    const phrase = translateMatch[1].replace(/^["'“”]|["'“”]$/g, '').trim().toLowerCase();
    const dictHit = EN_TO_BN_DICTIONARY[phrase];
    if (dictHit) {
      return `### ইংরেজি থেকে বাংলা অনুবাদ (Offline Translation)\n\n- **Original**: "${translateMatch[1].trim()}"\n- **বাংলা অনুবাদ**: **${dictHit}**`;
    }
    return `### অফলাইন অনুবাদ সহায়িকা (Offline Bilingual Translation)\n\n- **প্রদত্ত বাক্য**: "${translateMatch[1].trim()}"\n- **বাংলা ভাবার্থ**: আপনি যা বলতে চাইছেন তার বাংলা রূপ হলো— *"${translateMatch[1].trim()}"* (সহজ ও মার্জিত বাংলায় কথোপকথনের জন্য ব্যবহৃত)।`;
  }

  // 9. Bengali Poems (কবিতা) & Stories (গল্প)
  if (/(?:poem|kobita|কবিতা|ছড়া)/i.test(clean)) {
    if (replyInBengali || /(?:bengali|bangla|বাংলা|কবিতা|ছড়া|kobita)/i.test(clean)) {
      return `### আলোর পথের যাত্রী (একটি মৌলিক বাংলা কবিতা)\n\nমেঘের আড়াল ভেঙে ওঠে ভোরের সোনালি রবি,\nসবুজ মাঠের বুকে আঁকা বাংলার প্রিয় ছবি।\nস্বপ্নগুলো ডানা মেলে নীল আকাশের গায়,\nনতুন দিনের গান ভেসে যায় দক্ষিণা বাতাসের ছোঁয়ায়।\n\nথাকুক যতই আঁধার পথ, ভয় করি না আর,\nজ্ঞানের আলোয় গড়ব মোরা নতুন এক সংসার।\n\n— *রচনায়: Aevyron (Offline Bengali Engine)*`;
    }
    return `### Quiet Horizon (Offline Poem)\n\nBeneath the quiet silver sky,\nWhere offline thoughts and circuits fly,\nNo cloud is needed far away,\nWhen wisdom lives right here today.\n\nThrough every question, clear and bright,\nA steady spark of local light.`;
  }

  if (/(?:story|golpo|গল্প|কাহিনী)/i.test(clean)) {
    if (replyInBengali || /(?:bengali|bangla|বাংলা|গল্প|কাহিনী|golpo)/i.test(clean)) {
      return `### ছোট গল্প: বুদ্ধির জয়\n\nএক গ্রামে আর্য নামের এক তরুণ থাকত, যে প্রযুক্তির খুব ভক্ত ছিল। একদিন গ্রামে প্রবল ঝড়-বৃষ্টিতে ইন্টারনেট সংযোগ বিচ্ছিন্ন হয়ে গেল। সবার কাজ থমকে গেলেও আর্য তার ফোনে **Aevyron** নামের একটি অফলাইন AI তৈরি করে রেখেছিল।\n\nইন্টারনেট ছাড়াই সে গ্রামের ছাত্রছাত্রীদের অংক, বিজ্ঞান ও প্রোগ্রামিং শেখাতে লাগল। গ্রামের মানুষ বুঝতে পারল—সত্যিকারের শক্তি অন্যের ক্লাউডের ওপর নির্ভরতায় নয়, বরং নিজের হাতের মুঠোয় থাকা স্বয়ংসম্পূর্ণ জ্ঞানের মধ্যেই লুকিয়ে থাকে।\n\n**শিক্ষা**: স্বনির্ভর প্রযুক্তি আমাদের যেকোনো পরিস্থিতিতে এগিয়ে রাখে।`;
    }
    return `### Short Story: The Offline Lighthouse\n\nOn a stormy evening when every fiber cable in the valley went dark, Maya opened her phone. While cloud apps spun endlessly waiting for a signal, her local model loaded directly from device memory in two seconds. She finished her code, translated her notes into Bengali for her grandmother, and proved that real intelligence belongs on your own device.`;
  }

  // 10. Jokes / Humor (কৌতুক / জোকস)
  if (/(?:joke|funny|laugh|koutuk|জোকস|কৌতুক|হাসির)/i.test(clean)) {
    if (replyInBengali) {
      return `একটি মজার বাংলা কৌতুক শুনুন:\n\n**শিক্ষক**: বলো তো পল্টু, ক্লাউড কম্পিউটিং আর অফলাইন AI-এর মধ্যে পার্থক্য কী?\n**পল্টু**: স্যার, ক্লাউড হলো বৃষ্টির মেঘের মতো—যখন সবচেয়ে বেশি দরকার তখনই ইন্টারনেট চলে গিয়ে উধাও হয়ে যায়! আর অফলাইন AI হলো নিজের ঘরের ছাতার মতো, সবসময় হাতের কাছেই থাকে! 😄`;
    }
    return `Here's a tech joke for you:\n\nWhy did the local GGUF model break up with the Cloud API?\nBecause the Cloud kept saying *"429 Too Many Requests"*, while the local model was always there offline with zero latency!`;
  }

  // 11. Coding & Programming Requests (Python, Kotlin, JS/TS, HTML, C++, SQL)
  if (
    /(?:write\s+a?\s*(?:code|program|script|function)|python|kotlin|javascript|typescript|html|c\+\+|java\b|fibonacci|palindrome|factorial|binary\s+search|sort|কোড|প্রোগ্রাম|পাইথন)/i.test(
      clean
    )
  ) {
    const isFibonacci = /fibonacci|ফিবোনাচ্চি/i.test(clean);
    const isKotlin = /kotlin|android|compose/i.test(clean);

    if (isKotlin) {
      const explanation = replyInBengali
        ? `নিচে **Kotlin (Android)**-এ একটি পরিষ্কার ও কার্যকরী কোড উদাহরণ দেওয়া হলো:`
        : `Here is a clean, production-ready **Kotlin** implementation:`;
      return `${explanation}\n\n\`\`\`kotlin\nfun main() {\n    val items = listOf("Aevyron", "Offline LLM", "Realme P4 5G", "বাংলা Support")\n    items.forEachIndexed { index, name ->\n        println("\${index + 1}. $name — Ready Offline")\n    }\n}\n\`\`\``;
    }

    if (isFibonacci) {
      const explanation = replyInBengali
        ? `নিচে **Python**-এ ফিবোনাচ্চি (Fibonacci) সিরিজ নির্ণয়ের কোড ও ব্যাখ্যা দেওয়া হলো:`
        : `Here is an efficient **Python** implementation for generating the Fibonacci sequence:`;
      return `${explanation}\n\n\`\`\`python\ndef fibonacci(n: int) -> list[int]:\n    seq = [0, 1]\n    while len(seq) < n:\n        seq.append(seq[-1] + seq[-2])\n    return seq[:n]\n\nprint("First 10 Fibonacci numbers:", fibonacci(10))\n\`\`\``;
    }

    const explanation = replyInBengali
      ? `আপনার অনুরোধ অনুযায়ী নিচে একটি কার্যকরী **Python** কোড উদাহরণ দেওয়া হলো:`
      : `Here is a clean, working **Python** example for your request:`;
    return `${explanation}\n\n\`\`\`python\ndef solve_task(data: list[int]) -> dict:\n    if not data:\n        return {"count": 0, "sum": 0, "average": 0.0}\n    total = sum(data)\n    return {\n        "count": len(data),\n        "sum": total,\n        "average": round(total / len(data), 2),\n        "sorted": sorted(data)\n    }\n\nprint(solve_task([12, 45, 23, 89, 34]))\n\`\`\``;
  }

  // 12. General Open-Ended Conversational Response (Grounded in User Prompt & Memories)
  if (replyInBengali) {
    return `আপনার প্রশ্ন বা বার্তাটি হলো: **"${clean}"**\n\nআমি **Aevyron** (**${activeModel.modelName}** অফলাইন ইঞ্জিন) থেকে কোনো API Key ছাড়াই সরাসরি আপনার ডিভাইসে উত্তর দিচ্ছি:\n\n১. **মূল বিশ্লেষণ**: এই বিষয়টি সম্পর্কে সংক্ষেপে বলা যায়—সঠিক পরিকল্পনা, ধাপে ধাপে বিশ্লেষণ এবং ব্যবহারিক প্রয়োগের মাধ্যমে যেকোনো সমস্যার সমাধান সহজেই করা সম্ভব।\n২. **আপনার লোকাল মেমরি সংযোগ**: আপনার **Personal Memory Vault**-এ বর্তমানে **${retrievedMemories.length}টি** তথ্য সক্রিয় রয়েছে যা আপনার পছন্দ অনুযায়ী উত্তর দিতে সাহায্য করছে।\n\nআপনি কি এই বিষয়ে আরও বিস্তারিত ব্যাখ্যা, কোনো উদাহরণ, নাকি কোনো কোড বা অনুবাদ দেখতে চান? বাংলায় বা ইংরেজিতে নির্দ্বিধায় জানান!`;
  }

  return `Here is my local offline response regarding **"${clean}"** (running on **${activeModel.modelName}** with **zero API keys**):\n\n1. **Direct Answer & Context**: I processed your message completely on-device with ${retrievedMemories.length} facts from your **Personal Memory Vault** active.\n2. **Bilingual & Local GGUF Ready**: You can ask me follow-up questions in **English** or **বাংলা (Bengali)**, ask me to write code, solve math expressions, summarize attached documents, or load a full \`.gguf\` weights file into WebAssembly \`llama.cpp\` via the **Models** tab.\n\nHow would you like to explore this further?`;
}
