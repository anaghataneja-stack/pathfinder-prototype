// In-process fake of the Azure OpenAI REST API (chat completions + audio transcriptions).
import { createServer } from 'node:http';

// state.chat(body, n) -> { status, content } | { status, raw } | { delay }
// state.transcribe() -> { status, text }
export async function startMockAzure(state) {
  state.chatBodies = []; state.calls = 0; state.headers = [];
  const server = createServer(async (req, res) => {
    const chunks = []; for await (const c of req) chunks.push(c);
    const buf = Buffer.concat(chunks);
    state.headers.push(req.headers);
    if (req.url.includes('/chat/completions')) {
      state.calls++;
      const body = JSON.parse(buf.toString() || '{}');
      state.chatBodies.push(body);
      const r = await state.chat(body, state.calls);
      if (r.delay) await new Promise(ok => setTimeout(ok, r.delay));
      if (r.status && r.status !== 200) { res.writeHead(r.status).end('{}'); return; }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(r.raw ?? { choices: [{ message: { content: typeof r.content === 'string' ? r.content : JSON.stringify(r.content) } }] }));
      return;
    }
    if (req.url.includes('/audio/transcriptions')) {
      state.audioBytes = buf.length; state.audioBody = buf.toString('latin1');
      const r = state.transcribe ? state.transcribe() : { text: '' };
      if (r.status && r.status !== 200) { res.writeHead(r.status).end('{}'); return; }
      res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ text: r.text }));
      return;
    }
    res.writeHead(404).end();
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const endpoint = `http://127.0.0.1:${server.address().port}`;
  return {
    endpoint,
    env: { AZURE_OPENAI_ENDPOINT: endpoint, AZURE_OPENAI_API_KEY: 'test-key', AZURE_OPENAI_CHAT_DEPLOYMENT: 'chat', AZURE_OPENAI_TRANSCRIBE_DEPLOYMENT: 'whisper', AZURE_OPENAI_API_VERSION: '2024-10-21' },
    close: () => new Promise(r => server.close(r))
  };
}
