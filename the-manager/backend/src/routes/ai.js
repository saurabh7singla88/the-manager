import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import logger from '../lib/logger.js';

const router = Router();
router.use(authenticate);

const LLM_TIMEOUT = 30_000; // ms

// ─── Default fallback settings (env vars still honoured if no DB entry exists)
const DEFAULTS = {
  ai_provider: process.env.AI_PROVIDER || 'ollama',
  ai_ollama_base_url: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
  ai_ollama_model: process.env.OLLAMA_MODEL || 'llama3.1:latest',
  ai_openai_base_url: 'https://api.openai.com',
  ai_openai_model: 'gpt-4o-mini',
  ai_openai_api_key: '',
  ai_gemini_model: 'gemini-1.5-flash',
  ai_gemini_api_key: '',
};

// ─── Load AI settings from DB (falls back to env/defaults for missing keys) ───
async function loadAISettings() {
  const rows = await prisma.appSetting.findMany({ where: { key: { startsWith: 'ai_' } } });
  const map = { ...DEFAULTS };
  for (const row of rows) map[row.key] = row.value;
  return map;
}

// ─── Provider: Ollama ─────────────────────────────────────────────────────────
async function callOllama(settings, systemPrompt, userPrompt) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LLM_TIMEOUT);
  try {
    const res = await fetch(`${settings.ai_ollama_base_url}/api/chat`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
      body: JSON.stringify({
        model: settings.ai_ollama_model, stream: false, format: 'json',
        options: { temperature: 0.1, num_predict: 1024 },
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
      }),
    });
    if (!res.ok) {
      logger.error(`Ollama non-OK response`, { status: res.status, model: settings.ai_ollama_model });
      return null;
    }
    const data = await res.json();
    return (data.message?.content || data.response || '').trim();
  } catch (e) {
    logger.error('Ollama call failed', e);
    return null;
  } finally { clearTimeout(timer); }
}

// ─── Provider: OpenAI / OpenAI-compatible (LM Studio, Together AI, etc.) ──────
async function callOpenAI(settings, systemPrompt, userPrompt) {
  if (!settings.ai_openai_api_key) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LLM_TIMEOUT);
  try {
    const base = (settings.ai_openai_base_url || 'https://api.openai.com').replace(/\/$/, '');
    const res = await fetch(`${base}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${settings.ai_openai_api_key}` },
      signal: controller.signal,
      body: JSON.stringify({
        model: settings.ai_openai_model, temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
      }),
    });
    if (!res.ok) {
      logger.error('OpenAI non-OK response', { status: res.status, model: settings.ai_openai_model, base: settings.ai_openai_base_url });
      return null;
    }
    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || null;
  } catch (e) {
    logger.error('OpenAI call failed', e);
    return null;
  } finally { clearTimeout(timer); }
}

// ─── Provider: Google Gemini ──────────────────────────────────────────────────
async function callGemini(settings, systemPrompt, userPrompt, schemaOverride = null) {
  if (!settings.ai_gemini_api_key) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LLM_TIMEOUT);
  const defaultSchema = {
    type: 'object',
    properties: {
      results: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            urgency: { type: 'number' },
            reason: { type: 'string' },
          },
          required: ['id', 'urgency', 'reason'],
        },
      },
    },
    required: ['results'],
  };
  try {
    const model = settings.ai_gemini_model || 'gemini-1.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${settings.ai_gemini_api_key}`;
    const res = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: schemaOverride || defaultSchema,
          temperature: 0.1,
          maxOutputTokens: 4096,
        },
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      logger.error('Gemini API error', { status: res.status, model: settings.ai_gemini_model, error: data?.error });
      return null;
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!text) {
      logger.warn('Gemini returned no text', { finishReason: data.candidates?.[0]?.finishReason });
      return null;
    }
    return text;
  } catch (e) {
    logger.error('Gemini call failed', e);
    return null;
  } finally { clearTimeout(timer); }
}

