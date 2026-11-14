// Remove personal details before any text leaves the server (to the AI) and cap its length.
const EMAIL = /[\w.+-]+@[\w-]+(\.[\w-]+)+/g;
// Phone numbers: optional +country code, then 7+ digits possibly split by spaces, dots or dashes.
const PHONE = /(\+?\d{1,3}[\s.-]?)?(\(?\d{2,4}\)?[\s.-]?){2,4}\d{3,4}/g;
const LONG_DIGITS = /\d{6,}/g;

export function stripPII(text, max = 600) {
  let s = String(text ?? '');
  s = s.replace(EMAIL, '[removed]');
  // Years in work history ("2019-2023", "2021 2022") look like digit runs but are kept.
  s = s.replace(PHONE, m => { const d = m.replace(/\D/g, ''); return d.length >= 7 && !/^(?:(?:19|20)\d{2})+$/.test(d) ? '[removed]' : m; });
  s = s.replace(LONG_DIGITS, '[removed]');
  return s.slice(0, max);
}
