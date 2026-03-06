import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);

// ─── Config ───────────────────────────────────────────────────────────────────
const OLLAMA_BASE  = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL    || 'llama3.1:latest';
const LLM_TIMEOUT  = 30_000; // ms — local models can be slow

// ─── LLM urgency analyser (Ollama) ────────────────────────────────────────────
// Sends all descriptions in one batched prompt, returns id→{score,reason} map.
// Gracefully returns {} if Ollama is unavailable or times out.
async function analyseWithLLM(items) {
  const toAnalyse = items.filter(i => (i.description || '').trim().length > 10);
  if (toAnalyse.length === 0) return {};

  const payload = toAnalyse.map(i => ({
    id:          i.id,
    title:       i.title,
    description: (i.description || '').slice(0, 600),
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

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LLM_TIMEOUT);

  try {
    const res = await fetch(`${OLLAMA_BASE}/api/chat`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      signal:  controller.signal,
      body: JSON.stringify({
        model:    OLLAMA_MODEL,
        stream:   false,
        format:   'json',
        options:  { temperature: 0.1, num_predict: 1024 },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: userPrompt   },
        ],
      }),
    });

    if (!res.ok) return {};

    const data = await res.json();
    const text = (data.message?.content || data.response || '').trim();

    let parsed;
    try {
      const clean = text.replace(/^```(?:json)?|```$/gm, '').trim();
      parsed = JSON.parse(clean);
    } catch {
      return {};
    }

    // Ollama JSON mode always returns an object — extract the array from "results"
    // Also handle edge case where it returns a single item object directly
    let arr;
    if (Array.isArray(parsed)) {
      arr = parsed;
    } else if (Array.isArray(parsed.results)) {
      arr = parsed.results;
    } else if (Array.isArray(parsed.items)) {
      arr = parsed.items;
    } else if (parsed.id && typeof parsed.urgency === 'number') {
      arr = [parsed]; // single object fallback
    } else {
      // Try to collect any object values that look like results
      arr = Object.values(parsed).filter(v => v && typeof v === 'object' && v.id && typeof v.urgency === 'number');
    }
    const map = {};
    for (const entry of arr) {
      if (!entry.id || typeof entry.urgency !== 'number') continue;
      const urgency = Math.max(0, Math.min(100, Math.round(entry.urgency)));
      if (urgency < 10) continue; // ignore near-zero scores
      map[entry.id] = {
        // Scale 0-100 → 0-55 points so LLM is meaningful but doesn't eclipse hard facts
        score:  Math.round(urgency * 0.55),
        reason: (entry.reason || 'Urgency detected in description').slice(0, 80),
      };
    }
    return map;
  } catch {
    return {}; // graceful fallback — structural scoring still works
  } finally {
    clearTimeout(timer);
  }
}

// ─────────────────────────────────────────────
// Scoring constants
// ─────────────────────────────────────────────
const PRIORITY_SCORE = { CRITICAL: 40, HIGH: 28, MEDIUM: 14, LOW: 5 };
const STATUS_SCORE   = { BLOCKED: 38, IN_PROGRESS: 18, ON_HOLD: 12, OPEN: 6, COMPLETED: -999, CANCELLED: -999 };

function daysAgo(date)   { return Math.floor((Date.now() - new Date(date).getTime()) / 86_400_000); }
function daysUntil(date) { return Math.ceil((new Date(date).getTime()  - Date.now())  / 86_400_000); }

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
  else if (item.priority === 'HIGH')     reasons.push({ label: 'High priority',     weight: pScore, icon: '🟠' });

  // 2. Status
  score += base;
  if (item.status === 'BLOCKED')     reasons.push({ label: 'Currently blocked',   weight: base, icon: '🚫' });
  else if (item.status === 'ON_HOLD') reasons.push({ label: 'Sitting on hold',    weight: base, icon: '⏸️' });

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

    // Build children map + run LLM analysis in parallel
    const childrenMap = {};
    for (const item of initiatives) childrenMap[item.id] = item.children || [];

    const llmMap  = await analyseWithLLM(initiatives);
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
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
