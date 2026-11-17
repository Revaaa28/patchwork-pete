'use strict';

/* Phrase splitting for Pete's voice.
   Pete speaks like a stitched monster: slowly, in short phrases, with a
   pause between them. This pure helper turns one block of status text
   into speakable phrases: split on sentence ends (protecting decimals
   like "PM2.5" and "8.2" and "+2.50%"), then split over-long sentences
   at clause boundaries (commas / semicolons / colons), hard-splitting
   only as a last resort. It changes the DELIVERY, never the words'
   meaning — the line itself is built from Pete's real state in app.js.
   Loaded as a classic script in the browser (window.splitPhrases) and
   require()-able in Node for the tests. */

function splitSentences(text) {
  const out = [];
  let buf = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    buf += ch;
    if (ch === '.' || ch === '!' || ch === '?') {
      const prev = text[i - 1];
      const next = text[i + 1];
      if (ch === '.' && /\d/.test(prev || '') && /\d/.test(next || '')) continue; // decimal point
      if (next === undefined || /\s/.test(next)) { out.push(buf); buf = ''; }
    }
  }
  if (buf.trim()) out.push(buf);
  return out.map((s) => s.trim()).filter(Boolean);
}

function splitPhrases(text, maxLen = 110) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  const out = [];
  for (const sentence of splitSentences(clean)) {
    if (sentence.length <= maxLen) { out.push(sentence); continue; }
    // Clause chunks keep their punctuation attached to the words.
    const clauses = sentence.match(/[^,;:]+[,;:]*\s*/g) || [sentence];
    let buf = '';
    const flush = () => { if (buf.trim()) { out.push(buf.trim()); buf = ''; } };
    for (const clause of clauses) {
      const c = clause.trim();
      if (!c) continue;
      if (buf && (buf.length + 1 + c.length) > maxLen) flush();
      buf = buf ? buf + ' ' + c : c;
      while (buf.length > maxLen) { // one clause longer than a whole phrase
        let cut = buf.lastIndexOf(' ', maxLen);
        if (cut < 30) cut = maxLen;
        out.push(buf.slice(0, cut).trim());
        buf = buf.slice(cut).trim();
      }
    }
    flush();
  }
  return out.filter(Boolean);
}

if (typeof window !== 'undefined') window.splitPhrases = splitPhrases;
if (typeof module !== 'undefined' && module.exports) module.exports = { splitPhrases, splitSentences };