// ─── LLM urgency analyser (provider-agnostic) ─────────────────────────────────
async function analyseWithLLM(items, settings) {
  const provider = settings.ai_provider || 'ollama';
  if (provider === 'disabled') return { map: {}, provider: 'disabled' };

  const toAnalyse = items.filter(i => (i.description || '').trim().length > 10);
  if (toAnalyse.length === 0) return { map: {}, provider };

  const payload = toAnalyse.map(i => ({
    id: i.id, title: i.title, description: (i.description || '').slice(0, 600),
  }));

  const systemPrompt = `You are an expert product manager assistant that evaluates work item urgency.
Your job is to read the title and description of each initiative and judge how urgent it sounds
based purely on the LANGUAGE and INTENT expressed in the text.

Look for signals like: urgency/must-do language, blocking/critical language, business risk,
customer impact, scaling/performance concerns, executive visibility, imminent deadlines mentioned
in the text, words or phrases like "must", "critical", "ASAP", "scaling", "at risk", "urgent",
"must do", "important", "cannot wait", "needs attention" etc.

Return ONLY a valid JSON object with a "results" key containing an array. Format:
{
  "results": [
    { "id": "<the item id>", "urgency": <0-100>, "reason": "<6-word reason>" }
  ]
}

Be generous: if ANY urgency is implied or suggested, score it above 30.`;

  const userPrompt = `Rate the urgency expressed in these initiative descriptions:\n${JSON.stringify(payload, null, 2)}`;

  let rawText = null;
  if (provider === 'ollama') rawText = await callOllama(settings, systemPrompt, userPrompt);
  else if (provider === 'openai') rawText = await callOpenAI(settings, systemPrompt, userPrompt);
  else if (provider === 'openai_compatible') rawText = await callOpenAI(settings, systemPrompt, userPrompt);
  else if (provider === 'gemini') rawText = await callGemini(settings, systemPrompt, userPrompt, null);

  if (!rawText) {
    logger.warn(`LLM urgency analysis returned no response`, { provider });
    return { map: {}, provider };
  }

  try {
    const clean = rawText.replace(/^```(?:json)?|```$/gm, '').trim();
    const parsed = JSON.parse(clean);
    let arr;
    if (Array.isArray(parsed)) arr = parsed;
    else if (Array.isArray(parsed.results)) arr = parsed.results;
    else if (Array.isArray(parsed.items)) arr = parsed.items;
    else if (parsed.id && typeof parsed.urgency === 'number') arr = [parsed];
    else arr = Object.values(parsed).filter(v => v && typeof v === 'object' && v.id && typeof v.urgency === 'number');

    const map = {};
    for (const entry of arr) {
      if (!entry.id || typeof entry.urgency !== 'number') continue;
      const urgency = Math.max(0, Math.min(100, Math.round(entry.urgency)));
      if (urgency < 10) continue;
      map[entry.id] = {
        score: Math.round(urgency * 0.55),
        reason: (entry.reason || 'Urgency detected in description').slice(0, 80),
      };
    }
    return { map, provider };
  } catch (e) {
    logger.warn('Failed to parse LLM urgency response', { provider, error: e.message });
    return { map: {}, provider };
  }
}

// ─────────────────────────────────────────────
// Scoring constants
// ─────────────────────────────────────────────
const PRIORITY_SCORE = { CRITICAL: 40, HIGH: 28, MEDIUM: 14, LOW: 5 };
const STATUS_SCORE = { BLOCKED: 38, IN_PROGRESS: 18, ON_HOLD: 12, OPEN: 6, COMPLETED: -999, CANCELLED: -999 };

function daysAgo(date) { return Math.floor((Date.now() - new Date(date).getTime()) / 86_400_000); }
function daysUntil(date) { return Math.ceil((new Date(date).getTime() - Date.now()) / 86_400_000); }

