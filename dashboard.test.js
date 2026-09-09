const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const data = require('./dashboard-data.js');
const table = rows => {const h=Object.keys(rows[0]);return [h,...rows.map(r=>h.map(k=>r[k]))];};
function fixtures() {
  const newRows=[],metaRows=[],budgetRows=[];
  for(let m=0;m<12;m++) {
    for(const name of ['桃園愛美肌','江翠愛美肌']) {
      newRows.push({'月份':data.months[m],'品牌代碼':'MS','年度歸屬':2026,'年度月序':m+1,'分店':name,'資料狀態':m<2?'已匯入':'待匯入','實際新客':name==='桃園愛美肌'?2:4,'新客目標':10});
      if(m<2) metaRows.push({'月份':data.months[m],'品牌代碼':'MS','年度歸屬':2026,'月序':m+1,'分店':name,'實際花費':100,'訊息花費':80,'Meta詢問數':4,'Meta預算':120,'資料完整性':'已確認','查詢備註':''});
    }
    for(const platform of ['Meta','LAP']) budgetRows.push({'月份':data.months[m],'品牌代碼':'MS','年度歸屬':2026,'年度月序':m+1,'廣告平台':platform,'預算金額':300,'實際花費':m<2?(platform==='Meta'?200:10):null,'實際花費來源':'測試資料','填寫狀態':m<2?'已填':'待補'});
  }
  const overview=[],detail=[];
  for(let m=0;m<2;m++) {
    overview.push({'月份':data.months[m],'品牌代碼':'MS','客群':'新客','到店數':6,'消費數':3,'消費金額':700});
    overview.push({'月份':data.months[m],'品牌代碼':'MS','客群':'舊客','到店數':m,'消費數':m,'消費金額':m*50});
    for(const [name,arrivals,count,amount] of [['桃園愛美肌',2,1,100],['江翠愛美肌',4,2,600]]) detail.push({'月份':data.months[m],'品牌代碼':'MS','客群':'新客','統計基準':'依預約日期','預約店':name,'來源代碼':1,'到店數':arrivals,'消費數':count,'消費金額':amount});
    if(m) detail.push({'月份':data.months[m],'品牌代碼':'MS','客群':'舊客','統計基準':'依預約日期','預約店':'江翠愛美肌','來源代碼':1,'到店數':1,'消費數':1,'消費金額':50});
  }
  return [newRows,metaRows,budgetRows,overview,detail];
}
const ranges=raw=>raw.map(rows=>({values:table(rows)}));
test('fiscal year, confirmed months and message-cost CPA',()=>{
  const r=data.parseAll(ranges(fixtures()));
  assert.equal(r.newRows.length,2);
  assert.equal(data.months[0],'2025/12');
  assert.equal(data.months[11],'2026/11');
  assert.equal(data.metaTotal(r.metaRows,'all').cpa,20);
  assert.equal(r.budgetRows[11].meta.a,null);
});
test('missing Meta zero placeholders remain unknown; confirmed zero stays zero',()=>{
  const raw=fixtures();
  Object.assign(raw[1][0],{'實際花費':0,'訊息花費':0,'Meta詢問數':0,'Meta預算':null,'資料完整性':'部分資料','查詢備註':'該分店資料待補'});
  const r=data.parseMetaRows(table(raw[1]));
  assert.equal(data.metaTotal([r[0]],'ty').s,null);
  assert.equal(data.metaTotal([r[0]],'all').status,'部分資料');
  Object.assign(raw[1][0],{'資料完整性':'已確認','查詢備註':''});
  const zero=data.metaTotal([data.parseMetaRows(table(raw[1]))[0]],'ty');
  assert.equal(zero.s,0);assert.equal(zero.cpa,null);
});
test('duplicate keys, missing new-customer months and invalid numbers fail closed',()=>{
  const raw=fixtures();
  assert.throws(()=>data.parseNewRows(table([...raw[0],raw[0][0]])),/重複/);
  assert.throws(()=>data.parseNewRows(table(raw[0].filter(r=>r['年度月序']!==1))),/完整/);
  assert.throws(()=>data.number('#DIV/0!'),/無效/);
  assert.throws(()=>data.parseNewRows(table(raw[0].map((r,i)=>i===0?{...r,'實際新客':null}:r))),/缺少/);
});
test('mismatched dates, schema and source totals fail closed',()=>{
  const raw=fixtures();
  assert.throws(()=>data.parseNewRows([['incorrect'],[1]]),/欄位/);
  const date=structuredClone(raw);date[0][0]['月份']='2026/01';
  assert.throws(()=>data.parseNewRows(table(date[0])),/月序/);
  raw[2][0]['實際花費']=201;
  assert.throws(()=>data.parseAll(ranges(raw)),/不一致/);
});
test('partial-platform budgets are not reported complete',()=>{
  const raw=fixtures();raw[2][1]['實際花費']=null;
  const r=data.parseBudgetRows(table(raw[2]));
  assert.equal(data.budgetAggregate(r[0],'all').a,200);
  assert.equal(data.budgetAggregate(r[0],'all').partial,true);
  assert.equal(data.budgetAggregate(r[0],'lap').a,null);
});
test('anonymous HTML is data-free and JS has no persistent credential store',()=>{
  const html=fs.readFileSync(__dirname+'/index.html','utf8');
  assert.match(html,/<div id="sms-dashboard-web"[^>]+ hidden>/);
  assert.doesNotMatch(html,/實際花費\s*\d/);
  const js=fs.readFileSync(__dirname+'/dashboard.js','utf8');
  assert.doesNotMatch(js,/localStorage|sessionStorage|client_secret|GOCSPX/);
  assert.match(js,/cache:'no-store'/);
  new vm.Script(js);
});
test('Meta budget copy consistently means the monthly execution target',()=>{
  const html=fs.readFileSync(__dirname+'/index.html','utf8');
  const js=fs.readFileSync(__dirname+'/dashboard.js','utf8');
  assert.match(html,/Meta 預算＝每月執行目標/);
  assert.match(html,/<th>Meta 預算<\/th>/);
  assert.match(html,/實際花費 ÷ Meta 預算/);
  assert.doesNotMatch(html+js,/參考預算|PM 核定/);
  const rows=data.parseAll(ranges(fixtures())).metaRows;
  assert.equal(data.metaTotal(rows,'all').rate,400/480);
});
test('UI login, refresh, four panels, consumption filters and logout',async()=>{
  const elements=new Map(),intervals=[],tabs=[],panels=[];
  function el(id,tag='DIV',value='') {
    const e={id,tagName:tag,value,hidden:false,dataset:{},events:{},textContent:'',disabled:false,html:'',
      addEventListener(name,fn){this.events[name]=fn;},setAttribute(){},replaceChildren(){this.html='';this.textContent='';},
      get innerHTML(){return this.html;},set innerHTML(s){this.html=s;if(this.tagName==='SELECT'){this.value=(s.match(/value="(\d+)" selected/)||s.match(/value="(\d+)"/)||['',''])[1];}}
    };elements.set('#'+id,e);return e;
  }
  const root=el('sms-dashboard-web');root.hidden=true;
  const doc={hidden:false,getElementById:id=>elements.get('#'+id)||el(id)};
  root.querySelector=s=>elements.get(s)||el(s.slice(1));
  root.querySelectorAll=s=>s.includes('[id^=')?[...elements.values()].filter(e=>/^sms-(new|meta|budget|consumption)-|sms-store-progress/.test(e.id)):s.includes('sms-tab')?tabs:panels;
  for(const view of ['new','consumption','meta','budget']){const t=el('tab-'+view);t.dataset.view=view;tabs.push(t);const p=el('panel-'+view);p.dataset.panel=view;panels.push(p);}
  for(const [id,value] of [['new-mode','cumulative'],['new-store','all'],['new-month',''],['meta-store','all'],['meta-month',''],['budget-type','all'],['budget-month',''],['consumption-mode','cumulative'],['consumption-cohort','new'],['consumption-store','all'],['consumption-month','']]) el('sms-'+id,'SELECT',value);
  let oauth,reads=0,fetchGate=null,failNext=false,nextBudget=120;
  const google={accounts:{oauth2:{initTokenClient(opts){oauth=opts;return {requestAccessToken(){}};}}}};
  const window={SMSData:data,SMS_CONFIG:{sheetId:'synthetic',googleClientId:'synthetic'},google,setInterval:fn=>{intervals.push(fn);return intervals.length;},clearInterval(){},setTimeout(){return 1;},clearTimeout(){},addEventListener(){}};
  const fetch=async()=>{
    reads++;
    if(fetchGate) await fetchGate;
    if(failNext){failNext=false;throw new TypeError('Failed to fetch');}
    const raw=fixtures();raw[1].forEach(row=>row['Meta預算']=nextBudget);
    return {ok:true,json:async()=>({valueRanges:ranges(raw)})};
  };
  vm.runInNewContext(fs.readFileSync(__dirname+'/dashboard.js','utf8'),{window,document:doc,google,fetch,AbortSignal,Date,console});
  assert.equal(root.hidden,true);assert.equal(reads,0);
  intervals[0]();oauth.callback({access_token:'synthetic-token',expires_in:3600});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(root.hidden,false);assert.equal(reads,1);
  assert.match(elements.get('#sms-new-actual').html,/12</);
  assert.match(elements.get('#sms-new-total').html,/年度累積/);
  assert.match(elements.get('#sms-new-total').html,/12 \/ 40/);
  assert.equal(elements.get('#sms-new-rate-heading').textContent,'整體達成率');
  assert.match(elements.get('#sms-meta-cpa').html,/20</);
  assert.match(elements.get('#sms-meta-completeness').textContent,/每月執行目標/);
  assert.match(elements.get('#sms-budget-total').html,/7200</);
  tabs[1].events.click();
  assert.equal(panels[1].hidden,false);assert.equal(panels[0].hidden,true);
  assert.match(elements.get('#sms-consumption-amount').html,/1400</);
  elements.get('#sms-consumption-mode').value='monthly';elements.get('#sms-consumption-store').value='jc';elements.get('#sms-consumption-cohort').value='returning';
  elements.get('#sms-consumption-mode').events.change();
  assert.match(elements.get('#sms-consumption-amount').html,/50</);
  assert.equal(elements.get('#sms-consumption-rate').textContent,'100.0%');
  assert.doesNotMatch(elements.get('#sms-consumption-table').html,/2025\/12/);
  elements.get('#sms-new-mode').value='monthly';elements.get('#sms-new-store').value='ty';
  elements.get('#sms-new-mode').events.change();
  assert.match(elements.get('#sms-new-actual').html,/2</);
  assert.equal(elements.get('#sms-new-rate-heading').textContent,'桃園達成率');
  assert.match(elements.get('#sms-new-total').html,/年度累積/);
  let releaseFetch;
  fetchGate=new Promise(resolve=>{releaseFetch=resolve;});nextBudget=150;
  const refreshing=elements.get('#sms-refresh').events.click();
  assert.equal(reads,2);
  assert.equal(elements.get('#sms-refresh').disabled,true);
  assert.equal(elements.get('#sms-refresh').textContent,'更新中…');
  assert.match(elements.get('#sms-data-updated').textContent,/更新中/);
  await elements.get('#sms-refresh').events.click();assert.equal(reads,2);
  releaseFetch();await refreshing;fetchGate=null;
  assert.equal(elements.get('#sms-refresh').disabled,false);
  assert.equal(elements.get('#sms-refresh').textContent,'更新資料');
  assert.match(elements.get('#sms-data-updated').textContent,/更新完成.*\d+:\d+:\d+/);
  assert.match(elements.get('#sms-meta-table').html,/<td>300<\/td>/);
  assert.equal(elements.get('#sms-meta-rate').textContent,'66.7%');
  assert.match(elements.get('#sms-budget-total').html,/7200</);
  assert.equal(elements.get('#sms-new-mode').value,'monthly');
  assert.equal(elements.get('#sms-new-store').value,'ty');
  failNext=true;await elements.get('#sms-refresh').events.click();
  assert.equal(reads,3);assert.equal(root.hidden,true);
  assert.match(elements.get('#sms-auth-status').textContent,/更新失敗：無法連上 Google Sheet/);
  assert.equal(elements.get('#sms-refresh').disabled,false);
  assert.equal(elements.get('#sms-refresh').textContent,'更新資料');
  assert.equal(elements.get('#sms-consumption-amount').html,'');
  oauth.callback({access_token:'synthetic-token',expires_in:3600});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(root.hidden,false);assert.equal(reads,4);
  elements.get('#sms-signout').events.click();
  assert.equal(root.hidden,true);assert.equal(elements.get('#sms-new-actual').html,'');
  assert.equal(elements.get('#sms-consumption-amount').html,'');assert.equal(elements.get('#sms-consumption-total').html,'');
});

