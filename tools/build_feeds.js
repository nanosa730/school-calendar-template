// 購読用の .ics（site/feeds/）を作る。予定・時間割・日課を直したら、公開する前に必ず実行する。
// 使い方：node tools/build_feeds.js
const fs = require("fs"), path = require("path");
const site = path.join(__dirname, "..", "site");
const G = require(path.join(site, "gyoji_core.js"));
const out = path.join(site, "feeds");
fs.mkdirSync(out, { recursive: true });

// 行事・会議・提出
const S = G.CONFIG.short;
const feeds = { all: [`${S} 行事予定`, null], gyoji: [`${S} 行事`, "e"], kaigi: [`${S} 会議`, "m"], teishutsu: [`${S} 提出`, "s"] };
for (const [file, [name, kind]] of Object.entries(feeds)) {
  const evs = kind ? G.EVENTS.filter(e => e[5] === kind) : G.EVENTS;
  fs.writeFileSync(path.join(out, file + ".ics"), G.buildIcs(evs, name));
  console.log(file + ".ics", evs.length + "件");
}

// 先生ごとの授業（site/feeds/t/{先生id}.ics）
if (G.CONFIG.showJikanwari) {
  const J = require(path.join(site, "jikanwari_core.js"));
  const tout = path.join(out, "t");
  fs.mkdirSync(tout, { recursive: true });
  for (const f of fs.readdirSync(tout)) fs.unlinkSync(path.join(tout, f));
  let n = 0;
  for (const t of J.TEACHERS) {
    const { lessons } = J.lessonsFor(t);
    fs.writeFileSync(path.join(tout, t.id + ".ics"), J.buildIcs(lessons, `${S} 授業（${t.name}）`));
    n += lessons.length;
  }
  console.log(`t/：${J.TEACHERS.length}人分（${n}コマ）`);
}
