// 구글폼 항목 읽기 (입력·제출 안 함). 계정 이메일 표시는 지운다
export default async (ctx) => {
  const p = await ctx.newPage(); const out = [];
  await p.goto(process.env.URL, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(5000);
  const grab = async () => (await p.evaluate(() => document.body.innerText)).replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '<email>');
  out.push('URL ' + p.url().slice(0, 80)); out.push(await grab());
  await p.close(); return out.join('\n');
};
