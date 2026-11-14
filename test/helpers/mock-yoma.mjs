// In-process fake of the public Yoma API endpoints Pathfinder uses.
import { createServer } from 'node:http';

export function yomaItem(n, extra = {}) {
  const id = `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
  return { id, title: `Opportunity ${n}`, type: 'Job', organizationName: `Org ${n}`, summary: null, description: '', hidden: false,
    engagementType: 'Online', dateEnd: '2027-06-01T00:00:00Z', zltoReward: null, difficulty: 'Beginner', commitmentIntervalTotalHours: null,
    commitmentIntervalDescription: null, keywords: [], skills: [], categories: [], countries: [], yomaInfoURL: `https://yoma.world/opportunities/${id}`, ...extra };
}

export async function startMockYoma(state) {
  // state: { items: [], fail: false, calls: [] }
  state.calls = state.calls || [];
  const server = createServer(async (req, res) => {
    let body = ''; for await (const c of req) body += c;
    state.calls.push(`${req.method} ${req.url}`);
    if (state.fail) { res.writeHead(500).end('down'); return; }
    const json = d => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(d)); };
    if (req.url === '/opportunity/search/filter/country') return json([{ id: 'ng', name: 'Nigeria', codeAlpha2: 'NG' }, { id: 'ww', name: 'Worldwide', codeAlpha2: 'WW' }]);
    if (req.url === '/analytics/platform/metrics/info') return json({ userCountDisplay: '950,000+', organizationCountDisplay: '340+', opportunityCount: 4123, countryCount: 21 });
    if (req.url === '/opportunity/search') {
      const f = JSON.parse(body || '{}');
      state.lastFilter = f;
      const start = (f.pageNumber - 1) * f.pageSize;
      return json({ totalCount: state.items.length, items: state.items.slice(start, start + f.pageSize) });
    }
    res.writeHead(404).end();
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  return { base: `http://127.0.0.1:${server.address().port}`, close: () => new Promise(r => server.close(r)) };
}
