// 行事・会議・提出（EVENTS）の共通部分。ブラウザ（index.html）と Node（tools/build_feeds.js）の両方で使う。
(function (root) {
  const src = typeof module !== "undefined" ? { ...require("./config.js"), ...require("./events.js") } : root;
  const { CONFIG, EVENTS } = src;

  const KIND = { e: "行事", m: "会議", s: "提出" };
  const pad = n => String(n).padStart(2, "0");
  const yr = m => (m >= 4 ? CONFIG.fiscalYear : CONFIG.fiscalYear + 1);
  const dt = (m, d) => new Date(yr(m), m - 1, d);
  const place = e => (e.length > 8 ? e[8] : CONFIG.schoolName);
  const ymd = (m, d) => `${yr(m)}${pad(m)}${pad(d)}`;
  const hm = t => t.replace(":", "") + "00";
  const nextDay = (m, d) => { const x = dt(m, d); x.setDate(x.getDate() + 1); return `${x.getFullYear()}${pad(x.getMonth() + 1)}${pad(x.getDate())}`; };
  const lastOf = e => e[7].split("/").map(Number);
  // 年度の順（4月→3月）に並べた月
  const months = [...new Set(EVENTS.map(e => e[0]))].sort((a, b) => ((a + 8) % 12) - ((b + 8) % 12));

  // Googleカレンダーの登録画面を開くURL
  function gcalUrl(e) {
    let dates;
    if (e[3]) dates = `${ymd(e[0], e[1])}T${hm(e[3])}/${ymd(e[0], e[1])}T${hm(e[4])}`;
    else if (e[7]) { const [mm, dd] = lastOf(e); dates = `${ymd(e[0], e[1])}/${nextDay(mm, dd)}`; }
    else dates = `${ymd(e[0], e[1])}/${nextDay(e[0], e[1])}`;
    const p = new URLSearchParams({ action: "TEMPLATE", text: e[2], dates, ctz: "Asia/Tokyo" });
    if (e[6]) p.set("details", e[6]);
    if (place(e)) p.set("location", place(e));
    return "https://calendar.google.com/calendar/render?" + p.toString();
  }

  // ---- .ics ----
  const esc = s => String(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
  const enc = new TextEncoder();
  function fold(line) { // 1行75バイトまで（日本語の途中で切らない）
    const out = []; let buf = "", size = 0;
    for (const ch of line) {
      const b = enc.encode(ch).length;
      if (size + b > 75) { out.push(buf); buf = " "; size = 1; }
      buf += ch; size += b;
    }
    out.push(buf); return out.join("\r\n");
  }
  function hash(s) { let h = 5381; for (const ch of s) h = ((h * 33) ^ ch.codePointAt(0)) >>> 0; return h.toString(16); }
  const uidHost = CONFIG.siteHost.replace(/[^a-z0-9.-]/gi, "");
  function stampNow() {
    const n = new Date();
    return `${n.getUTCFullYear()}${pad(n.getUTCMonth() + 1)}${pad(n.getUTCDate())}T${pad(n.getUTCHours())}${pad(n.getUTCMinutes())}${pad(n.getUTCSeconds())}Z`;
  }
  function header(calName) {
    return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//School Calendar Template//JA", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
      "X-WR-TIMEZONE:Asia/Tokyo",
      ...(calName ? [`X-WR-CALNAME:${calName}`, "REFRESH-INTERVAL;VALUE=DURATION:PT12H", "X-PUBLISHED-TTL:PT12H"] : []),
      "BEGIN:VTIMEZONE", "TZID:Asia/Tokyo", "BEGIN:STANDARD", "DTSTART:19700101T000000",
      "TZOFFSETFROM:+0900", "TZOFFSETTO:+0900", "TZNAME:JST", "END:STANDARD", "END:VTIMEZONE"];
  }
  function vevent(e, stamp) {
    const L = ["BEGIN:VEVENT", `UID:${ymd(e[0], e[1])}-${hash(e[2])}@${uidHost}`, `DTSTAMP:${stamp}`];
    if (e[3]) {
      L.push(`DTSTART;TZID=Asia/Tokyo:${ymd(e[0], e[1])}T${hm(e[3])}`, `DTEND;TZID=Asia/Tokyo:${ymd(e[0], e[1])}T${hm(e[4])}`);
    } else {
      const [mm, dd] = e[7] ? lastOf(e) : [e[0], e[1]];
      L.push(`DTSTART;VALUE=DATE:${ymd(e[0], e[1])}`, `DTEND;VALUE=DATE:${nextDay(mm, dd)}`, "TRANSP:TRANSPARENT");
    }
    L.push(`SUMMARY:${esc(e[2])}`);
    if (e[6]) L.push(`DESCRIPTION:${esc(e[6])}`);
    if (place(e)) L.push(`LOCATION:${esc(place(e))}`);
    L.push(`CATEGORIES:${KIND[e[5]]}`, "END:VEVENT");
    return L;
  }
  function buildIcs(evs, calName) {
    const stamp = stampNow(), L = header(calName);
    evs.forEach(e => L.push(...vevent(e, stamp)));
    L.push("END:VCALENDAR");
    return L.map(fold).join("\r\n") + "\r\n";
  }
  function fileName(evs) {
    const ms = months.filter(m => evs.some(e => e[0] === m));
    const mPart = ms.length > 1 ? `${ms[0]}〜${ms[ms.length - 1]}月` : `${ms[0]}月`;
    const kPart = ["e", "m", "s"].filter(k => evs.some(e => e[5] === k)).map(k => KIND[k]).join("・");
    return `${CONFIG.short}_${mPart}${kPart}.ics`;
  }

  const api = { CONFIG, EVENTS, KIND, months, pad, yr, dt, place, lastOf, gcalUrl, buildIcs, fileName, fold, esc, header, stampNow };
  if (typeof module !== "undefined") module.exports = api;
  else root.Gyoji = api;
})(this);
