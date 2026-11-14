// AI provider layer. Azure OpenAI by default; any OpenAI-compatible endpoint as an alternative; "none" for no AI.
// Callers never see provider details: chat() returns parsed JSON, transcribe() returns text. Both throw on failure.

export function parseJSON(text) {
  let s = String(text ?? '').trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a < 0 || b < a) throw new Error('no JSON object in AI reply');
  return JSON.parse(s.slice(a, b + 1));
}

const WHISPER_LANG = { en: 'en', pcm: 'en', ha: 'ha', yo: 'yo' };

export function createAI(env = {}, fetchImpl = fetch, { timeoutMs = 10000 } = {}) {
  const azureReady = env.AZURE_OPENAI_ENDPOINT && env.AZURE_OPENAI_API_KEY && env.AZURE_OPENAI_CHAT_DEPLOYMENT;
  const compatReady = env.OPENAI_COMPAT_BASE_URL && env.OPENAI_COMPAT_MODEL;
  let provider = (env.AI_PROVIDER || '').trim() || (azureReady ? 'azure' : 'none');
  if ((provider === 'azure' && !azureReady) || (provider === 'openai-compatible' && !compatReady)) provider = 'none';
  if (!['azure', 'openai-compatible'].includes(provider)) provider = 'none';

  const version = env.AZURE_OPENAI_API_VERSION || '2024-10-21';
  const azBase = String(env.AZURE_OPENAI_ENDPOINT || '').replace(/\/+$/, '');
  const compatBase = String(env.OPENAI_COMPAT_BASE_URL || '').replace(/\/+$/, '');
  const voice = provider === 'azure' ? !!env.AZURE_OPENAI_TRANSCRIBE_DEPLOYMENT
    : provider === 'openai-compatible' ? !!env.OPENAI_COMPAT_TRANSCRIBE_MODEL : false;

  const headers = () => provider === 'azure' ? { 'api-key': env.AZURE_OPENAI_API_KEY } : (env.OPENAI_COMPAT_API_KEY ? { authorization: `Bearer ${env.OPENAI_COMPAT_API_KEY}` } : {});

  // One retry on 429 / 5xx / network error; each attempt limited by timeoutMs.
  async function call(url, init) {
    let lastErr;
    for (let attempt = 0; attempt < 2; attempt++) {
      const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), timeoutMs);
      try {
        const res = await fetchImpl(url, { ...init, signal: ctl.signal });
        if (res.ok) return await res.json();
        lastErr = new Error(`AI HTTP ${res.status}`);
        if (res.status !== 429 && res.status < 500) throw lastErr;
      } catch (e) {
        lastErr = e.name === 'AbortError' ? new Error('AI timeout') : e;
        if (lastErr.message === 'AI timeout' || /^AI HTTP 4(?!29)/.test(lastErr.message)) throw lastErr;
      } finally { clearTimeout(timer); }
    }
    throw lastErr;
  }

  async function chat({ system, user, maxTokens = 400 }) {
    if (provider === 'none') throw new Error('AI is not configured');
    const url = provider === 'azure'
      ? `${azBase}/openai/deployments/${encodeURIComponent(env.AZURE_OPENAI_CHAT_DEPLOYMENT)}/chat/completions?api-version=${version}`
      : `${compatBase}/chat/completions`;
    const body = { messages: [{ role: 'system', content: system }, { role: 'user', content: user }], temperature: 0.2, max_tokens: maxTokens, response_format: { type: 'json_object' } };
    if (provider === 'openai-compatible') body.model = env.OPENAI_COMPAT_MODEL;
    const data = await call(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers() }, body: JSON.stringify(body) });
    const content = data?.choices?.[0]?.message?.content;
    if (!content) throw new Error('AI returned no content');
    return parseJSON(content);
  }

  async function transcribe(buffer, mime = 'audio/webm', lang = 'en') {
    if (!voice) throw new Error('voice is not configured');
    const url = provider === 'azure'
      ? `${azBase}/openai/deployments/${encodeURIComponent(env.AZURE_OPENAI_TRANSCRIBE_DEPLOYMENT)}/audio/transcriptions?api-version=${version}`
      : `${compatBase}/audio/transcriptions`;
    const form = new FormData();
    const ext = /ogg/.test(mime) ? 'ogg' : /mp4|m4a|aac/.test(mime) ? 'm4a' : /wav/.test(mime) ? 'wav' : 'webm';
    form.append('file', new Blob([buffer], { type: mime }), `note.${ext}`);
    form.append('language', WHISPER_LANG[lang] || 'en');
    form.append('response_format', 'json');
    if (provider === 'openai-compatible') form.append('model', env.OPENAI_COMPAT_TRANSCRIBE_MODEL);
    const data = await call(url, { method: 'POST', headers: headers(), body: form });
    return String(data?.text ?? '');
  }

  return { provider, features: { chat: provider !== 'none', voice }, chat, transcribe };
}
