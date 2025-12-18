const OpenAI = require('openai');

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const MODEL = process.env.OPENAI_MODEL || 'gpt-4.1-mini';

async function runNailAssistantLLM({ prompt }) {
  if (!process.env.OPENAI_API_KEY) {
    return { ok: false, reason: 'OPENAI_API_KEY missing' };
  }

  // Keep it simple tonight: return structured intent signals
  const system = `
You are Nailzotica AI Nail Assistant.
Return JSON only. No markdown. No extra keys.

Schema:
{
  "themeKeywords": string[],
  "colorHints": string[],
  "motifs": string[],
  "finishes": string[],
  "vibe": string
}
`.trim();

  const resp = await client.chat.completions.create({
    model: MODEL,
    temperature: 0.7,
    response_format: { type: "json_object" },
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: prompt },
    ],
  });

  const text = resp.choices?.[0]?.message?.content || '{}';
  let json;
  try { json = JSON.parse(text); } catch { json = {}; }

  return { ok: true, model: MODEL, json };
}

module.exports = { runNailAssistantLLM };
