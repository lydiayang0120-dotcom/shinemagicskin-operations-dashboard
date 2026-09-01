(() => {
  'use strict';
  const root = document.getElementById('sms-dashboard-web');
  const {months,parseAll,metaTotal,budgetAggregate,consumptionTotal} = window.SMSData;
  const authWall=document.getElementById('sms-auth-wall'), authButton=document.getElementById('sms-auth-button'), authStatus=document.getElementById('sms-auth-status');
  const config=window.SMS_CONFIG||{};
  let newRows=[],metaRows=[],budgetRows=[],consumptionRows=[];
  let tokenClient=null,sessionToken=null,tokenExpires=0,expiryTimer=null,busy=false,requestVersion=0;
  const $=selector=>root.querySelector(selector);
  const fmt=n=>n===null?'待補':String(Math.round(n));
  const pct=n=>Number.isFinite(n)?(n*100).toFixed(1)+'%':'—';
  const unit=(value,suffix='')=>fmt(value)+'<span class="sms-unit">'+suffix+'</span>';
  const sum=(arr,fn)=>arr.reduce((total,item)=>total+(fn(item)||0),0);
  const stores=(row,store)=>store==='all'?[row.ty,row.jc]:[row[store]];
  const storeName=store=>store==='ty'?'桃園':store==='jc'?'江翠':'整體';
  const setAuthStatus=(message,error=false)=>{authStatus.textContent=message;authStatus.dataset.error=String(error);};
  function fillMonthSelect(select,available) {
    const previous=select.value,max=Math.max(...available);
    select.innerHTML=available.slice().sort((a,b)=>b-a).map(i=>'<option value="'+i+'"'+(i===max?' selected':'')+'>'+months[i]+'</option>').join('');
    if(previous!==''&&available.includes(Number(previous))) select.value=previous;
  }
  function signOut(message='已登出儀表板。') {
    requestVersion++;
    sessionToken=null;tokenExpires=0;
    window.clearTimeout(expiryTimer);
    newRows=[];metaRows=[];budgetRows=[];consumptionRows=[];
    root.hidden=true;authWall.hidden=false;
    // Remove financial data from the DOM, not just from the visible layout.
    root.querySelectorAll('[id^="sms-new-"],[id^="sms-meta-"],[id^="sms-budget-"],[id^="sms-consumption-"],#sms-store-progress').forEach(el=>{
      if(el.tagName!=='SELECT') el.replaceChildren();
      else if(el.id.endsWith('-month')) el.replaceChildren();
    });
    authButton.disabled=!tokenClient;
    setAuthStatus(message);
  }
  async function fetchSheetData(accessToken,version) {
    const ranges=['月度KPI!A1:Y100','Meta月度KPI!A1:T100','年度預算!A1:R100','月報總覽!A1:P40','分店消費!A1:P401'];
    const query=ranges.map(range=>'ranges='+encodeURIComponent(range)).join('&');
    const endpoint='https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(config.sheetId)+'/values:batchGet?'+query+'&majorDimension=ROWS&valueRenderOption=UNFORMATTED_VALUE';
    const response=await fetch(endpoint,{headers:{Authorization:'Bearer '+accessToken},cache:'no-store',signal:AbortSignal.timeout(20000)});
    if(!response.ok) {
      if(response.status===403) throw new Error('此 Google 帳號沒有讀取權限，或 Sheets API 尚未開通。');
      if(response.status===401) throw new Error('Google 登入已到期，請重新登入。');
      throw new Error('Google Sheets 讀取失敗 ('+response.status+')。');
    }
    const payload=await response.json(),next=parseAll(payload.valueRanges||[]);
    if(version!==requestVersion) return false;
    ({newRows,metaRows,budgetRows,consumptionRows}=next);
    return true;
  }
  function renderPrivateDashboard() {
    fillMonthSelect($('#sms-new-month'),newRows.map(row=>row.m));
    fillMonthSelect($('#sms-meta-month'),metaRows.map(row=>row.m));
    fillMonthSelect($('#sms-consumption-month'),consumptionRows.map(row=>row.m));
    fillMonthSelect($('#sms-budget-month'),budgetRows.filter(row=>row.meta.a!==null||row.lap.a!==null).map(row=>row.m));
    $('#sms-data-updated').textContent='更新完成 '+new Date().toLocaleTimeString('zh-TW',{hour:'2-digit',minute:'2-digit',second:'2-digit'})+'｜每 5 分鐘更新';
    updateNew();updateMeta();updateBudget();updateConsumption();
    authWall.hidden=true;root.hidden=false;
  }
  async function refreshData() {
    if(busy) return;
    if(!sessionToken||Date.now()>=tokenExpires){signOut('登入已到期，請重新登入。');return;}
    busy=true;
    const version=++requestVersion;
    $('#sms-refresh').disabled=true;authButton.disabled=true;
    $('#sms-refresh').textContent='更新中…';
    $('#sms-data-updated').textContent='更新中，正在讀取 Google Sheet…';
    setAuthStatus('正在讀取 Google Sheet…');
    try {
      if(await fetchSheetData(sessionToken,version)) renderPrivateDashboard();
    } catch(error) {
      if(version===requestVersion){
        const reason=error.name==='TimeoutError'?'Google Sheet 回應逾時，請稍後重新登入再試。':
          /Failed to fetch|NetworkError|Load failed/i.test(error.message)?'無法連上 Google Sheet，請確認網路後重新登入再試。':error.message;
        signOut();setAuthStatus('更新失敗：'+reason,true);
      }
    } finally {
      busy=false;$('#sms-refresh').disabled=false;$('#sms-refresh').textContent='更新資料';authButton.disabled=!tokenClient;
    }
  }
  function initializePrivateDashboard() {
    if(!config.sheetId||!config.googleClientId){setAuthStatus('尚未設定私人資料連線。',true);return;}
    const loadTimeout=window.setTimeout(()=>{
      window.clearInterval(waitForGoogle);
      if(!tokenClient) setAuthStatus('Google 登入元件載入失敗，請重新整理頁面。',true);
    },10000);
    const waitForGoogle=window.setInterval(()=>{
      if(!window.google?.accounts?.oauth2) return;
      window.clearInterval(waitForGoogle);window.clearTimeout(loadTimeout);
      tokenClient=google.accounts.oauth2.initTokenClient({
        client_id:config.googleClientId,
        scope:'https://www.googleapis.com/auth/spreadsheets.readonly',
        callback:response=>{
          if(response.error||!response.access_token){authButton.disabled=false;setAuthStatus('Google 授權未完成，請重新登入。',true);return;}
          sessionToken=response.access_token;
          tokenExpires=Date.now()+(Number(response.expires_in)||3600)*1000;
          window.clearTimeout(expiryTimer);
          expiryTimer=window.setTimeout(()=>signOut('登入已到期，請重新登入。'),tokenExpires-Date.now());
          refreshData();
        },
        error_callback:()=>{authButton.disabled=false;setAuthStatus('登入視窗未完成；請允許彈出視窗後再試。',true);}
      });
      authButton.disabled=false;setAuthStatus('請使用有權限的 Google 帳號登入。');
    },100);
    authButton.addEventListener('click',()=>{
      if(!tokenClient) return;
      setAuthStatus('請在 Google 授權視窗完成登入；若未出現，可再次按登入。');
      tokenClient.requestAccessToken({prompt:'select_account'});
    });
    $('#sms-refresh').addEventListener('click',refreshData);
    $('#sms-signout').addEventListener('click',()=>signOut());
    window.setInterval(()=>{if(sessionToken&&!document.hidden) refreshData();},300000);
    window.addEventListener('pagehide',()=>signOut());
  }
      function lineChart(seriesActual, seriesTarget, labels) {
        const w=680,h=285,left=52,right=18,top=24,bottom=44;
        const max=Math.max(...seriesActual,...seriesTarget,1)*1.12;
        const x=i=>left+(w-left-right)*(labels.length===1?.5:i/(labels.length-1));
        const y=v=>top+(h-top-bottom)*(1-v/max);
        const path=values=>values.map((v,i)=>`${x(i)},${y(v)}`).join(' ');
        const grid=[0,.25,.5,.75,1].map(k=>`<line class="sms-axis" x1="${left}" y1="${y(max*k)}" x2="${w-right}" y2="${y(max*k)}"></line><text class="sms-axis-text" x="${left-8}" y="${y(max*k)+4}" text-anchor="end">${fmt(max*k)}</text>`).join('');
        const xt=labels.map((label,i)=>`<text class="sms-axis-text" x="${x(i)}" y="${h-14}" text-anchor="middle">${label.replace('2025/','25/').replace('2026/','')}</text>`).join('');
        const dots=seriesActual.map((v,i)=>`<circle class="sms-dot-actual" cx="${x(i)}" cy="${y(v)}" r="5"><title>${labels[i]} 實績 ${fmt(v)}</title></circle>`).join('');
        const tdots=seriesTarget.map((v,i)=>`<circle class="sms-dot-target" cx="${x(i)}" cy="${y(v)}" r="4"><title>${labels[i]} 目標 ${fmt(v)}</title></circle>`).join('');
        return `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="新客實績與目標趨勢"><title>新客實績與目標趨勢</title>${grid}<polyline class="sms-line-target" points="${path(seriesTarget)}"></polyline><polyline class="sms-line-actual" points="${path(seriesActual)}"></polyline>${tdots}${dots}${xt}</svg>`;
      }

      function updateNew() {
        const mode=root.querySelector('#sms-new-mode').value;
        const store=root.querySelector('#sms-new-store').value;
        const cutoff=Number(root.querySelector('#sms-new-month').value);
        const rows=newRows.filter(r=>r.m<=cutoff);
        const active=mode==='monthly'?rows.filter(r=>r.m===cutoff):rows;
        const actual=sum(active,r=>sum(stores(r,store),s=>s.a));
        const target=sum(active,r=>sum(stores(r,store),s=>s.t));
        const diff=actual-target;
        root.querySelector('#sms-new-actual').innerHTML=unit(actual,'人');
        root.querySelector('#sms-new-target').innerHTML=unit(target,'人');
        root.querySelector('#sms-new-rate').innerHTML=`${target?pct(actual/target):'—'}`;
        root.querySelector('#sms-new-gap').innerHTML=unit(Math.abs(diff),'人');
        root.querySelector('#sms-new-gap-note').innerHTML=`<strong>${storeName(store)}${diff>=0?'超前':'落後'} ${fmt(Math.abs(diff))}</strong>`;
        root.querySelector('#sms-new-period').textContent=mode==='monthly'?months[cutoff]:`2025/12－${months[cutoff]}`;
        root.querySelector('#sms-new-target-note').textContent=mode==='monthly'?'單月目標':`已計入 ${rows.length} 個月份`;
        let runningA=0,runningT=0;
        const actualSeries=[],targetSeries=[];
        rows.forEach(r=>{const a=sum(stores(r,store),s=>s.a),t=sum(stores(r,store),s=>s.t); runningA+=a;runningT+=t;actualSeries.push(mode==='monthly'?a:runningA);targetSeries.push(mode==='monthly'?t:runningT);});
        root.querySelector('#sms-new-chart').innerHTML=lineChart(actualSeries,targetSeries,rows.map(r=>months[r.m]));
        root.querySelector('#sms-store-progress').innerHTML=['ty','jc'].map(code=>{const a=sum(rows,r=>r[code].a),t=sum(rows,r=>r[code].t),rate=t?a/t:0,d=a-t;return `<div class="sms-store"><div class="sms-store-title"><strong>${code==='ty'?'桃園愛美肌':'江翠愛美肌'}</strong><span>${pct(rate)}</span></div><div class="sms-track"><div class="sms-fill ${code==='jc'?'sage':''}" style="width:${Math.min(rate*100,100)}%"></div></div><div class="sms-store-meta"><span>${fmt(a)} / ${fmt(t)} 人</span><span class="${d>=0?'sms-status-good':'sms-status-warn'}">${d>=0?'超前':'落後'} ${fmt(Math.abs(d))}</span></div></div>`;}).join('');
        const tableCells=selection=>{
          const value=code=>({a:sum(selection,r=>r[code].a),t:sum(selection,r=>r[code].t)});
          const ty=value('ty'),jc=value('jc'),total={a:ty.a+jc.a,t:ty.t+jc.t},filtered=store==='all'?total:value(store);
          return `<td title="實績 ${fmt(ty.a)} / 目標 ${fmt(ty.t)}">${fmt(ty.a)} / ${fmt(ty.t)}</td><td title="實績 ${fmt(jc.a)} / 目標 ${fmt(jc.t)}">${fmt(jc.a)} / ${fmt(jc.t)}</td><td>${fmt(total.a)} / ${fmt(total.t)}</td><td class="${filtered.a>=filtered.t?'sms-status-good':'sms-status-warn'}">${filtered.t?pct(filtered.a/filtered.t):'—'}</td>`;
        };
        root.querySelector('#sms-new-table-label').textContent=`顯示至 ${months[cutoff]}`;
        root.querySelector('#sms-new-table').innerHTML=rows.slice().reverse().map(r=>`<tr data-current="${r.m===cutoff}"><td>${months[r.m]}</td>${tableCells([r])}</tr>`).join('');
        root.querySelector('#sms-new-total').innerHTML=`<tr><th>年度累積</th>${tableCells(rows)}</tr>`;
        root.querySelector('#sms-new-rate-heading').textContent=store==='all'?'整體達成率':`${storeName(store)}達成率`;
      }


  function updateConsumption() {
    const mode=$('#sms-consumption-mode').value,store=$('#sms-consumption-store').value,cohort=$('#sms-consumption-cohort').value;
    const cutoff=Number($('#sms-consumption-month').value),rows=consumptionRows.filter(r=>r.m<=cutoff);
    const active=mode==='monthly'?rows.filter(r=>r.m===cutoff):rows,total=consumptionTotal(active,store,cohort);
    const cohortName=cohort==='new'?'新客':cohort==='returning'?'舊客':'新客＋舊客';
    $('#sms-consumption-amount').innerHTML=unit(total.amount,'元');
    $('#sms-consumption-count').innerHTML=unit(total.count,'筆');
    $('#sms-consumption-average').innerHTML=total.average===null?'—':unit(total.average,'元');
    $('#sms-consumption-rate').textContent=pct(total.rate);
    $('#sms-consumption-arrivals').textContent='消費數 ÷ 到店數｜到店 '+fmt(total.arrivals)+' 筆';
    $('#sms-consumption-period').textContent=(mode==='monthly'?months[cutoff]:'2025/12－'+months[cutoff])+'｜'+storeName(store)+'｜'+cohortName;
    const max=Math.max(...rows.map(r=>consumptionTotal([r],store,cohort).amount),1);
    $('#sms-consumption-bars').innerHTML=rows.map(r=>{const v=consumptionTotal([r],store,cohort);return `<div class="sms-bar-row"><span>${months[r.m].slice(2)}</span><div class="sms-bar-track"><div class="sms-bar" style="width:${v.amount/max*100}%;min-width:0"></div></div><span class="sms-bar-value" title="${months[r.m]} ${fmt(v.amount)} 元">${fmt(v.amount)}</span></div>`;}).join('');
    const combined=consumptionTotal(active,'all',cohort).amount;
    $('#sms-consumption-stores').innerHTML=['ty','jc'].map(code=>{const v=consumptionTotal(active,code,cohort),share=combined>0?v.amount/combined:null;return `<div class="sms-store"><div class="sms-store-title"><strong>${storeName(code)}愛美肌</strong><span>${pct(share)}</span></div><div class="sms-track"><div class="sms-fill ${code==='jc'?'sage':''}" style="width:${(share||0)*100}%"></div></div><div class="sms-store-meta"><span>${fmt(v.amount)} 元</span><span>消費 ${fmt(v.count)} 筆</span></div></div>`;}).join('');
    const cells=v=>`<td>${fmt(v.amount)}</td><td>${fmt(v.count)}</td><td>${fmt(v.arrivals)}</td><td>${v.average===null?'—':fmt(v.average)}</td><td>${pct(v.rate)}</td>`;
    $('#sms-consumption-table-label').textContent=storeName(store)+'｜'+cohortName;
    $('#sms-consumption-table').innerHTML=active.slice().reverse().map(r=>`<tr data-current="${r.m===cutoff}"><td>${months[r.m]}</td>${cells(consumptionTotal([r],store,cohort))}</tr>`).join('');
    $('#sms-consumption-total').innerHTML=`<tr><th>${mode==='monthly'?'單月合計':'年度累積'}</th>${cells(total)}</tr>`;
  }
  function updateMeta() {
    const store=$('#sms-meta-store').value,cutoff=Number($('#sms-meta-month').value);
    const rows=metaRows.filter(r=>r.m<=cutoff),total=metaTotal(rows,store);
    $('#sms-meta-spend').innerHTML=unit(total.s,'元');
    $('#sms-meta-inquiries').innerHTML=unit(total.q,'筆');
    $('#sms-meta-cpa').innerHTML=total.cpa===null?'—':unit(total.cpa,'元');
    $('#sms-meta-rate').textContent=total.rate===null?'—':pct(total.rate);
    $('#sms-meta-period').textContent='2025/12－'+months[cutoff]+'｜'+storeName(store)+'｜'+total.status;
    const partial=rows.filter(r=>metaTotal([r],store).status!=='已確認').map(r=>months[r.m]);
    $('#sms-meta-completeness').textContent=partial.length?'部分資料或待補月份：'+partial.join('、')+'。卡片與 CPA 僅依已取得數據計算；預算執行率只計花費與預算皆有值的項目。':'所選期間與分店資料已確認。Meta 預算為每月執行目標。';
    const max=Math.max(...rows.map(r=>metaTotal([r],store).s||0),1);
    $('#sms-meta-bars').innerHTML=rows.map(r=>{const v=metaTotal([r],store);return '<div class="sms-bar-row"><span>'+months[r.m].slice(5)+'</span><div class="sms-bar-track"><div class="sms-bar" style="width:'+((v.s||0)/max*100)+'%;min-width:0"></div></div><span class="sms-bar-value" title="'+v.status+'">'+fmt(v.s)+'</span></div>';}).join('');
    $('#sms-meta-table').innerHTML=rows.map(r=>{const v=metaTotal([r],store);return '<tr data-current="'+(r.m===cutoff)+'"><td>'+months[r.m]+'</td><td>'+fmt(v.s)+'</td><td>'+fmt(v.q)+'</td><td>'+(v.cpa===null?'—':fmt(v.cpa))+'</td><td>'+fmt(v.b)+'</td><td>'+(v.rate===null?'—':pct(v.rate))+'</td><td class="'+(v.status==='已確認'?'sms-status-good':'sms-status-warn')+'">'+v.status+'</td></tr>';}).reverse().join('');
  }
  function updateBudget() {
    const type=$('#sms-budget-type').value,cutoff=Number($('#sms-budget-month').value);
    const selected=budgetRows.filter(r=>r.m<=cutoff);
    const annual=sum(budgetRows,r=>budgetAggregate(r,type).b),actual=sum(selected,r=>budgetAggregate(r,type).a||0),remaining=annual-actual;
    $('#sms-budget-total').innerHTML=unit(annual,'元');
    $('#sms-budget-actual').innerHTML=unit(actual,'元');
    $('#sms-budget-remaining').innerHTML=remaining>=0?unit(remaining,'元'):'超支 '+unit(-remaining,'元');
    $('#sms-budget-rate').textContent=annual?pct(actual/annual):'—';
    const partial=selected.some(r=>budgetAggregate(r,type).partial);
    $('#sms-budget-period').textContent='2025/12－'+months[cutoff]+(partial?'｜含部分資料，未全數確認':'');
    const periodBudget=sum(selected,r=>budgetAggregate(r,type).b);
    $('#sms-budget-callout').textContent='截至 '+months[cutoff]+' 的排定預算為 '+fmt(periodBudget)+' 元；已取得花費占期間預算 '+(periodBudget?pct(actual/periodBudget):'無法計算')+'。'+(partial?'尚有部分或未補花費，執行率與剩餘預算皆非最終結果。':'');
    const max=Math.max(...budgetRows.flatMap(r=>{const v=budgetAggregate(r,type);return [v.b,r.m<=cutoff?(v.a||0):0];}),1);
    $('#sms-budget-bars').innerHTML=budgetRows.map(r=>{const v=budgetAggregate(r,type),a=r.m<=cutoff?v.a:null;return '<div class="sms-bar-row"><span>'+months[r.m].slice(5)+'</span><div><div class="sms-bar-track"><div class="sms-bar" style="width:'+(v.b/max*100)+'%;min-width:0"></div></div><div class="sms-bar-track" style="margin-top:4px"><div class="sms-bar sage" style="width:'+((a||0)/max*100)+'%;min-width:0"></div></div></div><span class="sms-bar-value">'+(r.m>cutoff?'未納入':fmt(a))+'</span></div>';}).join('');
    $('#sms-budget-table').innerHTML=budgetRows.map(r=>{const v=budgetAggregate(r,type),a=r.m<=cutoff?v.a:null,rate=a===null||!v.b?null:a/v.b,diff=a===null?null:v.b-a;return '<tr data-current="'+(r.m===cutoff)+'"><td>'+months[r.m]+'</td><td>'+fmt(v.b)+'</td><td>'+(a===null?'—':fmt(a))+'</td><td>'+(rate===null?'—':pct(rate))+'</td><td class="'+(diff!==null&&diff<0?'sms-status-warn':'')+'">'+(diff===null?'—':diff>=0?'剩餘 '+fmt(diff):'超支 '+fmt(-diff))+'</td><td>'+(r.m>cutoff?'未納入':a===null?'待補':v.partial?'部分資料':'已填')+'</td></tr>';}).join('');
  }
  root.querySelectorAll('.sms-tab[data-view]').forEach(button=>button.addEventListener('click',()=>{
    root.querySelectorAll('.sms-tab[data-view]').forEach(b=>b.setAttribute('aria-selected',String(b===button)));
    root.querySelectorAll('.sms-view').forEach(panel=>panel.hidden=panel.dataset.panel!==button.dataset.view);
  }));
  ['#sms-new-mode','#sms-new-store','#sms-new-month'].forEach(s=>$(s).addEventListener('change',updateNew));
  ['#sms-consumption-mode','#sms-consumption-store','#sms-consumption-month','#sms-consumption-cohort'].forEach(s=>$(s).addEventListener('change',updateConsumption));
  ['#sms-meta-store','#sms-meta-month'].forEach(s=>$(s).addEventListener('change',updateMeta));
  ['#sms-budget-type','#sms-budget-month'].forEach(s=>$(s).addEventListener('change',updateBudget));
  initializePrivateDashboard();
})();