// ─────────────────────────────────────────────
// Score a single initiative
// llmMap: id → { score, reason } from Ollama
// Returns { score, reasons[] }
// ─────────────────────────────────────────────
function scoreItem(item, childrenMap, llmMap) {
  const reasons = [];
  let score = 0;

  // Skip completed / cancelled entirely
  const base = STATUS_SCORE[item.status] ?? 0;
  if (base === -999) return null;

  // 1. Priority
  const pScore = PRIORITY_SCORE[item.priority] ?? 0;
  score += pScore;
  if (item.priority === 'CRITICAL') reasons.push({ label: 'Critical priority', weight: pScore, icon: '🔴' });
  else if (item.priority === 'HIGH') reasons.push({ label: 'High priority', weight: pScore, icon: '🟠' });

  // 2. Status
  score += base;
  if (item.status === 'BLOCKED') reasons.push({ label: 'Currently blocked', weight: base, icon: '🚫' });
  else if (item.status === 'ON_HOLD') reasons.push({ label: 'Sitting on hold', weight: base, icon: '⏸️' });

  // 3. Due date
  if (item.dueDate) {
    const days = daysUntil(item.dueDate);
    let dueDateScore = 0;
    let dueLabel = '';
    if (days < 0) {
      dueDateScore = 50;
      dueLabel = `Overdue by ${Math.abs(days)} day${Math.abs(days) !== 1 ? 's' : ''}`;
    } else if (days === 0) {
      dueDateScore = 42;
      dueLabel = 'Due today';
    } else if (days === 1) {
      dueDateScore = 35;
      dueLabel = 'Due tomorrow';
    } else if (days <= 3) {
      dueDateScore = 28;
      dueLabel = `Due in ${days} days`;
    } else if (days <= 7) {
      dueDateScore = 18;
      dueLabel = `Due in ${days} days`;
    } else if (days <= 14) {
      dueDateScore = 8;
      dueLabel = `Due in ${days} days`;
    }
    if (dueDateScore > 0) {
      score += dueDateScore;
      reasons.push({ label: dueLabel, weight: dueDateScore, icon: days < 0 ? '🔥' : '📅' });
    }
  }

  // 4. Stale score (no updates for a long time)
  const stalenessDays = daysAgo(item.updatedAt || item.createdAt);
  if (stalenessDays >= 7 && item.status !== 'ON_HOLD') {
    const staleScore = Math.min(Math.floor(stalenessDays * 0.6), 22);
    score += staleScore;
    reasons.push({
      label: `No updates for ${stalenessDays} day${stalenessDays !== 1 ? 's' : ''}`,
      weight: staleScore,
      icon: '💤',
    });
  }

  // 5. Blocked children
  const children = childrenMap[item.id] || [];
  const blockedChildren = children.filter(c => c.status === 'BLOCKED').length;
  if (blockedChildren > 0) {
    const blockedScore = Math.min(blockedChildren * 10, 30);
    score += blockedScore;
    reasons.push({
      label: `${blockedChildren} blocked sub-item${blockedChildren !== 1 ? 's' : ''}`,
      weight: blockedScore,
      icon: '⛔',
    });
  }

  // 6. High depth of open/unstarted children (initiative sprawl)
  const openChildren = children.filter(c => c.status === 'OPEN').length;
  if (openChildren >= 3 && item.status === 'IN_PROGRESS') {
    const sprawlScore = Math.min(openChildren * 3, 15);
    score += sprawlScore;
    reasons.push({
      label: `${openChildren} sub-items still open`,
      weight: sprawlScore,
      icon: '📋',
    });
  }

  // 7. LLM description analysis
  const llm = llmMap?.[item.id];
  if (llm) {
    score += llm.score;
    reasons.push({ label: llm.reason, weight: llm.score, icon: '🧠' });
  }

  reasons.sort((a, b) => b.weight - a.weight);
  return { score, reasons };
}

