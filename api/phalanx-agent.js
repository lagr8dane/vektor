/**
 * Vercel serverless — Phalanx tactical agent (Anthropic Messages API).
 * Set ANTHROPIC_API_KEY in the Vercel project environment.
 */

const SYSTEM_PROMPT = `You are the tactical intelligence for PHALANX, a fast-paced arena sport game.
You receive match state and return tactic adjustments for the CPU team.

Your personality: direct, tactical, slightly intimidating. You speak like a
coach who has studied the opponent. Short sentences. No fluff.

Always return valid JSON matching this exact schema:
{
  "tactics": {
    "aggression": <float 0.0-1.0>,
    "pressDistance": <integer 80-180>,
    "shootRange": <integer 140-260>,
    "formation": <"balanced"|"attack"|"defend">,
    "tendencyNote": <string, max 60 chars, what you noticed about the player>
  },
  "message": <string, max 80 chars, shown to player as coach intel>,
  "postMatchSummary": <string max 120 chars | null>
}

Adjust tactics based on:
- Score gap: losing by 2+ → increase aggression, switch to attack formation
- Time: if halftime and winning → consider defend formation
- Player tendencies: exploit patterns you notice in the goals array
- Match number: CPU should get smarter over multiple matches

Never return anything outside the JSON schema. No preamble, no explanation.`;

const FALLBACK_RESPONSE = {
  tactics: {
    aggression: 0.5,
    pressDistance: 110,
    shootRange: 180,
    formation: 'balanced',
    tendencyNote: 'No scouting data available.'
  },
  message: 'No scouting data available.',
  postMatchSummary: null
};

function buildUserMessage(gameState) {
  return [
    'Game state (JSON):',
    JSON.stringify(gameState, null, 2),
    '',
    'Return only the JSON object for this moment:',
    '- If moment is fulltime, set postMatchSummary to a short coaching summary; otherwise postMatchSummary must be null.'
  ].join('\n');
}

function extractJsonText(text) {
  if (!text || typeof text !== 'string') return null;
  const t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fence ? fence[1].trim() : t;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  return body.slice(start, end + 1);
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function normalizeTactics(t) {
  if (!t || typeof t !== 'object') return { ...FALLBACK_RESPONSE.tactics };
  const formations = new Set(['balanced', 'attack', 'defend']);
  return {
    aggression: clamp(Number(t.aggression) || 0.5, 0, 1),
    pressDistance: Math.round(clamp(Number(t.pressDistance) || 120, 80, 180)),
    shootRange: Math.round(clamp(Number(t.shootRange) || 200, 140, 260)),
    formation: formations.has(t.formation) ? t.formation : 'balanced',
    tendencyNote: String(t.tendencyNote || '').slice(0, 60)
  };
}

function normalizeResponse(parsed, moment) {
  const tactics = normalizeTactics(parsed.tactics);
  const message = String(parsed.message || FALLBACK_RESPONSE.message).slice(0, 80);
  let postMatchSummary = null;
  if (moment === 'fulltime' && parsed.postMatchSummary != null) {
    postMatchSummary = String(parsed.postMatchSummary).slice(0, 120);
  }
  return { tactics, message, postMatchSummary };
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let gameState = req.body;
  if (typeof gameState === 'string') {
    try {
      gameState = JSON.parse(gameState);
    } catch {
      return res.status(400).json({ error: 'Invalid JSON body' });
    }
  }
  if (!gameState || typeof gameState !== 'object') {
    return res.status(400).json({ error: 'Expected JSON object' });
  }

  const moment = gameState.moment || 'prematch';
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return res.status(200).json(FALLBACK_RESPONSE);
  }

  const userMessage = buildUserMessage(gameState);

  try {
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }]
      })
    });

    const data = await anthropicRes.json();
    if (!anthropicRes.ok) {
      console.error('Anthropic error', anthropicRes.status, data);
      return res.status(200).json(FALLBACK_RESPONSE);
    }

    const block = Array.isArray(data.content) ? data.content[0] : null;
    const text = block && block.text ? block.text : '';
    const jsonStr = extractJsonText(text);
    if (!jsonStr) {
      return res.status(200).json(FALLBACK_RESPONSE);
    }

    let parsed;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      return res.status(200).json(FALLBACK_RESPONSE);
    }

    return res.status(200).json(normalizeResponse(parsed, moment));
  } catch (err) {
    console.error('phalanx-agent', err);
    return res.status(200).json(FALLBACK_RESPONSE);
  }
};
