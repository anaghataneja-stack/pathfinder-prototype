// Keyword rules: the fallback whenever AI is off or fails, and the first pass for listing tags.
// Keep SKILLS keys in sync with SK in pathfinder.html (a test checks this).
export const SKILLS = {
  'digital-basics': 'Using a phone & computer', 'online-safety': 'Staying safe online', 'job-search': 'Finding & applying for jobs',
  comms: 'Clear communication', customer: 'Serving customers', spreadsheets: 'Spreadsheets & data entry', 'social-media': 'Social media marketing',
  cv: 'Writing a CV', interview: 'Interview skills', teamwork: 'Working in a team', bookkeeping: 'Basic bookkeeping',
  'business-plan': 'Business planning', pricing: 'Pricing & selling', 'agri-practice': 'Modern farming practices', poultry: 'Poultry care',
  tailoring: 'Sewing & tailoring', 'design-basics': 'Graphic design basics', 'coding-basics': 'Coding basics',
  'phone-repair': 'Phone & electronics repair', 'market-trading': 'Market trading & stock', 'food-prep': 'Cooking & food selling',
  'hair-beauty': 'Hair & beauty', 'driving-delivery': 'Driving & delivery', childcare: 'Caring for children',
  'solar-install': 'Solar panel installation', 'work-at-height': 'Working safely at height'
};

// English, Pidgin, Hausa and Yoruba keywords (Hausa/Yoruba lists need native-speaker review).
const SKILL_RULES = [
  [/customer|client|call cent|front desk|serve people|attend to|\bsell|provision|abokan ciniki|on[ií]bàárà/i, 'customer'],
  [/communicat|writing|presentation|public speaking|english|talk to people/i, 'comms'],
  [/excel|spreadsheet|data entry|google sheets|data analy|analytics/i, 'spreadsheets'],
  [/social media|digital marketing|content creat|marketing|instagram|tiktok|whatsapp status/i, 'social-media'],
  [/python|coding|programming|software|developer|javascript|web dev|html|\bai\b|machine learning/i, 'coding-basics'],
  [/graphic|canva|figma|\bdesign/i, 'design-basics'],
  [/\bcv\b|resume|curriculum vitae/i, 'cv'],
  [/interview/i, 'interview'],
  [/job search|job seeking|employab|career|work readiness/i, 'job-search'],
  [/team|group work|cooperative/i, 'teamwork'],
  [/bookkeep|accounting|financ|money record|budget|keep record|account book|ajo|esusu/i, 'bookkeeping'],
  [/entrepreneur|business plan|start.?up|venture|my own business|my business/i, 'business-plan'],
  [/\bsales\b|\bsell|selling|pricing|price|hawk|trade|trading|sayar|cinikayya|ìtajà|ta ọja|ta oja/i, 'pricing'],
  [/\bmarket(?!ing|er)|provision|shop|stall|kiosk|stock|hawk|kasuwa|ọjà|oja\b|sayar da kaya/i, 'market-trading'],
  [/agri|farm|crop|livestock|harvest|noma|gona|oko\b|àgbẹ̀|agbe/i, 'agri-practice'],
  [/poultry|chicken|fowl|egg|kaza|adìyẹ|adiye/i, 'poultry'],
  [/tailor|sewing|sew\b|fashion|garment|cloth|dinki|telo|aṣọ rán|ran aso/i, 'tailoring'],
  [/cyber|online safety|digital safety|privacy/i, 'online-safety'],
  [/digital literacy|computer|microsoft office|\bict\b|internet|smartphone/i, 'digital-basics'],
  [/phone repair|fix phone|repair phone|phone|electronic|technician|gyara waya|tun fóònù|tun foonu|repair/i, 'phone-repair'],
  [/cook|food|kitchen|catering|bake|baking|snack|puff.?puff|akara|suya|abinci|oúnjẹ|ounje/i, 'food-prep'],
  [/hair|barb|salon|braid|beauty|makeup|make-up|nail|aski|kitso|irun/i, 'hair-beauty'],
  [/driv|okada|keke|deliver|dispatch|rider|tuki|awakọ|awako/i, 'driving-delivery'],
  [/child|baby|babysit|nanny|creche|yara|ọmọ|omo\b/i, 'childcare'],
  [/solar|photovoltaic|\bpv\b|inverter|hasken rana|oòrùn/i, 'solar-install'],
  [/at height|ladder|rooftop|roof work|scaffold/i, 'work-at-height']
];
const SECTOR_RULES = [
  [/technolog|digit|data|\bai\b|software|coding|phone repair|electronic/i, 'digital'],
  [/tourism|hospitality|customer|sales|retail|\bmarket(?!ing|er)|trading|food|catering|delivery/i, 'customer'],
  [/agri|farm|environment|climate|green|poultry/i, 'agri'],
  [/fashion|beauty|tailor|hair|salon/i, 'fashion']
];
// Asking applicants for money. Tuned on real Yoma listings: "pay a competitive salary", "cash deposits" and
// "deposit conversion" are normal job wording and must not match.
const SCAM_RE = new RegExp([
  String.raw`\b(registration|application|processing|training|starter|joining|form|screening|medical|uniform)\s+fees?\b`,
  String.raw`\b(pay|send|transfer|bring)\s+(?:\w+\s+){0,3}?(?:₦|ngn\s?|n)\s?\d`,
  String.raw`\b(make|pay|send)\s+(?:a\s+)?(?:refundable\s+)?deposit\b|\bdeposit\s+(of|to\s+secure)\b`,
  String.raw`\bsend\s+money\b|\bpay\s+before\b|\b(pay|payment)\s+upfront\b|\bupfront\s+(payment|fee)`,
  String.raw`\bpay\s+for\s+(?:your\s+|the\s+)?(form|training|registration|kit|uniform|materials|id\s+card)\b`
].join('|'), 'i');

export function skillsFromText(text, max = 6) {
  const t = String(text ?? '');
  return [...new Set(SKILL_RULES.filter(([re]) => re.test(t)).map(([, k]) => k))].slice(0, max);
}
export function sectorsFromText(text) {
  const t = String(text ?? '');
  const s = [...new Set(SECTOR_RULES.filter(([re]) => re.test(t)).map(([, k]) => k))];
  return s.length ? s : ['all'];
}
export const isScam = text => SCAM_RE.test(String(text ?? ''));

// options: [{v, labels: string[]}]. Returns v or null.
export function matchOption(text, options) {
  const low = String(text ?? '').trim().toLowerCase();
  if (!low) return null;
  if (/^\d+$/.test(low)) { const o = options[Number(low) - 1]; return o ? o.v : null; }
  for (const o of options) if (o.labels.some(l => l.toLowerCase() === low)) return o.v;
  if (low.length >= 3) for (const o of options) if (o.labels.some(l => l.toLowerCase().startsWith(low))) return o.v;
  return null;
}
