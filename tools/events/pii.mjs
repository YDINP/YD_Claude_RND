import fs from 'fs';
export function pii(){
  const src = fs.readFileSync('D:/park/YD_Claude_RND/reports/공모전/화성도시공사_ESG혁신/_build/hs_fill.cjs','utf8');
  const cells = {};
  for (const m of src.matchAll(/setCell\(doc,0,4,(\d+),\[(.*?)\]\)/g)) cells[m[1]] = [...m[2].matchAll(/'([^']*)'/g)].map(x=>x[1]);
  const name = cells[9][0], email = cells[15][0];
  const phone = src.match(/01[0-9]-?\d{3,4}-?\d{4}/)[0].replace(/-/g,'');
  return { name, email, phone, phoneDash: phone.replace(/^(\d{3})(\d{3,4})(\d{4})$/,'$1-$2-$3') };
}
