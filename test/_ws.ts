const url = process.argv[2] ?? "ws://127.0.0.1:3961/ws";
const says = process.argv.slice(3);
const ws = new WebSocket(url);
let i = 0, t0 = 0;
const next = () => { if (i >= says.length) { ws.close(); return; } t0 = performance.now(); console.log(`\n> ${says[i]}`); ws.send(JSON.stringify({ type: "text", text: says[i++] })); };
ws.onopen = () => { ws.send(JSON.stringify({ type: "config", agent: "cooper", writes: process.env.WRITES === "1", pretend_writes: true, new_session: true })); next(); };
let text = "";
ws.onmessage = (e) => { const m = JSON.parse(e.data as string);
  if (m.type === "token") text += m.text; else if (m.type === "tool") console.log("  " + m.text);
  else if (m.type === "done") { console.log(`  = ${text}\n  [${JSON.stringify(m.timings)} ${JSON.stringify(m.usage)} ${m.stop}]`); text = ""; next(); }
  else if (m.type === "error") { console.log("ERROR", m.text); next(); } };

export {};
