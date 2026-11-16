const r=require('D:/cache/npm-cache/_npx/d3dffeb053155d07/node_modules/k-skill-rhwp');
(async()=>{ const doc=await r.loadDocument('form_idea.hwp');
 for(const c of [1,3,5,7,9,11,13]) { console.log(c, doc.getCellCharPropertiesAt(0,2,0,c,0,1)); console.log('  para',doc.getCellParaPropertiesAt(0,2,0,c,0)); }
 console.log(doc.getPageDef? doc.getPageDef(0):'');
})().catch(e=>console.error('ERR',e.stack||e));