// ─────────────────────────────────────────────
// GET /api/ai/settings
// ─────────────────────────────────────────────
router.get('/settings', async (req, res, next) => {
  try {
    const s = await loadAISettings();
    const mask = (k) => k ? `${'•'.repeat(Math.max(0, k.length - 4))}${k.slice(-4)}` : '';
    res.json({
      provider: s.ai_provider,
      ollamaBaseUrl: s.ai_ollama_base_url,
      ollamaModel: s.ai_ollama_model,
      openaiBaseUrl: s.ai_openai_base_url,
      openaiModel: s.ai_openai_model,
      openaiApiKey: mask(s.ai_openai_api_key),
      openaiApiKeySet: !!s.ai_openai_api_key,
      geminiModel: s.ai_gemini_model,
      geminiApiKey: mask(s.ai_gemini_api_key),
      geminiApiKeySet: !!s.ai_gemini_api_key,
    });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────
// PUT /api/ai/settings
// ─────────────────────────────────────────────
router.put('/settings', async (req, res, next) => {
  try {
    const { provider, ollamaBaseUrl, ollamaModel, openaiBaseUrl, openaiModel, openaiApiKey, geminiModel, geminiApiKey } = req.body;
    const updates = {};
    if (provider != null) updates.ai_provider = provider;
    if (ollamaBaseUrl != null) updates.ai_ollama_base_url = ollamaBaseUrl;
    if (ollamaModel != null) updates.ai_ollama_model = ollamaModel;
    if (openaiBaseUrl != null) updates.ai_openai_base_url = openaiBaseUrl;
    if (openaiModel != null) updates.ai_openai_model = openaiModel;
    if (openaiApiKey != null && openaiApiKey !== '' && !openaiApiKey.startsWith('•'))
      updates.ai_openai_api_key = openaiApiKey;
    if (geminiModel != null) updates.ai_gemini_model = geminiModel;
    if (geminiApiKey != null && geminiApiKey !== '' && !geminiApiKey.startsWith('•'))
      updates.ai_gemini_api_key = geminiApiKey;

    await Promise.all(
      Object.entries(updates).map(([key, value]) =>
        prisma.appSetting.upsert({ where: { key }, update: { value }, create: { key, value } })
      )
    );
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────
// GET /api/ai/suggestions
// ─────────────────────────────────────────────
router.get('/suggestions', async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 8;
    const canvasId = req.query.canvasId; // optional canvas filter
    const mode = req.query.mode || 'initiatives'; // 'initiatives' | 'tasks'

    // Fetch all non-completed initiatives for the user's data (created by or assigned to)
    const where = {
      status: { notIn: ['COMPLETED', 'CANCELLED'] },
    };
    if (canvasId && canvasId !== 'all') where.canvasId = canvasId;

    // Mode filter
    if (mode === 'tasks') {
      where.isStandaloneTask = true;
    } else {
      // Include all initiatives and sub-initiatives, but exclude standalone tasks
      where.isStandaloneTask = false;
    }

    const initiatives = await prisma.initiative.findMany({
      where,
      include: {
        children: {
          select: { id: true, status: true, title: true },
        },
      },
      orderBy: { updatedAt: 'asc' },
    });

    if (initiatives.length === 0) {
      return res.json({ suggestions: [], analysedCount: 0 });
    }

    const childrenMap = {};
    for (const item of initiatives) childrenMap[item.id] = item.children || [];

    const settings = await loadAISettings();
    const { map: llmMap, provider: llmProvider } = await analyseWithLLM(initiatives, settings);
    const llmUsed = Object.keys(llmMap).length > 0;

    // Score every initiative
    const scored = [];
    for (const item of initiatives) {
      const result = scoreItem(item, childrenMap, llmMap);
      if (result && result.score > 0 && result.reasons.length > 0) {
        scored.push({
          id: item.id,
          title: item.title,
          description: item.description || null,
          status: item.status,
          priority: item.priority,
          dueDate: item.dueDate,
          parentId: item.parentId,
          score: result.score,
          reasons: result.reasons.slice(0, 3), // top 3 reasons
        });
      }
    }

    // Sort by score descending, take top N
    scored.sort((a, b) => b.score - a.score);
    const suggestions = scored.slice(0, limit);

    return res.json({
      suggestions,
      analysedCount: initiatives.length,
      llmUsed,
      llmProvider: llmUsed ? llmProvider : null,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

// ─── Action items extractor ──────────────────────────────────────────────────
const ACTION_ITEMS_GEMINI_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          text:     { type: 'string' },
          assignee: { type: 'string' },
          isForMe:  { type: 'boolean' },
        },
        required: ['text', 'isForMe'],
      },
    },
  },
  required: ['items'],
};

async function extractActionItems(emailText, subject, userName, settings) {
  const provider = settings.ai_provider || 'ollama';
  if (provider === 'disabled') return { items: [], provider: 'disabled' };

  const body = (emailText || '').slice(0, 6000);
  const systemPrompt = `You are a meeting notes assistant. Extract all action items from the email below.
For each action item:
- Write the task clearly and concisely
- Set "assignee" to the person's name if mentioned, or "" if unclear
- Set "isForMe" to true if the item is assigned to or most likely the responsibility of "${userName}", otherwise false

Return ONLY a valid JSON object with key "items" containing an array.
Format: { "items": [ { "text": "...", "assignee": "...", "isForMe": true/false } ] }`;

  const userPrompt = `Subject: ${subject || '(no subject)'}

${body}`;

  let rawText = null;
  if (provider === 'ollama')            rawText = await callOllama(settings, systemPrompt, userPrompt);
  else if (provider === 'openai')       rawText = await callOpenAI(settings, systemPrompt, userPrompt);
  else if (provider === 'openai_compatible') rawText = await callOpenAI(settings, systemPrompt, userPrompt);
  else if (provider === 'gemini')       rawText = await callGemini(settings, systemPrompt, userPrompt, ACTION_ITEMS_GEMINI_SCHEMA);

  if (!rawText) {
    logger.warn('LLM action-items extraction returned no response', { provider });
    return { items: [], provider };
  }

  try {
    const clean = rawText.replace(/^```(?:json)?|```$/gm, '').trim();
    const parsed = JSON.parse(clean);
    const arr = Array.isArray(parsed) ? parsed
      : Array.isArray(parsed.items) ? parsed.items
      : Array.isArray(parsed.results) ? parsed.results
      : [];
    return {
      items: arr.map(a => ({
        text:     (a.text || a.action || a.task || '').trim(),
        assignee: (a.assignee || a.owner || '').trim(),
        isForMe:  Boolean(a.isForMe ?? a.is_for_me ?? false),
      })).filter(a => a.text.length > 0),
      provider,
    };
  } catch (e) {
    logger.warn('Failed to parse LLM action-items response', { provider, error: e.message });
    return { items: [], provider };
  }
}

// POST /api/ai/action-items
router.post('/action-items', async (req, res, next) => {
  try {
    const { subject, text, userName } = req.body;
    if (!text && !subject) return res.status(400).json({ error: 'text or subject required' });

    const settings = await loadAISettings();
    const { items, provider } = await extractActionItems(
      text, subject, userName || req.user?.name || 'me', settings,
    );

    return res.json({ items, provider });
  } catch (err) {
    next(err);
  }
});

export default router;
