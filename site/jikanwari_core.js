// 時間割（TEACHERS）と日ごとの日課（NIKKA）を組み合わせて、先生ごとの授業の予定を作る。
// ブラウザ（jikanwari.html）と Node（tools/build_feeds.js）の両方で使う。
(function (root) {
  const data = typeof module !== "undefined" ? { ...require("./config.js"), ...require("./jikanwari_data.js"), ...require("./nikka.js") } : root;
  const { CONFIG, TEACHERS, TIMETABLE_VERSION, NIKKA, NIKKA_VERSION } = data;

  const DAYS = "月火水木金";
  const CIRCLED = "①②③④⑤⑥";
  const GRADES = ["1", "2", "3", "IJ"];
  // 日課（時程）は config.js の bands から作る。base＋shift の帯は、元の帯を何分かずらす
  const later = (t, min) => { const [h, m] = t.split(":").map(Number), x = h * 60 + m + min; return `${String(Math.floor(x / 60)).padStart(2, "0")}:${String(x % 60).padStart(2, "0")}`; };
  const TIMES = {}, BAND = {};
  for (const [k, b] of Object.entries(CONFIG.bands)) {
    TIMES[k] = b.times || CONFIG.bands[b.base].times.map(([s, e]) => [later(s, b.shift || 0), later(e, b.shift || 0)]);
    BAND[k] = b.label || k;
  }

  const pad = n => String(n).padStart(2, "0");
  const yearOf = m => (m >= 4 ? CONFIG.fiscalYear : CONFIG.fiscalYear + 1);
  const dateKeys = Object.keys(NIKKA).sort((a, b) => {
    const [am, ad] = a.split("/").map(Number), [bm, bd] = b.split("/").map(Number);
    return (yearOf(am) - yearOf(bm)) || (am - bm) || (ad - bd);
  });
  const MONTHS = [...new Set(dateKeys.map(k => +k.split("/")[0]))];

  // 1日分の学年ごとの欄を ["", "月4", ...] ×4（1年・2年・3年・IJ）に広げる
  function rowsOf(entry) {
    const split = s => { const a = (s || "").split(",").map(x => x.trim()); while (a.length < 6) a.push(""); return a; };
    let rows = entry.length <= 2 ? [split(entry[1]), split(entry[1]), split(entry[1])] : [split(entry[1]), split(entry[2]), split(entry[3])];
    if (entry.length >= 5) rows.push(split(entry[4]));
    else if (entry.length <= 2) rows.push(rows[0]);
    else rows.push(rows[0].map((_, p) => { // IJ：その時限で多い学年に合わせる
      const vals = rows.map(r => r[p]);
      return vals.find(v => vals.filter(x => x === v).length >= 2) ?? vals[0];
    }));
    return rows;
  }
  // 欄の文字 → 実際に行う授業の曜日・時限（授業なしなら null）
  function sourceOf(token, wd, p) {
    if (token === "") return { d: wd, p };
    const m = token.match(/^([月火水木金])([1-6])$/);
    return m ? { d: DAYS.indexOf(m[1]), p: +m[2] - 1 } : null;
  }

  function hash(s) { let h = 5381; for (const ch of s) h = ((h * 33) ^ ch.codePointAt(0)) >>> 0; return h.toString(16).padStart(8, "0"); }

  // 先生1人分の授業。{lessons:[...], special:["11/5", ...]}
  function lessonsFor(teacher) {
    const lessons = [], special = [];
    for (const key of dateKeys) {
      const [m, d] = key.split("/").map(Number), y = yearOf(m), entry = NIKKA[key], band = entry[0];
      if (!TIMES[band]) { special.push(key); continue; }
      const wd = new Date(y, m - 1, d).getDay() - 1;
      const rows = rowsOf(entry);
      for (let p = 0; p < 6; p++) {
        GRADES.forEach((g, gi) => {
          const src = sourceOf(rows[gi][p], wd, p);
          if (!src) return;
          const item = teacher.slots[src.d] && teacher.slots[src.d][src.p];
          if (!item || item[0] !== g) return;
          const [start, end] = TIMES[band][p];
          const title = `${CIRCLED[p]} ${item[1]}`;
          const notes = [`${p + 1}時間目・${BAND[band]}`];
          if (src.d !== wd || src.p !== p) notes.push(`振替（${DAYS[src.d]}曜の${CIRCLED[src.p]}）`);
          const ymd = `${y}${pad(m)}${pad(d)}`;
          lessons.push({
            id: `sj${teacher.id}${ymd}${p + 1}${hash(title + start + end)}`,
            m, d, y, ymd, wd, p, start, end, title,
            memo: notes.join("・")
          });
        });
      }
    }
    return { lessons, special };
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
  const footer = () => `時間割 ${TIMETABLE_VERSION}・行事予定 ${MONTHS.map(m => `${m}月${NIKKA_VERSION[m] || ""}`).join("、")}`;
  function buildIcs(lessons, calName) {
    const n = new Date();
    const stamp = `${n.getUTCFullYear()}${pad(n.getUTCMonth() + 1)}${pad(n.getUTCDate())}T${pad(n.getUTCHours())}${pad(n.getUTCMinutes())}${pad(n.getUTCSeconds())}Z`;
    const L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//School Calendar Template//Jikanwari//JA", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
      "X-WR-TIMEZONE:Asia/Tokyo",
      ...(calName ? [`X-WR-CALNAME:${calName}`, "REFRESH-INTERVAL;VALUE=DURATION:PT12H", "X-PUBLISHED-TTL:PT12H"] : []),
      "BEGIN:VTIMEZONE", "TZID:Asia/Tokyo", "BEGIN:STANDARD", "DTSTART:19700101T000000",
      "TZOFFSETFROM:+0900", "TZOFFSETTO:+0900", "TZNAME:JST", "END:STANDARD", "END:VTIMEZONE"];
    for (const x of lessons) {
      L.push("BEGIN:VEVENT", `UID:${x.id}@${CONFIG.siteHost}`, `DTSTAMP:${stamp}`,
        `DTSTART;TZID=Asia/Tokyo:${x.ymd}T${x.start.replace(":", "")}00`,
        `DTEND;TZID=Asia/Tokyo:${x.ymd}T${x.end.replace(":", "")}00`,
        `SUMMARY:${esc(x.title)}`, `DESCRIPTION:${esc(x.memo + "\n" + footer())}`, "CATEGORIES:授業", "END:VEVENT");
    }
    L.push("END:VCALENDAR");
    return L.map(fold).join("\r\n") + "\r\n";
  }

  const api = { CONFIG, TEACHERS, TIMETABLE_VERSION, NIKKA, NIKKA_VERSION, MONTHS, DAYS, CIRCLED, lessonsFor, buildIcs, footer };
  if (typeof module !== "undefined") module.exports = api;
  else root.Jikanwari = api;
})(this);
