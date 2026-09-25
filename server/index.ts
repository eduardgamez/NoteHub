import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenAI } from '@google/genai';
import { createClient } from '@supabase/supabase-js';

type ProviderId = 'openai' | 'anthropic' | 'gemini';
interface Message { role: 'user' | 'assistant'; content: string }
interface ContextItem { id: string; type: string; content: string }
interface CompleteBody { provider: ProviderId; providerKey?: string; messages: Message[]; context: ContextItem[]; global?: boolean; permissions?: { web?: boolean } }

const app = express();
const port = Number(process.env.NOTEHUB_API_PORT ?? 8787);
const requireAuth = process.env.NOTEHUB_REQUIRE_AUTH === 'true';
const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
const authClient = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
app.use(cors({ origin: process.env.NOTEHUB_WEB_ORIGIN?.split(',') ?? ['http://localhost:5173', 'http://127.0.0.1:5173'] }));
app.use(express.json({ limit: '18mb' }));

const configured = () => ({
  openai: Boolean(process.env.OPENAI_API_KEY),
  anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
  gemini: Boolean(process.env.GEMINI_API_KEY),
});

app.get('/api/health', (_request, response) => response.json({ ok: true, authRequired: requireAuth }));
app.get('/api/ai/status', (_request, response) => response.json({ providers: configured(), models: {
  openai: process.env.OPENAI_MODEL ?? 'gpt-5-mini',
  anthropic: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-5-20250929',
  gemini: process.env.GEMINI_MODEL ?? 'gemini-3-flash-preview',
} }));

app.post('/api/ai/complete', async (request, response, next) => {
  if (!requireAuth) { next(); return; }
  if (!authClient) { response.status(500).json({ error: 'AI broker authentication is enabled but Supabase is not configured on the server.' }); return; }
  const token = request.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
  if (!token) { response.status(401).json({ error: 'Sign in to use the AI broker.' }); return; }
  const { error } = await authClient.auth.getUser(token);
  if (error) { response.status(401).json({ error: 'Your session is invalid or expired.' }); return; }
  next();
}, async (request, response) => {
  const body = request.body as CompleteBody;
  if (!body || !['openai', 'anthropic', 'gemini'].includes(body.provider) || !Array.isArray(body.messages)) {
    response.status(400).json({ error: 'Invalid AI request.' }); return;
  }
  const apiKey = typeof body.providerKey === 'string' && body.providerKey.trim() ? body.providerKey.trim() : providerEnvironmentKey(body.provider);
  if (!apiKey) {
    response.status(503).json({ error: `${body.provider} is not configured. Add its API key in NoteHub Settings.` }); return;
  }

  try {
    const text = body.provider === 'openai' ? await completeOpenAI(body, apiKey) : body.provider === 'anthropic' ? await completeAnthropic(body, apiKey) : await completeGemini(body, apiKey);
    response.json(parseModelResponse(text));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown provider error';
    console.error(`[ai:${body.provider}]`, message);
    response.status(502).json({ error: `The ${body.provider} request failed. ${message}` });
  }
});

function providerEnvironmentKey(provider: ProviderId) {
  if (provider === 'openai') return process.env.OPENAI_API_KEY;
  if (provider === 'anthropic') return process.env.ANTHROPIC_API_KEY;
  return process.env.GEMINI_API_KEY;
}

const systemPrompt = `You are NoteHub's workspace assistant. Answer using only relevant supplied context and clearly say when data is missing.
Read-only questions are answered immediately. Never claim to have changed data.
When the user requests a workspace change, return it as a proposal. Valid proposal kinds are context.update, calendar.create, task.create, and file.update.
Return ONLY JSON with this shape: {"text":"helpful answer","proposals":[{"kind":"calendar.create","title":"...","description":"...","before":"optional","after":"...","payload":{}}]}.
Payload contracts: context.update={projectId,fieldId?,label,value}; calendar.create={title,start,end,projectId?}; task.create={title,due?,projectId?}; file.update={noteId,blockId,content}.
For dates, payload must contain ISO strings. Keep proposals atomic and in the order they should be reviewed. Do not include proposals for read-only questions.`;

function contextPrompt(context: ContextItem[]) {
  const textual = context.filter((item) => item.type !== 'image').map((item) => `[${item.type}:${item.id}] ${item.content}`).join('\n');
  return textual ? `\n\nRetrieved NoteHub context:\n${textual}` : '';
}

function images(context: ContextItem[]) {
  return context.filter((item) => item.type === 'image' && item.content.startsWith('data:image/')).map((item) => {
    const match = item.content.match(/^data:(image\/[^;]+);base64,(.+)$/);
    return match ? { mime: match[1], data: match[2], url: item.content } : null;
  }).filter((item): item is { mime: string; data: string; url: string } => Boolean(item));
}

async function completeOpenAI(body: CompleteBody, apiKey: string) {
  const client = new OpenAI({ apiKey });
  const history = body.messages.slice(0, -1).map((message) => ({ role: message.role, content: message.content }));
  const latest = body.messages.at(-1)?.content ?? '';
  const content: any[] = [{ type: 'input_text', text: latest + contextPrompt(body.context) }, ...images(body.context).map((image) => ({ type: 'input_image', image_url: image.url }))];
  const result = await client.responses.create({
    model: process.env.OPENAI_MODEL ?? 'gpt-5-mini',
    instructions: systemPrompt,
    input: [...history, { role: 'user', content }] as any,
    tools: body.permissions?.web ? [{ type: 'web_search' }] : undefined,
  });
  return result.output_text;
}

async function completeAnthropic(body: CompleteBody, apiKey: string) {
  const client = new Anthropic({ apiKey });
  const history = body.messages.slice(0, -1).map((message) => ({ role: message.role, content: message.content }));
  const latest = body.messages.at(-1)?.content ?? '';
  const content: any[] = [{ type: 'text', text: latest + contextPrompt(body.context) }, ...images(body.context).map((image) => ({ type: 'image', source: { type: 'base64', media_type: image.mime, data: image.data } }))];
  const result = await client.messages.create({
    model: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-5-20250929', max_tokens: 3000, system: systemPrompt,
    messages: [...history, { role: 'user', content }] as any,
  });
  return result.content.filter((part) => part.type === 'text').map((part) => part.text).join('\n');
}

async function completeGemini(body: CompleteBody, apiKey: string) {
  const client = new GoogleGenAI({ apiKey });
  const latest = body.messages.at(-1)?.content ?? '';
  const conversation = body.messages.slice(0, -1).map((message) => ({ role: message.role === 'assistant' ? 'model' : 'user', parts: [{ text: message.content }] }));
  const parts: any[] = [{ text: latest + contextPrompt(body.context) }, ...images(body.context).map((image) => ({ inlineData: { mimeType: image.mime, data: image.data } }))];
  const result = await client.models.generateContent({
    model: process.env.GEMINI_MODEL ?? 'gemini-3-flash-preview',
    contents: [...conversation, { role: 'user', parts }],
    config: { systemInstruction: systemPrompt, responseMimeType: 'application/json' },
  });
  return result.text ?? '';
}

function parseModelResponse(raw: string) {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    const parsed = JSON.parse(cleaned);
    return { text: typeof parsed.text === 'string' ? parsed.text : cleaned, proposals: Array.isArray(parsed.proposals) ? parsed.proposals : [] };
  } catch {
    return { text: raw, proposals: [] };
  }
}

app.listen(port, () => console.log(`NoteHub API listening on http://localhost:${port}`));
