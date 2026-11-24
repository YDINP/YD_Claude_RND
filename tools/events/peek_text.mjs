// 읽기 전용: env URLS="u1 u2 ..." 각 페이지 본문·입력칸·버튼·링크를 뽑는다 (입력·제출 없음)
export default async (ctx) => {
  const out = []; const p = await ctx.newPage(); p.on('dialog', d => d.dismiss().catch(() => {}));
  for (const u of (process.env.URLS || '').split(/\s+/).filter(Boolean)) {
    try {
      await p.goto(u, { waitUntil: 'domcontentloaded', timeout: 45000 }); await p.waitForTimeout(5000);
      const r = await p.evaluate(() => ({
        url: location.href, text: document.body.innerText.replace(/\s+/g, ' ').slice(0, 2500),
        inputs: [...document.querySelectorAll('input,textarea,select')].filter(e => e.offsetParent).map(e => (e.type || e.tagName) + ':' + (e.name || e.id || e.placeholder || '')).slice(0, 40).join(', '),
        links: [...document.querySelectorAll('a')].map(a => (a.innerText.trim().slice(0, 20) + '>' + a.href)).filter(s => /설문|이벤트|퀴즈|form|survey|참여/i.test(s)).slice(0, 15).join(' | '),
      }));
      out.push(`## ${u}\nURL ${r.url}\nINPUTS ${r.inputs}\nLINKS ${r.links}\n${r.text}`);
    } catch (e) { out.push(`## ${u} ERR ${e.message.slice(0, 120)}`); }
  }
  await p.close(); return out.join('\n\n').replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '<email>').replace(/01\d-?\d{3,4}-?\d{4}/g, '<tel>');
};