test('consumption is reconciled by month, cohort and store; weighted average uses arrivals',()=>{
  const raw=fixtures(),rows=data.parseConsumptionRows(table(raw[3]),table(raw[4]));
  assert.deepEqual(data.consumptionTotal(rows,'all','new'),{amount:1400,count:6,arrivals:12,average:1400/12,rate:0.5});
  assert.equal(data.consumptionTotal(rows,'ty','new').amount,200);
  assert.equal(data.consumptionTotal(rows,'all','all').amount,1450);
  assert.equal(data.consumptionTotal([rows[0]],'all','returning').average,null);
  assert.equal(data.consumptionTotal(rows,'ty','returning').amount,0);
  assert.equal(data.consumptionTotal([]).amount,null);
});

test('consumption rejects missing values, duplicates, missing cohorts and mismatched totals',()=>{
  const raw=fixtures(),parse=(a=raw[3],b=raw[4])=>data.parseConsumptionRows(table(a),table(b));
  assert.throws(()=>parse([...raw[3],raw[3][0]]),/重複/);
  assert.throws(()=>parse(raw[3],[...raw[4],raw[4][0]]),/重複/);
  assert.throws(()=>parse(raw[3],raw[4].slice(1)),/不一致/);
  assert.throws(()=>parse(raw[3].filter(r=>r['客群']==='新客')),/不符|不完整/);
  assert.throws(()=>parse(raw[3],raw[4].map((r,i)=>i===0?{...r,'消費金額':null}:r)),/缺少/);
  assert.throws(()=>parse(raw[3],raw[4].map((r,i)=>i===0?{...r,'統計基準':'依詢問日期'}:r)),/統計基準/);
});

test('actual new customers must equal new-customer arrivals',()=>{
  const raw=fixtures();
  raw[0][0]['實際新客']=1;
  assert.throws(()=>data.parseAll(ranges(raw)),/實際新客與新客到店數不一致/);
});

test('consumption accepts Sheet serial dates, excludes other fiscal years, and blocks truncation',()=>{
  const raw=fixtures();raw[3][0]['月份']=45992;raw[4][0]['月份']=45992;
  raw[3].push({...raw[3][0],'月份':'2025-11'});
  raw[4].push({...raw[4][0],'月份':'2025-11'});
  assert.equal(data.parseConsumptionRows(table(raw[3]),table(raw[4])).length,2);
  assert.throws(()=>data.parseConsumptionRows(table(raw[3]),Array(401).fill([])),/上限/);
});
