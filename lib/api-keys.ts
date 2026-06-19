import fs from 'fs';
import path from 'path';
import Groq from 'groq-sdk';
import Anthropic from '@anthropic-ai/sdk';

let cachedEnv: Record<string, string> | null = null;

function loadEnvLocal(): Record<string, string> {
  if (cachedEnv) return cachedEnv;
  const env: Record<string, string> = {};
  try {
    const envLocalPath = path.join(process.cwd(), '.env.local');
    if (fs.existsSync(envLocalPath)) {
      const content = fs.readFileSync(envLocalPath, 'utf8');
      const lines = content.split(/\r?\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const eqIdx = trimmed.indexOf('=');
          if (eqIdx !== -1) {
            const key = trimmed.slice(0, eqIdx).trim();
            let val = trimmed.slice(eqIdx + 1).trim();
            // Remove optional surrounding quotes
            if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
              val = val.slice(1, -1);
            }
            env[key] = val;
          }
        }
      }
    }
  } catch (e) {
    console.error('Error reading .env.local in api-keys helper:', e);
  }
  cachedEnv = env;
  return env;
}

export function getApiKey(keyName: string): string | undefined {
  const envLocal = loadEnvLocal();
  if (envLocal[keyName]) {
    return envLocal[keyName];
  }
  return process.env[keyName];
}

export async function callLLMUnified({
  prompt,
  jsonMode = false,
  temperature = 0,
  maxTokens = 4000
}: {
  prompt: string;
  jsonMode?: boolean;
  temperature?: number;
  maxTokens?: number;
}): Promise<string> {
  const groqKey = getApiKey('GROQ_API_KEY');
  const anthropicKey = getApiKey('ANTHROPIC_API_KEY');

  // 1. Try Groq first (unless it is known to have been restricted/rate-limited)
  if (groqKey && !groqKey.includes('your_groq_key_here')) {
    try {
      const groq = new Groq({ apiKey: groqKey });
      const completion = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature,
        max_tokens: maxTokens,
        ...(jsonMode ? { response_format: { type: 'json_object' } } : {})
      });
      const res = completion.choices[0]?.message?.content;
      if (res) return res.trim();
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.warn('Groq LLM call failed, trying fallback. Error message:', errMsg);
    }
  }

  // 2. Try Gemini Flash models as fallback (since we have a verified valid GEMINI_API_KEY in the OS environment!)
  const geminiKey = getApiKey('GEMINI_API_KEY') || process.env.GEMINI_API_KEY;
  if (geminiKey && !geminiKey.includes('your_gemini_key_here')) {
    const geminiModels = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.5-flash-lite'];
    for (const model of geminiModels) {
      try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature,
              maxOutputTokens: maxTokens,
              ...(jsonMode ? { responseMimeType: 'application/json' } : {})
            }
          })
        });
        if (res.ok) {
          const data = await res.json();
          const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (content) return content.trim();
        } else {
          console.warn(`Gemini model ${model} response error:`, res.status, await res.text());
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.warn(`Gemini model ${model} failed, trying next. Error message:`, errMsg);
      }
    }
  }

  // 3. Try Anthropic as last fallback
  if (anthropicKey && !anthropicKey.includes('your_anthropic_key_here')) {
    try {
      const anthropic = new Anthropic({ apiKey: anthropicKey });
      const message = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: maxTokens,
        temperature,
        messages: [{ role: 'user', content: prompt }]
      });
      const responseContent = message.content[0];
      if (responseContent.type === 'text') {
        return responseContent.text.trim();
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error('All LLM calls failed including Anthropic. Error:', errMsg);
    }
  }

  throw new Error('All configured LLM API calls failed or keys are missing.');
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function cleanAndParseJSON(text: string): any {
  let cleaned = text.trim();

  // 1. Strip markdown code blocks (e.g. ```json ... ```)
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```[a-zA-Z]*\n?/, '');
    cleaned = cleaned.replace(/\n?```$/, '');
    cleaned = cleaned.trim();
  }

  // 2. Find the first '{' or '[' and the last '}' or ']'
  const firstBrace = cleaned.indexOf('{');
  const firstBracket = cleaned.indexOf('[');
  let startIdx = -1;
  if (firstBrace !== -1 && firstBracket !== -1) {
    startIdx = Math.min(firstBrace, firstBracket);
  } else if (firstBrace !== -1) {
    startIdx = firstBrace;
  } else if (firstBracket !== -1) {
    startIdx = firstBracket;
  }

  const lastBrace = cleaned.lastIndexOf('}');
  const lastBracket = cleaned.lastIndexOf(']');
  let endIdx = -1;
  if (lastBrace !== -1 && lastBracket !== -1) {
    endIdx = Math.max(lastBrace, lastBracket);
  } else if (lastBrace !== -1) {
    endIdx = lastBrace;
  } else if (lastBracket !== -1) {
    endIdx = lastBracket;
  }

  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    cleaned = cleaned.slice(startIdx, endIdx + 1);
  }

  // 3. Remove trailing commas before closing braces/brackets
  cleaned = cleaned.replace(/,\s*([}\]])/g, '$1');

  // 4. Try parsing. If it fails, do simple replacements
  try {
    return JSON.parse(cleaned);
  } catch {
    // Attempt to remove JS-style comments (cautious replacement)
    // Remove single line comments
    let lines = cleaned.split('\n');
    lines = lines.map(line => {
      const commentIdx = line.indexOf('//');
      if (commentIdx !== -1) {
        const before = line.slice(0, commentIdx);
        const doubleQuotes = (before.match(/"/g) || []).length;
        const singleQuotes = (before.match(/'/g) || []).length;
        if (doubleQuotes % 2 === 0 && singleQuotes % 2 === 0) {
          return before;
        }
      }
      return line;
    });
    cleaned = lines.join('\n').trim();

    try {
      return JSON.parse(cleaned);
    } catch (innerErr) {
      throw new Error(`Failed to parse cleaned JSON. Raw error: ${innerErr instanceof Error ? innerErr.message : String(innerErr)}. Cleaned text: ${cleaned}`);
    }
  }
}
