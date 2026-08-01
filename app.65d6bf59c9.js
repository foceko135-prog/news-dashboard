// 相場の履歴系列は market.json に分離し、ティッカーを開いた時にだけ取得する。
// (内包していた頃は gzip後175KB＝転送量の55%を、グラフを開かない利用でも毎回配信していた)
var MHIST=null, mhistLoading=null;
function ensureMhist(){
  if(MHIST)return Promise.resolve(MHIST);
  if(mhistLoading)return mhistLoading;
  mhistLoading=fetch('market.json').then(function(r){
    if(!r.ok)throw new Error('http '+r.status);
    return r.json();
  }).then(function(j){
    MHIST=j; mhistLoading=null; return j;
  }).catch(function(e){
    mhistLoading=null; throw e;   // 次回タップで再試行できるように握り潰さない
  });
  return mhistLoading;
}
function gistFor(names){
  // names="日銀会合/米FOMC"のように複数名が"/"で結合されている場合、各要因を「・」で繋げて返す
  return names.split('/').map(function(n){return EVGIST[n]||'';}).filter(Boolean).join('／');
}
function analogyFor(names){
  // 経済指標の例え話。gistForと同様に複数名("/"結合)にも対応する
  return names.split('/').map(function(n){return (EVANALOGY&&EVANALOGY[n])||'';}).filter(Boolean).join('／');
}
// 経済イベント: カードは名前・日程のみ。タップで下の共通詳細パネル1枠に切り替え表示する
// (複数同時展開はしない。別カードをタップすると表示が入れ替わる)。
var evOpenIdx=-1;
function renderEventDetail(i){
  var el=document.getElementById('eventDetail');
  var e=EVDETAIL[i];
  if(!e){el.classList.remove('open');return;}
  var lines=[];
  if(e.days===0&&e.time)lines.push('<div class="ev-line"><b>🕐 発表・開催</b>'+e.time+'</div>');
  if(e.what)lines.push('<div class="ev-line"><b>📌 これは何か</b>'+e.what+'</div>');
  if(e.now)lines.push('<div class="ev-line"><b>📊 現状・直近実績</b>'+e.now+'</div>');
  if(e.prev){
    var psign=e.prev.chg>=0?'+':'';
    var pdir=e.prev.chg>=0
      ?'円安方向に振れました。輸入品やエネルギー価格には上昇圧力がかかりやすい局面でした。'
      :'円高方向に振れました。輸入品やエネルギー価格は落ち着きやすい局面でした。';
    lines.push('<div class="ev-line"><b>📈 前回の結果</b>'+e.prev.date+'の発表時、ドル円は'
      +psign+e.prev.chg.toFixed(2)+'%動き、'+pdir+'</div>');
  }
  if(e.watch)lines.push('<div class="ev-line"><b>👀 注目点</b>'+e.watch+'</div>');
  if(e.japan)lines.push('<div class="ev-line"><b>🇯🇵 日本への影響</b>'+e.japan+'</div>');
  if(e.life)lines.push('<div class="ev-line"><b>💰 暮らしへの影響</b>'+e.life+'</div>');
  var mark=e.days===0?'🔴 ':(e.days<=3?'🟡 ':'');
  var html='<div class="ev-dh">'+mark+e.name+'</div>'
    +'<div class="ev-dwhen">'+e.when+'・'+e.date+'</div>'
    +lines.join('')
    +'<a class="ev-src" href="'+e.url+'" target="_blank" rel="noopener">公式情報を見る →</a>';
  el.innerHTML=html;
  el.classList.add('open');
}
document.getElementById('events').addEventListener('click',function(ev){
  var c=ev.target.closest('.evcard'); if(!c||!c.dataset.i)return;
  var i=parseInt(c.dataset.i,10);
  var cards=document.querySelectorAll('#events .evcard');
  if(evOpenIdx===i){
    evOpenIdx=-1;
    document.getElementById('eventDetail').classList.remove('open');
    cards.forEach(function(x){x.classList.remove('on');});
    return;
  }
  evOpenIdx=i;
  cards.forEach(function(x){x.classList.toggle('on',x===c);});
  renderEventDetail(i);
  document.getElementById('eventDetail').scrollIntoView({behavior:'smooth',block:'nearest'});
});
// 為替・株価ティッカー: タップした銘柄のグラフを下に展開。
// 期間(1か月/半年/1年)切替・Y軸(価格)/X軸(日付)ラベル・経済イベント日と重なる値動きのマーカー表示に対応。
var tickDetailOpenIdx=-1;
var RANGE_DAYS={'1mo':31,'6mo':186,'1y':366,'3y':1096,'5y':1827,'10y':3653};
var RANGE_LABEL={'1mo':'直近1か月','6mo':'直近半年','1y':'直近1年','3y':'直近3年','5y':'直近5年','10y':'直近10年','all':'全期間'};

function sliceByRange(ts,hist,range){
  if(!ts||!ts.length)return {ts:[],hist:[]};
  var cutoff=ts[ts.length-1]-RANGE_DAYS[range]*86400;
  var oi=[],oh=[];
  for(var i=0;i<ts.length;i++){ if(ts[i]>=cutoff){oi.push(ts[i]);oh.push(hist[i]);} }
  return {ts:oi,hist:oh};
}
function fmtMD(sec){
  var d=new Date(sec*1000);
  return (d.getMonth()+1)+'/'+d.getDate();
}
// EVMARKの日付文字列(YYYY-MM-DD・日本時間)をUNIX秒に変換してキャッシュ
var evMarkSecCache=null;
function evMarkSeconds(){
  if(evMarkSecCache)return evMarkSecCache;
  evMarkSecCache=EVMARK.map(function(e){
    return {name:e.name, date:e.date, sec:new Date(e.date+'T00:00:00+09:00').getTime()/1000};
  });
  return evMarkSecCache;
}
var histRangeCache=null;
function histRanges(){
  if(histRangeCache)return histRangeCache;
  histRangeCache=HISTEVENTS.map(function(h){
    return {name:h.name, desc:h.desc, sentiment:h.sentiment, life:h.life, analogy:h.analogy,
      s:new Date(h.start+'T00:00:00+09:00').getTime()/1000,
      e:new Date(h.end+'T23:59:59+09:00').getTime()/1000};
  });
  return histRangeCache;
}
function avgAbsDiff(hist){
  var diffs=[];
  for(var i=1;i<hist.length;i++)diffs.push(Math.abs((hist[i]-hist[i-1])/hist[i-1]));
  return diffs.length?diffs.reduce(function(a,b){return a+b;},0)/diffs.length:0;
}
// 指定インデックスi周辺±half点の平均|日次変動率|(局所ボラティリティ)。
// findMarksの閾値を「表示中の期間の平均」ではなくこの局所平均に置くことで、閾値を表示期間に
// 依存させない(期間を広げても最新側のマーカーが平均押し上げで閾値割れして消える現象を防ぐ)。
var LOCAL_HALF=20; // ≈1ヶ月の営業日。この範囲の局所ボラで各点を評価する
function avgAbsDiffLocal(hist,i,half){
  var lo=Math.max(1,i-half),hi=Math.min(hist.length-1,i+half);
  var sum=0,cnt=0;
  for(var j=lo;j<=hi;j++){sum+=Math.abs((hist[j]-hist[j-1])/hist[j-1]);cnt++;}
  return cnt?sum/cnt:0;
}
// 表示中の期間内で、データ点の前区間(ts[i-1]〜ts[i])に「経済指標の発表日」または「歴史的出来事の
// 期間」が重なり、かつ値動きが大きい点を「注目の値動き」の目安としてマーカー化する
// (このイベント/出来事が原因と断定するものではなく、あくまで重なった値動きの目安)。
// 区間ベースにしているのは、「全期間」表示のようにYahoo Finance側の仕様で1点が数週間〜1か月分に
// なる粗いデータでも取りこぼさないため。
// 経済指標(econ・単日イベント)は「その表示期間全体の平均変動幅」に対する相対評価で判定する。
// skipThreshold=true(全期間表示時)はこの閾値判定を外す(月次相当の粗いデータだと変動が閾値を
// 超えずマーカーがほぼ立たなくなるため)。
// 歴史的出来事(hist)は数年に及ぶ期間を持つものが多く、単純な閾値判定だと期間内の多くの区間が
// 該当してしまいマーカーだらけになる。そのため、閾値通過をいったん候補とした上で、同じ出来事名の
// 中で「その表示期間内で実際に一番大きく動いた上位2点」だけに絞り込み、「特に影響が大きかった
// ポイント」に限定して表示する。
function findMarks(ts,hist,skipThreshold){
  if(hist.length<3)return [];
  // skipThreshold=true(全期間の粗いデータ)のみ従来通り期間全体平均で判定。それ以外は各点の
  // 局所ボラ(avgAbsDiffLocal)で判定し、表示期間に依存しない基準にする。canonMarks経由でフル
  // 系列に対して呼ぶ前提なので、これで1ヶ月でも半年でも同一点は同じ判定になり消えなくなる。
  var globalThr=avgAbsDiff(hist)*1.6;
  var evs=evMarkSeconds(), hists=histRanges();
  var econItems=[]; // {idx,chg,name}
  var histCand=[]; // {idx,chg,name,desc,sentiment}
  // 経済指標(econ)は「発表日そのものの区間」だけでなく、発表日と翌営業日のうち変動が大きい方へ
  // スナップして判定する。米指標は日本時間21:30発表のため反応が翌日の終値に出やすく、発表日
  // ちょうどだけ見ると取りこぼす(例: 雇用統計7/2は当日ほぼ動かず翌7/3に大きく動く)。反応は発表日
  // 以降にしか出ないので前日は含めない(前日を含めると発表前の値動きを誤って紐付けてしまう)。
  function chgAt(i){return (hist[i]-hist[i-1])/hist[i-1];}
  evs.forEach(function(e){
    var base=-1;
    for(var i=1;i<ts.length;i++){ if(e.sec>ts[i-1]&&e.sec<=ts[i]){base=i;break;} }
    if(base<0)return;
    var best=base,bestAbs=Math.abs(chgAt(base));
    if(base+1<ts.length){var a=Math.abs(chgAt(base+1)); if(a>bestAbs){bestAbs=a;best=base+1;}}
    var bchg=chgAt(best);
    var thr=skipThreshold?globalThr:(avgAbsDiffLocal(hist,best,LOCAL_HALF)*1.6);
    if(skipThreshold||(bestAbs>=thr&&bestAbs>0.001))econItems.push({idx:best,chg:bchg,name:e.name,edate:e.date});
  });
  // 歴史的出来事(hist)は期間を持つため従来通り各区間で閾値判定し、同名top3に絞る(下流で実施)。
  for(var i=1;i<ts.length;i++){
    var lo=ts[i-1],hi=ts[i];
    var chg=chgAt(i);
    var threshold=skipThreshold?globalThr:(avgAbsDiffLocal(hist,i,LOCAL_HALF)*1.6);
    var passThreshold=Math.abs(chg)>=threshold&&Math.abs(chg)>0.001;
    if(passThreshold){
      var histHits=hists.filter(function(h){return h.s<=hi&&h.e>=lo;});
      histHits.forEach(function(h){histCand.push({idx:i,chg:chg,name:h.name,desc:h.desc,sentiment:h.sentiment,life:h.life,analogy:h.analogy});});
    }
  }
  var byName={};
  histCand.forEach(function(c){(byName[c.name]=byName[c.name]||[]).push(c);});
  var histItems=[];
  Object.keys(byName).forEach(function(name){
    var top=byName[name].slice().sort(function(a,b){return Math.abs(b.chg)-Math.abs(a.chg);}).slice(0,3);
    histItems=histItems.concat(top);
  });
  var byIdx={};
  econItems.forEach(function(e){
    byIdx[e.idx]=byIdx[e.idx]||{idx:e.idx,chg:e.chg,items:[]};
    byIdx[e.idx].items.push({type:'econ',name:e.name,edate:e.edate});
  });
  histItems.forEach(function(h){
    byIdx[h.idx]=byIdx[h.idx]||{idx:h.idx,chg:h.chg,items:[]};
    byIdx[h.idx].items.push({type:'hist',name:h.name,desc:h.desc,sentiment:h.sentiment,life:h.life,analogy:h.analogy});
  });
  var out=Object.keys(byIdx).map(function(k){return byIdx[k];});
  out.sort(function(a,b){return a.idx-b.idx;});
  return out;
}
// マーカーはフル日次系列(m.ts/m.hist)で一度だけ算出してキャッシュする。表示中の窓ではなく常に
// フル系列に対してfindMarksを呼ぶことで、どの期間・ズームでも「同じマーカー集合の部分集合」が
// 出るようになり、期間を広げた時に最新側のマーカーが消えなくなる(idxはフル系列m.ts基準)。
function canonMarks(m){
  if(!m.__canonMarks)m.__canonMarks=findMarks(m.ts||[],m.hist||[],false);
  return m.__canonMarks;
}
// フル系列基準のマーカーを、実際に描画する連続スライスdrawnTs(=m.tsの部分列)のインデックスへ
// 載せ替える。drawnTs先頭の時刻でオフセットを求め、窓内(0..len-1)に入るものだけidxを振り直して返す。
function marksForSlice(m,drawnTs){
  if(!drawnTs||!drawnTs.length)return [];
  var mts=m.ts||[],off=0,t0=drawnTs[0];
  for(var k=0;k<mts.length;k++){if(mts[k]===t0){off=k;break;}}
  var len=drawnTs.length,out=[];
  canonMarks(m).forEach(function(mk){
    var ni=mk.idx-off;
    if(ni>=0&&ni<len){var c={};for(var key in mk)c[key]=mk[key];c.idx=ni;out.push(c);}
  });
  return out;
}
function markColor(m){
  var h=m.items.filter(function(x){return x.type==='hist';})[0];
  if(h)return h.sentiment==='pos'?'#38bdf8':'#ef4444';
  return '#fbbf24';
}
// 一覧(td-evline)の背景をマーカー本体(グラフ上の点)と同じ色系統で塗るための、
// 薄く透過させた背景色とアクセント色。マーカーの色=markColor(m)をそのまま流用する。
function markBgStyle(m){
  var c=markColor(m);
  var rgb=c==='#38bdf8'?'56,189,248':(c==='#ef4444'?'239,68,68':'234,179,8');
  return 'background:rgba('+rgb+',0.16);border-left-color:'+c;
}
// マーカー1件分の表示行(readout/一覧の両方で共通利用)。実際にこの銘柄がその区間でどれだけ動いたか
// (chg=結果)、一般的にどう影響しうるか(gist/desc=考察)、暮らしへの影響(life)、例え話(analogy)を
// 出来事ごとに1ブロックとして並べる。マーカー1件分の内容を「項目：値」の表形式の行データに組み立てる。
// 以前は絵文字付きの流れる文章だったが、視認性のため表(td-tbl)で表示する。1つのマーカーに複数の
// 出来事が重なる場合、以前は「暮らし」「例え話」を全出来事共通で末尾にまとめていたが、どの出来事の
// 話か分かりづらいとの指摘(2026-07-22)を受け、各出来事のブロック内(内容の直後)に個別に出す形へ変更。
function markRows(m){
  var sign=m.chg>=0?'+':'';
  var rows=[];
  m.items.forEach(function(it){
    if(it.type==='econ'){
      rows.push({label:'指標', cls:'td-tv-ev', value:'🟡 '+it.name});
      rows.push({label:'結果', cls:m.chg>=0?'td-tv-pos':'td-tv-neg', value:sign+(m.chg*100).toFixed(2)+'%'});
      var er=(EVRESULT[it.name]||{})[it.edate];
      var life=null, ea=null;
      if(er&&er.result){
        rows.push({label:'内容', cls:'td-tv-gist', value:er.result});
        life=er.life;
        ea=er.analogy; // その回の実際の結果に対する例え話(未発表回はerが無いため一般論にフォールバック)
      }else{
        var g=gistFor(it.name);
        if(g)rows.push({label:'内容', cls:'td-tv-gist', value:g});
      }
      if(life)rows.push({label:'暮らし', cls:'td-tv-life', value:life});
      if(!ea)ea=analogyFor(it.name);
      if(ea)rows.push({label:'例え話', cls:'td-tv-ana', value:'💡 '+ea});
    }else{
      var mark=it.sentiment==='pos'?'🔵':'🔴';
      var cls=it.sentiment==='pos'?'td-tv-hpos':'td-tv-hneg';
      rows.push({label:'出来事', cls:cls, value:mark+' '+it.name});
      rows.push({label:'結果', cls:cls, value:sign+(m.chg*100).toFixed(2)+'%'});
      rows.push({label:'内容', cls:'td-tv-gist', value:it.desc});
      if(it.life)rows.push({label:'暮らし', cls:'td-tv-life', value:it.life});
      if(it.analogy)rows.push({label:'例え話', cls:'td-tv-ana', value:'💡 '+it.analogy});
    }
  });
  return rows;
}
function markTableHtml(m){
  var html='<table class="td-tbl">';
  markRows(m).forEach(function(r){
    html+='<tr><th>'+r.label+'</th><td class="'+r.cls+'">'+r.value+'</td></tr>';
  });
  html+='</table>';
  return html;
}
var chartState=null; // タップ読み取り用: 直近描画したグラフの座標変換パラメータ
function sparkSvg(ts,hist,marks){
  if(!hist||hist.length<2)return '';
  var w=320,h=110,padL=34,padR=6,padT=8,padB=18;
  var min=Math.min.apply(null,hist),max=Math.max.apply(null,hist);
  var range=(max-min)||1;
  var stepX=hist.length>1?(w-padL-padR)/(hist.length-1):0;
  function X(i){return padL+i*stepX;}
  function Y(v){return padT+(h-padT-padB)*(1-(v-min)/range);}
  var pts=hist.map(function(v,i){return X(i).toFixed(1)+','+Y(v).toFixed(1);});
  var up=hist[hist.length-1]>=hist[0];
  var color=up?'#34d399':'#f87171';
  var path='M'+pts.join(' L');
  var areaPath=path+' L'+X(hist.length-1).toFixed(1)+','+(h-padB)+' L'+padL+','+(h-padB)+' Z';
  var svg='<svg viewBox="0 0 '+w+' '+h+'" preserveAspectRatio="none" id="tdSvg">';
  [max,(max+min)/2,min].forEach(function(v){
    var y=Y(v);
    svg+='<line x1="'+padL+'" y1="'+y.toFixed(1)+'" x2="'+(w-padR)+'" y2="'+y.toFixed(1)+'" stroke="#223049" stroke-width="1" stroke-dasharray="2,2"></line>';
    svg+='<text x="2" y="'+(y+3).toFixed(1)+'" font-size="8" fill="#7c8aa5">'+v.toLocaleString(undefined,{maximumFractionDigits:v>=1000?0:2})+'</text>';
  });
  svg+='<path d="'+areaPath+'" fill="'+color+'" opacity="0.12"></path>';
  svg+='<path d="'+path+'" fill="none" stroke="'+color+'" stroke-width="2" vector-effect="non-scaling-stroke"></path>';
  marks.forEach(function(mk){
    svg+='<circle id="evmk-'+mk.idx+'" cx="'+X(mk.idx).toFixed(1)+'" cy="'+Y(hist[mk.idx]).toFixed(1)+'" r="4" fill="'+markColor(mk)+'" stroke="#0b1220" stroke-width="1"></circle>';
  });
  var n=hist.length-1;
  [0,0.25,0.5,0.75,1].forEach(function(f){
    var li=Math.round(n*f);
    svg+='<text x="'+X(li).toFixed(1)+'" y="'+(h-4)+'" font-size="8" fill="#7c8aa5" text-anchor="'+(f===0?'start':(f===1?'end':'middle'))+'">'+fmtMD(ts[li])+'</text>';
  });
  // タップ位置の読み取り用カーソル(初期は非表示。showReadoutで座標更新して表示)
  svg+='<g id="tdCursor" style="display:none">'
    +'<line id="tdCurLine" x1="0" y1="'+padT+'" x2="0" y2="'+(h-padB)+'" stroke="#7dd3c0" stroke-width="1" stroke-dasharray="2,2"></line>'
    +'<circle id="tdCurDot" r="4" fill="#7dd3c0" stroke="#0b1220" stroke-width="1.2"></circle>'
    +'</g>';
  svg+='</svg>';
  chartState={ts:ts,hist:hist,marks:marks,padL:padL,padT:padT,padB:padB,w:w,h:h,min:min,max:max,stepX:stepX,color:color};
  return svg;
}
// グラフをタップ/クリックした位置から最寄りの日付・数値を出す。イベントマーカーと重なっていればイベント名も表示。
var curReadoutIdx=null;
function stepReadout(delta){
  if(!chartState)return;
  var base=(curReadoutIdx===null)?chartState.hist.length-1:curReadoutIdx;
  showReadout(base+delta);
}
// マーカーだけを順番に飛び歩く「前/次」。日付を1つずつ辿るstepReadoutと違い、
// 表示中のマーカー一覧(idx昇順)だけを対象に前後移動する(末尾/先頭は反対側へ循環)。
function stepMarker(delta){
  if(!chartState||!chartState.marks.length)return;
  var marks=chartState.marks.slice().sort(function(a,b){return a.idx-b.idx;});
  if(curReadoutIdx===null){
    showReadout(delta>0?marks[0].idx:marks[marks.length-1].idx);
    return;
  }
  if(delta>0){
    var next=marks.filter(function(m){return m.idx>curReadoutIdx;})[0];
    showReadout(next?next.idx:marks[0].idx);
  }else{
    var prevList=marks.filter(function(m){return m.idx<curReadoutIdx;});
    var prev=prevList[prevList.length-1];
    showReadout(prev?prev.idx:marks[marks.length-1].idx);
  }
}
function showReadout(idx){
  var cs=chartState; if(!cs)return;
  idx=Math.max(0,Math.min(cs.hist.length-1,idx));
  // マーカーは前後2点以内のタップなら最寄りのものにスナップする(正確に1点をピンポイントで
  // 狙わなくても反応するよう、タップ判定の許容範囲を広げるため)。
  var TAP_SNAP_TOL=2;
  var mk=null,mkDist=Infinity;
  cs.marks.forEach(function(m){
    var d=Math.abs(m.idx-idx);
    if(d<=TAP_SNAP_TOL&&d<mkDist){mk=m;mkDist=d;}
  });
  if(mk)idx=mk.idx;
  curReadoutIdx=idx;
  var v=cs.hist[idx], t=cs.ts[idx];
  // マーカーを一旦すべて本来の色・標準サイズに戻す
  cs.marks.forEach(function(m){
    var el=document.getElementById('evmk-'+m.idx);
    if(el){el.setAttribute('fill',markColor(m)); el.setAttribute('r','4');}
  });
  var cur=document.getElementById('tdCursor');
  if(mk){
    // マーカーと重なる位置: 新たにカーソル点は出さず、該当マーカーをグラフの色に変えて最前面へ
    if(cur)cur.style.display='none';
    var mkEl=document.getElementById('evmk-'+idx);
    if(mkEl){
      mkEl.setAttribute('fill',cs.color);
      mkEl.setAttribute('r','5.5');
      mkEl.parentNode.appendChild(mkEl);
    }
  }else{
    var x=cs.padL+idx*cs.stepX;
    var range=(cs.max-cs.min)||1;
    var y=cs.padT+(cs.h-cs.padT-cs.padB)*(1-(v-cs.min)/range);
    if(cur){
      cur.style.display='';
      document.getElementById('tdCurLine').setAttribute('x1',x.toFixed(1));
      document.getElementById('tdCurLine').setAttribute('x2',x.toFixed(1));
      var dot=document.getElementById('tdCurDot');
      dot.setAttribute('cx',x.toFixed(1)); dot.setAttribute('cy',y.toFixed(1));
    }
  }
  var d=new Date(t*1000);
  var dateStr=d.getFullYear()+'/'+(d.getMonth()+1)+'/'+d.getDate();
  var wd='日月火水木金土'[d.getDay()];
  var html='<div class="td-readout">📅 '+dateStr+'('+wd+')　<b>'+v.toLocaleString(undefined,{maximumFractionDigits:v>=1000?0:2})+'</b></div>';
  if(mk)html+=markTableHtml(mk);
  document.getElementById('tdReadout').innerHTML=html;
  renderEvNote(); // 選択したマーカーは下の一覧から除外し、重複表示をなくす
}
// ピンチズーム: グラフを開いた時点のtsMax/histMax(またはsliceByRangeでの範囲)をzoomBaseに保持し、
// ピンチ操作の拡大率(zoomScale)・中心位置(zoomCenterFrac、0〜1)に応じてその範囲を切り出して
// 再描画する。dblclick/ダブルタップで元の表示(zoomScale=1)に戻す。
var zoomBaseTs=null,zoomBaseHist=null,zoomScale=1,zoomCenterFrac=0.5;
function pinchDist(t1,t2){
  var dx=t1.clientX-t2.clientX,dy=t1.clientY-t2.clientY;
  return Math.sqrt(dx*dx+dy*dy);
}
function zoomedSlice(){
  if(!zoomBaseTs||!zoomBaseTs.length)return {ts:[],hist:[]};
  var n=zoomBaseTs.length;
  if(zoomScale<=1)return {ts:zoomBaseTs,hist:zoomBaseHist};
  var width=Math.max(5,Math.round(n/zoomScale));
  var centerIdx=Math.round(zoomCenterFrac*(n-1));
  var i0=Math.max(0,centerIdx-Math.round(width/2));
  var i1=Math.min(n,i0+width);
  i0=Math.max(0,i1-width);
  return {ts:zoomBaseTs.slice(i0,i1),hist:zoomBaseHist.slice(i0,i1)};
}
function redrawZoomed(){
  var s=zoomedSlice();
  var marks=filterMarks(curTdRange==='all'?findMarks(s.ts,s.hist,zoomScale<=1):marksForSlice(curTdM,s.ts));
  curReadoutIdx=null;
  document.getElementById('tdChart').innerHTML=sparkSvg(s.ts,s.hist,marks);
  document.getElementById('tdReadout').innerHTML=zoomScale>1
    ?'<div class="td-readout td-readout-hint">ピンチイン、またはダブルタップで元の表示に戻ります</div>'
    :'<div class="td-readout td-readout-hint">グラフをタップ、またはドラッグ／±1日ボタンで日付と数値が見られます</div>';
  attachChartTap();
}
function attachChartTap(){
  var svgEl=document.getElementById('tdSvg');
  if(!svgEl)return;
  var dragging=false,pinch=null;
  function idxFromClientX(clientX){
    var rect=svgEl.getBoundingClientRect();
    if(!rect.width)return null;
    var relX=(clientX-rect.left)/rect.width*chartState.w;
    return Math.round((relX-chartState.padL)/chartState.stepX);
  }
  function handle(clientX){
    if(!chartState)return;
    var idx=idxFromClientX(clientX);
    if(idx===null)return;
    showReadout(idx);
  }
  svgEl.addEventListener('mousedown',function(ev){dragging=true;handle(ev.clientX);});
  svgEl.addEventListener('mousemove',function(ev){if(dragging)handle(ev.clientX);});
  window.addEventListener('mouseup',function(){dragging=false;});
  svgEl.addEventListener('dblclick',function(){zoomScale=1;redrawZoomed();});
  svgEl.addEventListener('touchstart',function(ev){
    if(ev.touches.length===2){
      var rect=svgEl.getBoundingClientRect();
      var midX=(ev.touches[0].clientX+ev.touches[1].clientX)/2;
      pinch={dist:pinchDist(ev.touches[0],ev.touches[1]),scale:zoomScale,
        centerFrac:zoomScale<=1?Math.max(0,Math.min(1,(midX-rect.left)/rect.width)):zoomCenterFrac};
      ev.preventDefault();
    }else if(ev.touches[0]){handle(ev.touches[0].clientX);ev.preventDefault();}
  },{passive:false});
  // タップしたまま指を動かす(スワイプ)と読み取り位置が追従する。2本指はピンチズームに割り当てる。
  svgEl.addEventListener('touchmove',function(ev){
    if(ev.touches.length===2&&pinch){
      var d=pinchDist(ev.touches[0],ev.touches[1]);
      zoomScale=Math.min(10,Math.max(1,pinch.scale*(d/pinch.dist)));
      zoomCenterFrac=pinch.centerFrac;
      redrawZoomed();
      ev.preventDefault();
    }else if(ev.touches.length===1&&ev.touches[0]){
      handle(ev.touches[0].clientX);ev.preventDefault();
    }
  },{passive:false});
  svgEl.addEventListener('touchend',function(ev){
    if(ev.touches.length<2)pinch=null;
  });
}
function fmtYMD(sec){
  var d=new Date(sec*1000);
  return d.getFullYear()+'/'+(d.getMonth()+1)+'/'+d.getDate();
}
// グラフ下の一覧。タップ中(curReadoutIdx)のマーカーは上のtdReadoutに出るため、ここでは除外して
// 重複表示を避ける(showReadoutからも呼び直され、選択の都度この一覧が更新される)。
function renderEvNote(){
  var cs=chartState;
  var el=document.getElementById('tdEvNote');
  if(!cs||!el)return;
  var visible=cs.marks.filter(function(m){return m.idx!==curReadoutIdx;});
  if(!visible.length){el.innerHTML='';return;}
  var html='<div class="td-evnote">';
  visible.forEach(function(mk){
    html+='<div class="td-evline" style="'+markBgStyle(mk)+'"><span class="td-evdate">'+fmtYMD(cs.ts[mk.idx])+'</span>'
      +markTableHtml(mk)+'</div>';
  });
  html+='</div>';
  el.innerHTML=html;
}
// マーカー種類フィルター(黄=経済指標／橙=悪材料の歴史的出来事／青=好材料の歴史的出来事)。
// トグルボタンでON/OFFし、OFFの種類はグラフ・下の一覧の両方から除外する。
var markerFilter={econ:true,hneg:true,hpos:true};
var curTdM=null,curTdRange='1mo';
function filterMarks(marks){
  return marks.map(function(m){
    var items=m.items.filter(function(it){
      if(it.type==='econ')return markerFilter.econ;
      return it.sentiment==='pos'?markerFilter.hpos:markerFilter.hneg;
    });
    return items.length?{idx:m.idx,chg:m.chg,items:items}:null;
  }).filter(Boolean);
}
function drawTdChart(m,range){
  curTdM=m; curTdRange=range;
  var s=(range==='all')?{ts:m.tsMax||[],hist:m.histMax||[]}:sliceByRange(m.ts,m.hist,range);
  zoomBaseTs=s.ts; zoomBaseHist=s.hist; zoomScale=1; zoomCenterFrac=0.5;
  var marks=filterMarks(range==='all'?findMarks(s.ts,s.hist,true):marksForSlice(m,s.ts));
  curReadoutIdx=null;
  document.getElementById('tdChart').innerHTML=sparkSvg(s.ts,s.hist,marks);
  document.getElementById('tdReadout').innerHTML='<div class="td-readout td-readout-hint">グラフをタップ、またはドラッグ／±1日ボタンで日付と数値が見られます</div>';
  attachChartTap();
  var note='';
  if(s.hist.length){
    var mn=Math.min.apply(null,s.hist).toLocaleString(),mx=Math.max.apply(null,s.hist).toLocaleString();
    note='<div class="td-range">'+RANGE_LABEL[range]+'　安値 '+mn+' ／ 高値 '+mx+'</div>';
  }
  document.getElementById('tdRangeNote').innerHTML=note;
  renderEvNote();
}
// グラフ最大化: SVGを複製せず、通常表示で使っているtdChart/tdReadoutのDOM要素そのものを
// フルスクリーンコンテナへ移動する。タップ/ドラッグ/ピンチのイベントリスナーはDOM要素に
// 紐づいているため、移動後もそのまま機能する(タップ読み取り・ピンチズームともフルスクリーン内で使える)。
// 閉じる時はtdChartAnchor/tdReadoutAnchorの位置に戻す。
// フルスクリーン化で移動するDOM要素一覧(期間切替/マーカーフィルター/グラフ/読み取り/±1日/範囲内安値高値/
// 重なりマーカー一覧)。この順で移動し、閉じる時は各Anchorへ逆順で戻す。
var TD_FS_MOVE_IDS=['tdRbtns','tdMfilter','tdChart','tdReadout','tdNav','tdRangeNote','tdEvNote'];
// 横画面はグラフが縦に大きくなり±1日ボタンが下に隠れて見えなくなるため、タイトルと閉じるボタンの
// 間の空きスペース(ヘッダー行)へ移動する。縦画面は従来通りチャートの下(読み取り欄の直後)に置く。
// 「最大化ボタンを押した瞬間の向き」だけで固定してしまうと、最大化した"後"に端末を回転させた
// ケースに追従できない(押した時点ではまだ縦画面のまま判定される)ため、フルスクリーン中は
// resize/orientationchangeのたびに毎回re評価する。
function repositionTdNav(){
  if(!document.getElementById('chartFs').classList.contains('open'))return;
  var navEl=document.getElementById('tdNav');
  var closeBtn=document.getElementById('chartFsClose');
  if(!navEl||!closeBtn)return;
  var landscape=window.matchMedia('(orientation: landscape)').matches;
  var inHeader=closeBtn.parentElement.contains(navEl);
  if(landscape&&!inHeader){
    closeBtn.before(navEl);
  }else if(!landscape&&inHeader){
    var readout=document.getElementById('tdReadout');
    if(readout&&readout.parentElement)readout.after(navEl);
    else document.getElementById('chartFsBody').appendChild(navEl);
  }
}
window.addEventListener('resize',repositionTdNav);
window.addEventListener('orientationchange',function(){setTimeout(repositionTdNav,200);});
// resize/orientationchangeはiOS Safariでは発火タイミングがずれたり、環境によっては
// 発火自体が取りこぼされることがあるため、フルスクリーン中だけ軽い間隔でも
// 保険的に再判定する(表示中のみ動かす低頻度ポーリングなので負荷は無視できる)。
var tdNavPollTimer=null;
function openChartFullscreen(){
  if(!curTdM)return;
  document.getElementById('chartFsTitle').textContent=curTdM.label+'　'+RANGE_LABEL[curTdRange];
  var fsBody=document.getElementById('chartFsBody');
  TD_FS_MOVE_IDS.forEach(function(id){
    var el=document.getElementById(id);
    if(el)fsBody.appendChild(el);
  });
  document.getElementById('chartFs').classList.add('open');
  repositionTdNav();
  if(tdNavPollTimer)clearInterval(tdNavPollTimer);
  tdNavPollTimer=setInterval(repositionTdNav,400);
}
function closeChartFullscreen(){
  if(tdNavPollTimer){clearInterval(tdNavPollTimer);tdNavPollTimer=null;}
  TD_FS_MOVE_IDS.forEach(function(id){
    var anchor=document.getElementById(id+'Anchor');
    var el=document.getElementById(id);
    if(anchor&&el)anchor.after(el);
  });
  document.getElementById('chartFs').classList.remove('open');
}
document.getElementById('chartFsClose').addEventListener('click',closeChartFullscreen);
var TD_RANGES=['1mo','6mo','1y','3y','5y','10y','all'];
var TD_RANGE_TXT={'1mo':'1ヶ月','6mo':'半年','1y':'1年','3y':'3年','5y':'5年','10y':'10年','all':'全期間'};
function renderTickDetail(i){
  var el=document.getElementById('tickDetail');
  var m=MHIST[i];
  if(!m){el.classList.remove('open');return;}
  var cls=m.ch>=0?'up1':'dn1', sign=m.ch>=0?'▲':'▼';
  var body='<div class="td-hd">'+m.label+'<b>'+m.val+'</b><span class="'+cls+'">'+sign+Math.abs(m.ch).toFixed(2)+'%</span>'
    +(m.hist&&m.hist.length>=2?'<button class="td-fsbtn" id="tdFsBtn" type="button">⛶ 最大化</button>':'')+'</div>';
  if(m.hist&&m.hist.length>=2){
    body+='<span id="tdRbtnsAnchor"></span><div class="td-rbtns" id="tdRbtns">'+TD_RANGES.map(function(r,ri){
      return '<button class="rb'+(ri===0?' on':'')+'" data-r="'+r+'">'+TD_RANGE_TXT[r]+'</button>';
    }).join('')+'</div>'
      +'<span id="tdMfilterAnchor"></span><div class="td-mfilter" id="tdMfilter">'
        +'<button class="mf on" data-k="econ">🟡 指標</button>'
        +'<button class="mf on" data-k="hneg">🔴 悪材料</button>'
        +'<button class="mf on" data-k="hpos">🔵 好材料</button>'
      +'</div>'
      +'<span id="tdChartAnchor"></span><div id="tdChart"></div>'
      +'<span id="tdNavAnchor"></span><div class="td-nav" id="tdNav">'
        +'<button class="nb nb-mk" id="tdPrevMkBtn" type="button" title="前のマーカー" aria-label="前のマーカーへ">⏮</button>'
        +'<button class="nb" id="tdPrevBtn" type="button">− 1日</button>'
        +'<button class="nb" id="tdNextBtn" type="button">+ 1日</button>'
        +'<button class="nb nb-mk" id="tdNextMkBtn" type="button" title="次のマーカー" aria-label="次のマーカーへ">⏭</button>'
      +'</div>'
      +'<span id="tdReadoutAnchor"></span><div id="tdReadout"></div>'
      +'<span id="tdRangeNoteAnchor"></span><div id="tdRangeNote"></div>'
      +'<span id="tdEvNoteAnchor"></span><div id="tdEvNote"></div>';
  }else{
    body+='<div class="td-empty" style="margin-top:6px">推移データなし（投資信託のため個別ページ参照）</div>';
  }
  el.innerHTML=body;
  el.classList.add('open');
  if(m.hist&&m.hist.length>=2){
    el.querySelectorAll('.rb').forEach(function(b){
      b.addEventListener('click',function(ev){
        ev.stopPropagation();
        // el(tickDetail)ではなくbの現在の親から探す(フルスクリーン化でtdRbtnsごと
        // 別のDOM位置へ移動するため、elスコープのままだと移動後に他ボタンのonが
        // 消せなくなり複数のボタンが点灯したままになる)。
        b.parentElement.querySelectorAll('.rb').forEach(function(x){x.classList.remove('on');});
        b.classList.add('on');
        drawTdChart(m,b.dataset.r);
      });
    });
    el.querySelectorAll('.mf').forEach(function(b){
      b.addEventListener('click',function(ev){
        ev.stopPropagation();
        var k=b.dataset.k;
        markerFilter[k]=!markerFilter[k];
        b.classList.toggle('on',markerFilter[k]);
        drawTdChart(curTdM,curTdRange);
      });
    });
    document.getElementById('tdPrevBtn').addEventListener('click',function(ev){ev.stopPropagation();stepReadout(-1);});
    document.getElementById('tdNextBtn').addEventListener('click',function(ev){ev.stopPropagation();stepReadout(1);});
    document.getElementById('tdPrevMkBtn').addEventListener('click',function(ev){ev.stopPropagation();stepMarker(-1);});
    document.getElementById('tdNextMkBtn').addEventListener('click',function(ev){ev.stopPropagation();stepMarker(1);});
    document.getElementById('tdFsBtn').addEventListener('click',function(ev){ev.stopPropagation();openChartFullscreen();});
    markerFilter={econ:true,hneg:true,hpos:true};
    drawTdChart(m,'1mo');
  }
}
document.getElementById('tick').addEventListener('click',function(ev){
  var t=ev.target.closest('.t'); if(!t||!t.dataset.i)return;
  var i=parseInt(t.dataset.i,10);
  var els=document.querySelectorAll('#tick .t');
  if(tickDetailOpenIdx===i){
    tickDetailOpenIdx=-1;
    document.getElementById('tickDetail').classList.remove('open');
    els.forEach(function(e){e.classList.remove('on');});
    return;
  }
  tickDetailOpenIdx=i;
  els.forEach(function(e){e.classList.toggle('on',e===t);});
  openTickDetail(i);
});
// market.json をまだ読んでいなければ取得してから描画する。取得中/失敗も画面に出す
// (無言で何も起きないと「壊れた」のか「読み込み中」なのか利用者が判断できないため)。
function openTickDetail(i){
  var el=document.getElementById('tickDetail');
  if(MHIST){renderTickDetail(i);return;}
  el.innerHTML='<div class="td-empty">推移データを読み込み中…</div>';
  el.classList.add('open');
  ensureMhist().then(function(){
    if(tickDetailOpenIdx===i)renderTickDetail(i);
  }).catch(function(){
    if(tickDetailOpenIdx!==i)return;
    el.innerHTML='<div class="td-empty">推移データを取得できませんでした（通信状態をご確認ください）'
      +'<button class="td-retry" type="button">再試行</button></div>';
    el.querySelector('.td-retry').addEventListener('click',function(ev){
      ev.stopPropagation(); openTickDetail(i);
    });
  });
}
var tabs=document.querySelectorAll('.tab'),secs=document.querySelectorAll('.sec');
// タブとパネルの対応をARIAで明示する（色の違いだけでは、どれが選択中かが読み上げに伝わらない）。
(function(){
  var nav=document.querySelector('nav');
  if(nav){nav.setAttribute('role','tablist');nav.setAttribute('aria-label','カテゴリー');}
  tabs.forEach(function(t){
    var id=t.dataset.t, p=document.getElementById('sec-'+id);
    t.setAttribute('role','tab');
    t.id='tab-'+id;
    t.setAttribute('aria-selected',t.classList.contains('active')?'true':'false');
    if(p){
      t.setAttribute('aria-controls','sec-'+id);
      p.setAttribute('role','tabpanel');
      p.setAttribute('aria-labelledby','tab-'+id);
    }
  });
  var sep=document.querySelector('.tab-sep');
  if(sep)sep.setAttribute('role','presentation');
})();
// タブごとにスクロール位置を覚えて戻す（以前は切替のたびに先頭へ飛ばしていたため、
// 読みかけの記事まで毎回スクロールし直す必要があった）。
// 初期表示中のタブもcurTabに入れておく（null のままだと、最初の1回だけ元のタブの
// 位置が記録されず、戻ってきた時に先頭へ飛んでしまう）。
var tabScroll={}, curTab=(function(){
  var a=document.querySelector('.tab.active');
  return a?a.dataset.t:null;
})();
function show(id){
  if(curTab)tabScroll[curTab]=window.pageYOffset||document.documentElement.scrollTop||0;
  curTab=id;
  tabs.forEach(function(t){
    var on=t.dataset.t===id;
    t.classList.toggle('active',on);
    t.setAttribute('aria-selected',on?'true':'false');
  });
  secs.forEach(function(s){s.classList.toggle('active',s.id==='sec-'+id);});
  if(id==='watch')renderWatch();
  if(id==='bgm'){try{loadStationSongs('#sec-bgm');}catch(e){}}
  if(id==='radio'){
    // 選曲取得を最優先で呼ぶ。各処理は独立(try/catch)にし、1つ失敗しても他を止めない
    // （以前は loadRadikoLocal/loadNhkPrograms の例外で loadRadioStationSongs まで到達せず固着）。
    try{loadRadioStationSongs();}catch(e){}
    try{loadRadikoLocal();}catch(e){}
    try{loadNhkPrograms();}catch(e){}
  }
  if(id!=='tv'){try{stopTv();}catch(e){}}
  try{localStorage.setItem('ptab',id);}catch(e){}
  window.scrollTo(0,tabScroll[id]||0);
}
// 📺 テレビ: 公式YouTubeライブをIFrame API経由で再生（同時に1局・タブを離れると停止）。
// IFrame APIを使う理由: (1)字幕モジュールに触れて海外局で日本語(自動翻訳)字幕を試みる
// (2)高画質を要求する(YouTube側は自動制御のため保証はされない)。
var tvPlayer=null, tvYtReady=false, tvCapTimers=[];
var TV_CAP_WORKER='https://pulse-radio.pulse-relay-hub.workers.dev';
// 自前字幕: 視聴中を25秒ごとにWorkerへ通知(PCデーモンが検知)し、訳文を4秒ごとに取得して表示
function tvCapStart(vid,name){
  var t0=Date.now(), got=false;
  function ping(){try{fetch(TV_CAP_WORKER+'/?s=capreq',{method:'POST',body:JSON.stringify({vid:vid,name:name})}).catch(function(){});}catch(e){}}
  var capLines=[];
  function render(){
    var el=document.getElementById('tvcap'); if(!el)return;
    // シーク対応: ライブ先端から何秒戻っているか(X)を見て、その時刻に相当する行を選ぶ。
    // 行の作成時刻t ≈ 放送時刻+約25秒(取得+翻訳)。先端視聴時は最新行(狙い年齢≒10秒)になる。
    // ライブのgetDurationは読込時点で凍結する(実測)ため、
    // 「読込時の先端値+経過時間」で現在の先端を推定してXを出す
    var X=0,st=-1;
    try{
      st=tvPlayer&&tvPlayer.getPlayerState?tvPlayer.getPlayerState():-1;
      if(tvPlayer&&tvPlayer.getCurrentTime&&window.tvEdge0){
        var edge=tvEdge0.d+(Date.now()-tvEdge0.ts)/1000;
        var c=tvPlayer.getCurrentTime();
        if(c>0&&edge>c)X=edge-c;
      }
    }catch(e){}
    if(st!==1&&got)return; // バッファ中・停止中は表示を据え置き(シーク直後の誤表示防止)
    var target=Math.max(0,X*1000-15000);
    var best=null,bd=1e15;
    for(var i=0;i<capLines.length;i++){
      var age=Date.now()-capLines[i].t;
      var diff=Math.abs(age-target);
      if(diff<bd){bd=diff;best=capLines[i];}
    }
    if(best&&bd<=25000){
      got=true;
      el.style.display='block';
      el.textContent=best.text;
    }else if(got&&X>30){
      el.style.display='block';
      el.textContent='💬 この位置の字幕はありません（視聴中の範囲のみ生成されます）';
    }else if(!got){
      el.style.display='block';
      el.textContent=(Date.now()-t0>45000)
        ?'💬 字幕が届きません（自宅PCが起動中か確認してください）'
        :'💬 日本語字幕を準備中…（20秒ほどで流れ始めます）';
    }else{el.style.display='none';}
  }
  function poll(){
    fetch(TV_CAP_WORKER+'/?s=cap&vid='+vid).then(function(r){return r.json();}).then(function(o){
      capLines=(o&&o.lines)||[];
      render();
    }).catch(function(){});
  }
  var el=document.getElementById('tvcap');
  if(el){el.style.display='block';el.textContent='💬 日本語字幕を準備中…（20秒ほどで流れ始めます）';}
  ping(); poll();
  // renderは1秒ごと(シーク直後に即追従)・取得は3秒ごと・視聴通知は25秒ごと
  tvCapTimers.push(setInterval(ping,25000), setInterval(poll,2000), setInterval(render,1000));
}
function tvCapStop(){
  tvCapTimers.forEach(function(t){clearInterval(t);}); tvCapTimers=[];
}
document.addEventListener('fullscreenchange',function(){
  if(!document.fullscreenElement)document.body.classList.remove('tvlock');
});
window.onYouTubeIframeAPIReady=function(){tvYtReady=true;};
function tvLoadApi(cb){
  if(window.YT&&YT.Player){cb();return;}
  if(!document.getElementById('ytapi')){
    var s=document.createElement('script');s.id='ytapi';s.src='https://www.youtube.com/iframe_api';
    document.head.appendChild(s);
  }
  var n=0,t=setInterval(function(){n++;if(window.YT&&YT.Player){clearInterval(t);cb();}else if(n>100){clearInterval(t);}},100);
}
function stopTv(){
  tvCapStop();
  try{if(tvPlayer){tvPlayer.destroy();tvPlayer=null;}}catch(e){tvPlayer=null;}
  var w=document.getElementById('tvplay'); if(w&&w.innerHTML)w.innerHTML='';
  document.querySelectorAll('.tvcard.playing').forEach(function(c){c.classList.remove('playing');});
}
// 海外局: 字幕トラックに日本語への自動翻訳を要求（非公式手段のため局により効かない）
function tvJaCaption(p){
  try{
    var tl=p.getOption('captions','tracklist');
    if(tl&&tl.length){
      var t={languageCode:tl[0].languageCode,translationLanguage:{languageCode:'ja'}};
      if(tl[0].kind)t.kind=tl[0].kind;
      p.setOption('captions','track',t);
    }
  }catch(e){}
}
function playTv(vid,cid,name,cc){
  var w=document.getElementById('tvplay'); if(!w)return;
  try{var a=document.getElementById('bgm'); if(a&&!a.paused)a.pause();}catch(e){}
  stopTv();
  w.innerHTML='<div class="tvplayer" id="tvpl"><div id="tvfr"></div><div id="tvcap" class="tvcap"></div>'
    +'<button class="tvfs-x" id="tvfsx">✕ 閉じる</button></div>'
    +'<div class="tv-ctrl"><span class="tv-title">▶ '+name+'</span>'
    +'<button class="tvfsbtn" id="tvfsbtn">⛶ 全画面で見る</button></div>'
    +'<div class="tv-now">映らないときは '
    +'<a href="https://www.youtube.com/channel/'+cid+'/live" target="_blank" rel="noopener">YouTubeで開く</a>'
    +(cc==='1'?'<br>💬 日本語字幕(自前AI翻訳)は自宅PC稼働中のみ・実映像から十数秒遅れて下部に表示'
    +'<br>⏪ シークバーで巻き戻すと、その場面の字幕に切り替わります。'
    +'戻れるのは「字幕を出しながら見ていた範囲(最大8分)」だけで、見ていなかった時間帯の字幕はありません。'
    +'局によっては配信側の設定で巻き戻し自体ができません(Sky News等)':'')+'</div>';
  // 全画面は字幕ごと(=YouTube側の全画面ボタンは fs:0 で無効化し、この自前ボタンを使う)
  function tvFsOn(){
    var p=document.getElementById('tvpl'); if(!p)return;
    if(p.requestFullscreen){p.requestFullscreen().catch(function(){p.classList.add('tvfull');document.body.classList.add('tvlock');});}
    else{p.classList.add('tvfull');document.body.classList.add('tvlock');}
  }
  function tvFsOff(){
    var p=document.getElementById('tvpl');
    if(document.fullscreenElement){document.exitFullscreen().catch(function(){});}
    if(p)p.classList.remove('tvfull');
    document.body.classList.remove('tvlock');
  }
  var fb=document.getElementById('tvfsbtn'); if(fb)fb.addEventListener('click',tvFsOn);
  var fx=document.getElementById('tvfsx'); if(fx)fx.addEventListener('click',tvFsOff);
  if(cc==='1'){tvCapStart(vid,name);}
  document.querySelectorAll('.tvcard').forEach(function(c){c.classList.toggle('playing',c.dataset.vid===vid);});
  tvLoadApi(function(){
    var pv={autoplay:1,playsinline:1,hl:'ja',rel:0,fs:0};
    if(cc==='1'){pv.cc_load_policy=1;pv.cc_lang_pref='ja';}
    tvPlayer=new YT.Player('tvfr',{videoId:vid,playerVars:pv,events:{
      onReady:function(ev){
        try{ev.target.setPlaybackQuality('hd1080');}catch(e){}
        try{ev.target.playVideo();}catch(e){}
        try{window.tvEdge0={d:ev.target.getDuration(),ts:Date.now()};}catch(e){}
      },
      onStateChange:function(ev){
        if(ev.data===1){try{ev.target.setPlaybackQuality('hd1080');}catch(e){}}
      },
      onApiChange:function(ev){
        if(cc==='1'){var p=ev.target;tvJaCaption(p);setTimeout(function(){tvJaCaption(p);},1500);}
      }
    }});
  });
}
document.querySelectorAll('.tvcard').forEach(function(c){
  c.addEventListener('click',function(){
    if(!c.dataset.vid){window.open('https://www.youtube.com/channel/'+c.dataset.cid+'/live','_blank');return;}
    if(c.classList.contains('playing')){stopTv();return;}
    playTv(c.dataset.vid,c.dataset.cid,c.dataset.name,c.dataset.cc||'0');
  });
});
// 国チップ: 選んだ国の局一覧だけ表示（切替時は再生停止）
document.querySelectorAll('.tvchip').forEach(function(ch){
  ch.addEventListener('click',function(){
    stopTv();
    document.querySelectorAll('.tvchip').forEach(function(x){x.classList.toggle('active',x===ch);});
    document.querySelectorAll('.tvcountry').forEach(function(b){b.classList.toggle('active',b.dataset.tvc===ch.dataset.tvc);});
  });
});
function rkHM(s){return s&&s.length>=12?s.substr(8,2)+':'+s.substr(10,2):'';}
// 現在時刻(JST)を YYYYMMDDhhmmss で返す。全国局リンクの共有URL(t=)に使う。
function rkNowT(){
  var d=new Date(Date.now()+9*3600*1000); // UTC→JST
  function p(n){return ('0'+n).slice(-2);}
  return d.getUTCFullYear()+p(d.getUTCMonth()+1)+p(d.getUTCDate())+p(d.getUTCHours())+p(d.getUTCMinutes())+p(d.getUTCSeconds());
}
// 全国局リンク: タップ時に「共有URL＋現在時刻」に差し替え（スマホはアプリが該当局を開く）。
document.addEventListener('click',function(e){
  var a=e.target.closest?e.target.closest('a.rkjp'):null;
  if(!a)return;
  var sid=a.getAttribute('data-sid'); if(!sid)return;
  a.setAttribute('href','https://radiko.jp/share/?sid='+encodeURIComponent(sid)+'&t='+rkNowT());
},true);
// 選択エリア（無料エリア）の局＋現在番組を #rk-local に描画。
// エリアは「手動保存(localStorage)」があれば最優先。未選択なら空状態（プルダウンだけ表示・局は出さない）。
// IP自動判定は誤判定が多く撤去。既定エリアも設けず、ユーザーが県を選ぶまで表示しない。
var rkShown='';
function rkSavedArea(){try{return localStorage.getItem('rkarea')||'';}catch(e){return '';}}
function rkAreaOptions(sel){
  // 先頭に空の「地域を選択…」を置く（未選択の空状態を表現）
  var o='<option value=""'+(sel?'':' selected')+'>地域を選択…</option>';
  for(var k in RKAREA){o+='<option value="'+k+'"'+(k===sel?' selected':'')+'>'+esc(RKAREA[k])+'</option>';}
  return o;
}
function rkHead(area){
  return '<div class="rk-localhead">📍 無料で聴ける地域: <select id="rk-sel">'+rkAreaOptions(area)+'</select></div>'+
         '<div class="rk-note2">実際にいる県を選ぶと、その地域の局と現在番組が表示されます（選択は保存されます）。</div>';
}
function bindRkSel(){
  var sel=document.getElementById('rk-sel'); if(!sel)return;
  sel.addEventListener('change',function(){
    var v=this.value;
    try{if(v)localStorage.setItem('rkarea',v);else localStorage.removeItem('rkarea');}catch(e){}
    renderRkArea(v);
  });
}
function renderRkArea(area){
  var box=document.getElementById('rk-local'); if(!box)return;
  rkShown=area||'_pick'; // 未選択でも二重描画を防ぐ
  if(!area){ box.innerHTML=rkHead(''); bindRkSel(); return; }
  fetch('https://radiko.jp/v3/program/now/'+area+'.xml',{cache:'no-store'})
    .then(function(r){return r.text();})
    .then(function(t){
      var xml=new DOMParser().parseFromString(t,'application/xml');
      var stations=xml.querySelectorAll('station'), cards='';
      Array.prototype.forEach.call(stations,function(st){
        var sid=st.getAttribute('id'); if(!sid)return;
        var nm=st.querySelector('name'), prog=st.querySelector('prog');
        // リンクは常に「共有URL＋現在時刻(t=rkNowT)」に。radikoアプリを開けるのは /share/* だけ(AASA実確認)で
        // #!/live/ はアプリを起動しない→ウェブ(IP判定)に落ちるので使わない。t=現在時刻にすることで
        // 番組の頭出しではなく“今(ほぼ生放送)”の位置でアプリが開く。アプリはGPS判定なので地元局は無料フル。
        var sname=nm?nm.textContent:sid, ptxt='番組情報なし', href='https://radiko.jp/share/?sid='+encodeURIComponent(sid)+'&t='+rkNowT();
        if(prog){
          var ti=prog.querySelector('title'),pf=prog.querySelector('pfm'),ft=prog.getAttribute('ft');
          var tm=rkHM(ft),te=rkHM(prog.getAttribute('to'));
          ptxt='▶ '+(tm&&te?tm+'-'+te+' ':'')+(ti?ti.textContent:'');
          if(pf&&pf.textContent.trim())ptxt+=' ／ '+pf.textContent.trim();
        }
        cards+='<a class="rcard" href="'+href+'" target="_blank" rel="noopener">'+
               '<span class="rc-n">'+esc(sname)+'</span><span class="rc-p">'+esc(ptxt)+'</span></a>';
      });
      box.innerHTML=rkHead(area)+'<div class="rcards">'+cards+'</div>';
      bindRkSel();
    }).catch(function(){
      box.innerHTML=rkHead(area)+'<div class="rk-detecting">エリア（'+esc(RKAREA[area]||area)+'）の番組取得に失敗しました'
        +' <button class="rretry" type="button">再試行</button></div>';
      bindRkSel();
      var rb=box.querySelector('.rretry');
      if(rb)rb.addEventListener('click',function(){renderRkArea(area);});
    });
}
function loadRadikoLocal(){
  var box=document.getElementById('rk-local'); if(!box||rkShown)return;
  renderRkArea(rkSavedArea()||''); // 保存があれば復元、無ければ空状態
}
// 取得に失敗したまま固まった時の手動再取得。番組表(radiko/NHK)も選曲も60秒のクールダウンを
// 持っているため、それを解除してから3系統をまとめて取り直す。
(function(){
  var b=document.getElementById('radioReload'); if(!b)return;
  b.addEventListener('click',function(){
    b.disabled=true; b.textContent='🔄 再取得中…';
    nhkAt=0; songLoadAt['#sec-radio']=0;
    try{loadRadioStationSongs();}catch(e){}
    try{loadNhkPrograms();}catch(e){}
    try{renderRkArea(rkSavedArea()||'');}catch(e){}
    setTimeout(function(){b.disabled=false;b.textContent='🔄 番組・選曲を再取得';},4000);
  });
})();
tabs.forEach(function(t){t.addEventListener('click',function(){document.getElementById('q').value='';show(t.dataset.t);});});

// ── 新着/既読 ────────────────────────────────────────────────
// 30分ごとに記事が入れ替わるため「前回このアプリを開いた時には無かった記事」にNEWを付ける。
// 既読の記録は「画面に実際に出た(IntersectionObserver)」か「タップした」時点で行い、
// 表示中にバッジを消すことはしない（読んでいる最中に印が消えると分かりにくいため）。
// 記録の反映は次回の読み込みから。開いていないタブの記事は次回もNEWのまま残る。
// 保存形式は「記事URLの32bitハッシュ → 最終確認時刻(秒)」。URLをそのまま持つと肥大するため。
var SEEN_KEY='pseen', SEEN_KEEP_DAYS=14, SEEN_MAX=4000;
var seenMap={}, seenFirstRun=false, seenTimer=null;
function seenHash(u){
  var h=2166136261;                      // FNV-1a(32bit)
  for(var i=0;i<u.length;i++){h^=u.charCodeAt(i);h=(h*16777619)>>>0;}
  return h.toString(36);
}
function seenSave(){
  if(seenTimer){clearTimeout(seenTimer);seenTimer=null;}
  var ks=Object.keys(seenMap);
  if(ks.length>SEEN_MAX){                // 新しいものから SEEN_MAX 件だけ残す
    ks.sort(function(a,b){return seenMap[b]-seenMap[a];});
    var keep={};
    for(var i=0;i<SEEN_MAX;i++)keep[ks[i]]=seenMap[ks[i]];
    seenMap=keep;
  }
  try{localStorage.setItem(SEEN_KEY,JSON.stringify(seenMap));}catch(e){}
}
function markSeen(u){
  if(!u)return;
  var k=seenHash(u), now=Math.floor(Date.now()/1000);
  if(seenMap[k]&&now-seenMap[k]<3600)return;   // 直近に記録済みなら書き込まない
  seenMap[k]=now;
  if(!seenTimer)seenTimer=setTimeout(seenSave,1500);
}
function isNewUrl(u){return !seenFirstRun&&!seenMap[seenHash(u)];}
(function(){                             // 保存済みの記録を読み、古い分を落とす
  var raw=null;
  try{raw=localStorage.getItem(SEEN_KEY);}catch(e){}
  if(raw===null){seenFirstRun=true;return;}    // キー自体が無い＝初回訪問
  var m={};
  try{m=JSON.parse(raw)||{};}catch(e){m={};}
  var cut=Math.floor(Date.now()/1000)-SEEN_KEEP_DAYS*86400;
  for(var k in m){if(m[k]>=cut)seenMap[k]=m[k];}
})();
function initNewMarks(){
  var cards=document.querySelectorAll('.sec .card');
  if(seenFirstRun){
    // 初回訪問は全記事を既読の基準として記録する（全部NEWになる状態を避ける）
    DATA.forEach(function(o){markSeen(o.u);});
    seenSave();
    return;
  }
  var per={};
  cards.forEach(function(a){
    var u=a.getAttribute('href')||'';
    if(!isNewUrl(u))return;
    a.classList.add('is-new');
    var meta=a.querySelector('.meta');
    if(meta){
      var s=document.createElement('span');
      s.className='new'; s.textContent='NEW';
      meta.insertBefore(s,meta.firstChild);
    }
    var sec=a.closest('.sec');
    if(sec)per[sec.id]=(per[sec.id]||0)+1;
  });
  tabs.forEach(function(t){
    var n=per['sec-'+t.dataset.t]||0;
    if(!n)return;
    var b=document.createElement('span');
    b.className='nn'; b.textContent='+'+n;
    b.setAttribute('aria-label',n+'件の新着');
    t.appendChild(b);
  });
  if('IntersectionObserver' in window){
    var io=new IntersectionObserver(function(es){
      es.forEach(function(e){
        if(!e.isIntersecting)return;
        markSeen(e.target.getAttribute('href')||'');
        io.unobserve(e.target);
      });
    },{threshold:.01});
    cards.forEach(function(a){io.observe(a);});
  }else{
    cards.forEach(function(a){markSeen(a.getAttribute('href')||'');});
  }
}
document.addEventListener('click',function(e){
  var a=e.target&&e.target.closest?e.target.closest('a.card'):null;
  if(a)markSeen(a.getAttribute('href')||'');
},true);
document.addEventListener('visibilitychange',function(){if(document.hidden&&seenTimer)seenSave();});
window.addEventListener('pagehide',function(){if(seenTimer)seenSave();});

function cardHTML(o){
  var nw=isNewUrl(o.u)?'<span class="new">NEW</span>':'';
  return '<a class="card'+(nw?' is-new':'')+'" style="--c:'+o.col+'" href="'+o.u+'" target="_blank" rel="noopener">'+
    '<div class="meta">'+nw+'<span class="cat" style="background:'+o.col+'">'+o.c+'</span>'+
    '<span class="src">'+o.s+'</span><span class="tm">'+o.tm+'</span></div>'+
    '<div class="ttl">'+o.t+'</div></a>';
}
// 検索
var q=document.getElementById('q');
q.addEventListener('input',function(){
  var kw=q.value.trim();
  if(!kw){var last=localStorage.getItem('ptab')||'trend';show(document.getElementById('sec-'+last)?last:'trend');return;}
  var hit=DATA.filter(function(o){return o.t.toLowerCase().indexOf(kw.toLowerCase())>=0;});
  document.getElementById('slist').innerHTML=
    '<div class="hint">「'+kw+'」 '+hit.length+'件</div>'+hit.map(cardHTML).join('');
  tabs.forEach(function(t){t.classList.remove('active');});
  secs.forEach(function(s){s.classList.toggle('active',s.id==='sec-search');});
  window.scrollTo(0,0);
});
// ウォッチ
function getKeys(){try{return JSON.parse(localStorage.getItem('pwatch')||'[]');}catch(e){return [];}}
function setKeys(a){try{localStorage.setItem('pwatch',JSON.stringify(a));}catch(e){}}
function renderWatch(){
  var keys=getKeys();
  document.getElementById('wchips').innerHTML=keys.map(function(k,i){
    return '<span class="chip">'+k+'<b data-i="'+i+'">×</b></span>';}).join('');
  document.querySelectorAll('#wchips b').forEach(function(b){
    b.addEventListener('click',function(){var a=getKeys();a.splice(+b.dataset.i,1);setKeys(a);renderWatch();});});
  var list=document.getElementById('wlist');
  if(!keys.length){list.innerHTML='';return;}
  var hit=DATA.filter(function(o){return keys.some(function(k){return o.t.toLowerCase().indexOf(k.toLowerCase())>=0;});});
  list.innerHTML='<div class="hint">'+hit.length+'件ヒット</div>'+hit.map(cardHTML).join('');
}
document.getElementById('wadd').addEventListener('click',function(){
  var v=document.getElementById('wkey').value.trim();if(!v)return;
  var a=getKeys();if(a.indexOf(v)<0)a.push(v);setKeys(a);document.getElementById('wkey').value='';renderWatch();});
document.getElementById('wkey').addEventListener('keydown',function(e){if(e.key==='Enter')document.getElementById('wadd').click();});

initNewMarks();
try{var last=localStorage.getItem('ptab');if(last&&document.getElementById('sec-'+last))show(last);}catch(e){}
// BGM内蔵プレーヤー（このアプリ内で音を鳴らす。タブを切り替えても再生継続）
var audio=document.getElementById('bgm');
var pp=document.getElementById('pp'),npt=document.getElementById('npt'),nps=document.getElementById('nps');
var mini=document.getElementById('mini'),mpp=document.getElementById('mpp'),mname=document.getElementById('mname');
var curName='',curLaut='',curSoma='',curWorker='',curSong='',curDetail='',curTitle='',curArtist='',curMeta=null;
// CORS不可の局(Radio Paradise/torontocast)の選曲を中継する自前Cloudflare Worker（?s=rp/natsu/hits）
var WORKER='https://pulse-radio.pulse-relay-hub.workers.dev/';
var lrcLines=null,lrcKey='',lrcTimer=null;
function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function refreshUI(){
  var playing=!audio.paused&&!!audio.src;
  pp.textContent=playing?'❚❚':'▶';
  mpp.textContent=playing?'❚❚':'▶';
  mini.classList.toggle('on',!!audio.src);
  if(curName){
    npt.textContent=(playing?'再生中: ':'一時停止: ')+curName;
    if(curSong){
      nps.innerHTML='♪ '+esc(curSong)+(curDetail?'<span class="npd">'+esc(curDetail)+'</span>':'');
    }else{
      nps.textContent=(curLaut||curSoma||curWorker)?'選曲情報を取得中…':'この局は選曲情報なし';
    }
    mname.textContent=curSong?('♪ '+curSong):('♪ '+curName);
  }
}
// laut.fm の「今かかっている曲」を取得（CORS: Access-Control-Allow-Origin:* 確認済）。
// 曲名・アーティストに加え、取得できればアルバム/リリース年/ジャンルも表示する。
// ※作曲者・作詞者はネットラジオのメタデータに含まれないため表示不可（誤情報回避）。
var jpKey='';
function jnorm(s){return String(s==null?'':s).toLowerCase().replace(/[\s.\-_,~～〜'’!！?？「」『』()（）\[\]・:：/]/g,'');}
// iTunes(日本)で照合し、アーティストが一致した曲だけ日本語(非ASCII)表記に差し替える。
// 英語表記のままの曲や、照合が一致しない曲は laut.fm のローマ字表記のまま（誤変換を避ける）。
// タイトルから「(Bleach Opening 3)」等の括弧ノイズを除いてから照合の精度を上げる。
function jclean(s){return String(s==null?'':s).replace(/\([^)]*\)/g,'').replace(/\[[^\]]*\]/g,'').replace(/\s+/g,' ').trim();}
// iTunes照合は同時に叩きすぎるとレート制限で非JSON(空/エラー)が返り日本語化に失敗する。
// 同時実行を最大2に絞るキュー＋テキストで受けてJSON.parse(例外を投げない)＋非JSONは少し待って再試行。
var itQ=[],itActive=0;
function itSearch(term,lim){return new Promise(function(res){itQ.push([term,lim,res]);itPump();});}
function itPump(){
  while(itActive<1&&itQ.length){
    var j=itQ.shift(); itActive++;
    itDo(j[0],j[1]).then(function(rs){j[2](rs);setTimeout(function(){itActive--;itPump();},300);}); // 次の照合まで300ms空ける(iTunesレート制限緩和)
  }
}
function itParse(t){try{var d=JSON.parse(t);return d.results||[];}catch(e){return null;}}
// iTunes照合の実行。まず直fetch(PC等は通る)。成功したら結果をWorkerの共有キャッシュへ書き込む(warm)。
// 直が非JSON(429)や例外(iPhone Safariで塞がれる)ならWorker経由(=共有キャッシュ優先)へフォールバック。
function itWkURL(term,lim){return WORKER+'?s=itunes&limit='+lim+'&term='+encodeURIComponent(term);}
function itWarm(term,text){try{fetch(WORKER+'?s=itunes&term='+encodeURIComponent(term),{method:'POST',body:text,cache:'no-store',keepalive:true}).catch(function(){});}catch(e){}}
function itViaWorker(term,lim){return fetchT(itWkURL(term,lim),8000).then(function(r){return r.text();}).then(function(t){return itParse(t)||[];}).catch(function(){return [];});}
function itDo(term,lim){
  var u='https://itunes.apple.com/search?country=JP&media=music&limit='+lim+'&term='+encodeURIComponent(term);
  return fetchT(u,8000).then(function(r){return r.text();}).then(function(t){
    var rs=itParse(t);
    if(rs&&rs.length){itWarm(term,t);return rs;}   // 直で取得→共有キャッシュへ書込
    if(rs)return rs;                                // 200・有効JSONだが0件
    return itViaWorker(term,lim);                   // 非JSON(429)→Worker共有キャッシュ
  }).catch(function(e){return itViaWorker(term,lim);}); // 例外(iPhone遮断)→Worker
}
// かな(ひらがな/カタカナ)をローマ字化する。iTunesの日本語表記(例 はいよろこんで)を
// laut.fmのローマ字(Hai Yorokonde)と phonetic に突き合わせるため。漢字/ラテンはそのまま返す
// ＝発音一致した時だけ変換するので誤変換は起きない（漢字曲は従来どおり長さ一致に頼る）。
var KANA_YO={'きゃ':'kya','きゅ':'kyu','きょ':'kyo','しゃ':'sha','しゅ':'shu','しょ':'sho','ちゃ':'cha','ちゅ':'chu','ちょ':'cho','にゃ':'nya','にゅ':'nyu','にょ':'nyo','ひゃ':'hya','ひゅ':'hyu','ひょ':'hyo','みゃ':'mya','みゅ':'myu','みょ':'myo','りゃ':'rya','りゅ':'ryu','りょ':'ryo','ぎゃ':'gya','ぎゅ':'gyu','ぎょ':'gyo','じゃ':'ja','じゅ':'ju','じょ':'jo','びゃ':'bya','びゅ':'byu','びょ':'byo','ぴゃ':'pya','ぴゅ':'pyu','ぴょ':'pyo'};
var KANA_M={'あ':'a','い':'i','う':'u','え':'e','お':'o','か':'ka','き':'ki','く':'ku','け':'ke','こ':'ko','さ':'sa','し':'shi','す':'su','せ':'se','そ':'so','た':'ta','ち':'chi','つ':'tsu','て':'te','と':'to','な':'na','に':'ni','ぬ':'nu','ね':'ne','の':'no','は':'ha','ひ':'hi','ふ':'fu','へ':'he','ほ':'ho','ま':'ma','み':'mi','む':'mu','め':'me','も':'mo','や':'ya','ゆ':'yu','よ':'yo','ら':'ra','り':'ri','る':'ru','れ':'re','ろ':'ro','わ':'wa','を':'wo','ん':'n','が':'ga','ぎ':'gi','ぐ':'gu','げ':'ge','ご':'go','ざ':'za','じ':'ji','ず':'zu','ぜ':'ze','ぞ':'zo','だ':'da','ぢ':'ji','づ':'zu','で':'de','ど':'do','ば':'ba','び':'bi','ぶ':'bu','べ':'be','ぼ':'bo','ぱ':'pa','ぴ':'pi','ぷ':'pu','ぺ':'pe','ぽ':'po','ぁ':'a','ぃ':'i','ぅ':'u','ぇ':'e','ぉ':'o','ゃ':'ya','ゅ':'yu','ょ':'yo','ゎ':'wa','ー':''};
function kana2romaji(s){
  if(!s)return '';
  s=String(s).replace(/[ァ-ヶ]/g,function(c){return String.fromCharCode(c.charCodeAt(0)-0x60);}); // カタカナ→ひらがな
  var out='',i=0;
  while(i<s.length){
    var two=s.substr(i,2);
    if(KANA_YO[two]){out+=KANA_YO[two];i+=2;continue;}
    var c=s.charAt(i);
    if(c==='っ'){ var nx=s.substr(i+1,2), nr=KANA_YO[nx]||KANA_M[s.charAt(i+1)]||''; if(nr)out+=nr.charAt(0); i+=1;continue; } // 促音=次の子音を重ねる
    if(KANA_M[c]!=null){out+=KANA_M[c];i+=1;continue;}
    out+=c;i+=1; // 漢字・ラテン等はそのまま
  }
  return out;
}
// 日本語化キャッシュ: 一度でも変換に成功した曲を localStorage に保存し、以降はiTunesが403でも
// キャッシュから日本語表示する（＝一度日本語化したらローマ字に戻らない）。成功した正しい変換のみ保存。
var jpc={}; try{jpc=JSON.parse(localStorage.getItem('pjpc')||'{}')||{};}catch(e){jpc={};}
function jpcKey(title,artist){return jnorm(jclean(title)||title)+'|'+jnorm(artist);}
function jpcSave(title,artist,hit){
  try{
    var k=jpcKey(title,artist);
    jpc[k]={trackName:hit.trackName,artistName:hit.artistName,releaseDate:hit.releaseDate||''};
    var ks=Object.keys(jpc); if(ks.length>600){delete jpc[ks[0]];} // 肥大化防止
    localStorage.setItem('pjpc',JSON.stringify(jpc));
  }catch(e){}
}
// 同期キャッシュ参照: 既に日本語化に成功した曲は、初回描画からローマ字を挟まず日本語で出すために使う。
// 日本語(非ASCII)を含むキャッシュだけ返す＝誤変換や英語のままの記録は先出ししない（正しい日本語のみ）。
function jpCached(title,artist){var h=jpc[jpcKey(title,artist)];return (h&&/[^\x00-\x7F]/.test((h.trackName||'')+(h.artistName||'')))?h:null;}
// アーティスト名か曲名のどちらかが正規化一致した最初の結果を返す（ローマ字↔漢字/かなで片方しか一致しない曲に対応）。
// 見つからなければ、アーティスト欄が作品名等で汚れているケースを「曲名のみ＋長さ一致」で救済。一致なしはnull。
function jpFind(title,artist,durSec){
  var ct=jclean(title)||title, na=jnorm(artist), nt=jnorm(ct);
  if(!na&&!nt)return Promise.resolve(null);
  var ck=jpcKey(title,artist);
  if(jpc[ck])return Promise.resolve(jpc[ck]); // キャッシュ命中を最優先
  function fin(hit){ if(hit)jpcSave(title,artist,hit); return hit||null; }
  return itSearch(ct+' '+artist,10).then(function(rs){
    // 1) 曲の長さ一致(±4秒)を最優先。文字種に依存しないので、英語訳タイトル＋ローマ字名の
    //    アニメ曲(例 The Cruel Angel's Thesis→残酷な天使のテーゼ)も盤の尺違いを吸収して拾える。
    if(durSec){
      var dm=rs.filter(function(r){return r.trackTimeMillis&&Math.abs(r.trackTimeMillis/1000-durSec)<=4;});
      if(dm.length)return fin(dm[0]);
    }
    // 2) アーティスト名か曲名が一致する結果。直接の正規化一致に加え、iTunesの日本語表記(かな)を
    //    ローマ字化して laut のローマ字と phonetic に照合（例 はいよろこんで↔Hai Yorokonde /
    //    こっちのけんと↔Kocchi no Kento）。ローマ字経路は誤爆防止のため“完全一致”のみ採用。
    var tmatch=rs.filter(function(r){
      var ra=jnorm(r.artistName),rt=jnorm(r.trackName);
      var rar=jnorm(kana2romaji(r.artistName)),rtr=jnorm(kana2romaji(r.trackName));
      var am=na&&((ra&&(ra===na||ra.indexOf(na)>=0||na.indexOf(ra)>=0))||(rar&&rar===na));
      var tm=nt&&((rt&&(rt===nt||rt.indexOf(nt)>=0||nt.indexOf(rt)>=0))||(rtr&&rtr===nt));
      return am||tm;
    })[0];
    if(tmatch)return fin(tmatch);
    // 3) フォールバック: アーティスト欄が作品名(例 "Bleach")で汚れて上で拾えない曲を、
    //    「曲名のみ」で再検索。目的は“日本語版を見つける”ことなので、
    //    「長さ±2.5秒一致」かつ「日本語(非ASCII)を含む」結果が“1件だけ”の時のみ採用。
    //    （ASCIIだけの偶然一致＝無関係曲や複数該当は曖昧なので不採用＝ローマ字維持）。
    if(durSec&&ct){
      return itSearch(ct,15).then(function(rs2){
        var dm2=rs2.filter(function(r){
          if(!(r.trackTimeMillis&&Math.abs(r.trackTimeMillis/1000-durSec)<=2.5))return false;
          return /[^\x00-\x7F]/.test((r.trackName||'')+(r.artistName||''));
        });
        return fin(dm2.length===1?dm2[0]:null);
      });
    }
    return fin(null);
  });
}
// 再生中の局カード(BGM/邦楽)の「現在の曲」行を、ミニ/上と同じ内容に即時更新する
function setActiveCard(key,text){
  if(!key)return;
  document.querySelectorAll('.stn[data-laut="'+key+'"] [data-prog],.stn[data-soma="'+key+'"] [data-prog],.stn[data-worker="'+key+'"] [data-prog]')
    .forEach(function(el){el.textContent=text;});
}
// タイムアウト付きfetch（モバイル回線で接続がストールしたまま返らない対策）。
// 既定8秒で abort → reject。呼び出し側はリトライやフォールバックで固着を防ぐ。
function fetchT(url,ms){
  var ac=('AbortController' in window)?new AbortController():null;
  var to=ac?setTimeout(function(){try{ac.abort();}catch(e){}},ms||8000):0;
  return fetch(url,{cache:'no-store',signal:ac?ac.signal:undefined})
    .then(function(r){if(to)clearTimeout(to);return r;},function(e){if(to)clearTimeout(to);throw e;});
}
// SomaFMの現在曲（CORS:* 確認済）。{title,artist} か null。
function somaGet(id){
  return fetchT('https://somafm.com/songs/'+encodeURIComponent(id)+'.json',8000)
    .then(function(r){return r.json();})
    .then(function(d){var s=d&&d.songs&&d.songs[0];return (s&&s.title)?{title:s.title,artist:s.artist||''}:null;})
    .catch(function(){return null;});
}
// 自前Worker経由の現在曲。rp=JSON{artist,title,album,year}／natsu・hits=テキスト"Artist - Title"。
function workerGet(key){
  return fetchT(WORKER+'?s='+encodeURIComponent(key),8000).then(function(r){
    var ct=r.headers.get('content-type')||'';
    if(ct.indexOf('json')>=0){
      return r.json().then(function(d){
        return (d&&d.title)?{title:d.title,artist:d.artist||'',year:d.year||''}:null;
      });
    }
    return r.text().then(function(t){
      t=(t||'').trim(); if(!t)return null;
      var i=t.indexOf(' - ');
      return (i>0)?{title:t.slice(i+3).trim(),artist:t.slice(0,i).trim()}:{title:t,artist:''};
    });
  }).catch(function(){return null;});
}
// Worker局の日本語化（laut用jpLookupのWorker版。jpKeyで重複変換を防ぐ）
function jpLookupWorker(title,artist,wk){
  var key='w:'+title+'|'+artist; if(key===jpKey)return; jpKey=key;
  jpFind(title,artist).then(function(hit){
    if(wk!==curWorker||!hit)return;
    curMeta=hit;
    var jt=hit.trackName||title, ja=hit.artistName||artist;
    if(/[^\x00-\x7F]/.test(jt+ja)){
      curSong=jt+' — '+ja; refreshUI();
      var ym=fmtYM(hit.releaseDate,'');
      setActiveCard(wk,'♪ '+jt+' — '+ja+(ym?' ('+ym+')':''));
    }
  });
}
function jpLookup(title,artist,st,durSec){
  var key=title+'|'+artist; if(key===jpKey)return; jpKey=key;
  jpFind(title,artist,durSec).then(function(hit){
    if(st!==curLaut||!hit)return;
    curMeta=hit;
    var jt=hit.trackName||title, ja=hit.artistName||artist;
    if(/[^\x00-\x7F]/.test(jt+ja)){
      curSong=jt+' — '+ja; refreshUI();
      var ym=fmtYM(hit.releaseDate,'');
      setActiveCard(st,'♪ '+jt+' — '+ja+(ym?' ('+ym+')':''));
    }
  });
}
// LRC歌詞をパース → [{t:秒, text}] 昇順。行内に複数タイムタグがあれば各々展開。
function parseLRC(s){
  var out=[];
  (s||'').split('\n').forEach(function(line){
    var tags=line.match(/\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g);
    if(!tags)return;
    var text=line.replace(/\[[^\]]*\]/g,'').trim();
    tags.forEach(function(tag){
      var m=tag.match(/\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/);
      var t=(+m[1])*60+(+m[2])+(m[3]?parseFloat('0.'+m[3]):0);
      out.push({t:t,text:text});
    });
  });
  out.sort(function(a,b){return a.t-b.t;});
  return out;
}
// LRCLIB(無料・キー不要・CORS対応)から歌詞取得。まず厳密get→無ければsearch。
function lrcGet(title,artist){
  var b='https://lrclib.net/api/';
  return fetch(b+'get?artist_name='+encodeURIComponent(artist)+'&track_name='+encodeURIComponent(title),{cache:'no-store'})
    .then(function(r){return r.ok?r.json():null;})
    .then(function(d){
      if(d&&(d.syncedLyrics||d.plainLyrics))return d;
      return fetch(b+'search?q='+encodeURIComponent(title+' '+artist),{cache:'no-store'})
        .then(function(r){return r.json();})
        .then(function(a){return (a&&a.length)?a[0]:null;}).catch(function(){return null;});
    }).catch(function(){return null;});
}
function loadLyrics(){
  var box=document.getElementById('dlrc');
  var title=curTitle,artist=curArtist,key=title+'|'+artist;
  if(!title){box.innerHTML='<div class="lst">再生中の曲がありません</div>';lrcKey='';lrcLines=null;return;}
  if(key===lrcKey)return;
  lrcKey=key;lrcLines=null;
  box.innerHTML='<div class="lst">歌詞を取得中…</div>';
  lrcGet(title,artist).then(function(d){
    if(lrcKey!==key)return;
    if(d&&d.syncedLyrics){
      lrcLines=parseLRC(d.syncedLyrics);
      box.innerHTML=lrcLines.map(function(l,i){return '<div class="ll" data-i="'+i+'">'+esc(l.text||'　')+'</div>';}).join('');
    }else if(d&&d.plainLyrics){
      lrcLines=null;
      box.innerHTML=d.plainLyrics.split('\n').map(function(t){return '<div class="ll">'+esc(t||'　')+'</div>';}).join('');
    }else{
      lrcLines=null;
      box.innerHTML='<div class="lst">歌詞が見つかりませんでした（下の「歌詞を検索」から確認できます）</div>';
    }
  });
}
// モーダル表示中に曲が変わったら、ヘッダーと歌詞を更新する（カラオケ同期は行わない）。
function lrcTick(){
  if((curTitle+'|'+curArtist)!==lrcKey){if(curTitle)fillDetail();loadLyrics();}
}
// リリース年月の整形（iTunesのreleaseDate優先、無ければlautのreleaseyear）
function fmtYM(iso,yr){
  if(iso&&iso.length>=7)return iso.slice(0,4)+'年'+String(+iso.slice(5,7))+'月';
  if(yr)return yr+'年';
  return '';
}
// 邦楽ネットラジオ各局の「現在の曲名・アーティスト・リリース年(月)」を局カードに表示
var radioSongsAt=0;
var songLoadAt={};
// 指定セクション(#sec-bgm / #sec-radio)の各局カードに「現在の曲」を表示。
// laut.fm→current_song(＋iTunes日本語補正)、SomaFM→songs.json。
// タイムアウト＋リトライ付きにして、モバイルで接続がストールしてもカードが
// 「選曲を取得中…」のまま固着しないようにする（失敗時は再取得可能な文言にする）。
function loadOneLaut(name,el,tries){
  fetchT('https://api.laut.fm/station/'+encodeURIComponent(name)+'/current_song',8000)
    .then(function(r){return r.json();})
    .then(function(d){
      if(!d||!d.title){el.textContent='選曲情報なし';return;}
      var an=d.artist&&d.artist.name?d.artist.name:'';
      // キャッシュ命中曲は最初から日本語で表示（ローマ字のちらつき防止）。未命中はローマ字→下のjpFindで差替。
      var lc=jpCached(d.title,an);
      if(lc){var lym=fmtYM(lc.releaseDate,d.releaseyear);el.textContent='♪ '+(lc.trackName||d.title)+((lc.artistName||an)?' — '+(lc.artistName||an):'')+(lym?' ('+lym+')':'');}
      else el.textContent='♪ '+d.title+(an?' — '+an:'')+(d.releaseyear?' ('+d.releaseyear+'年)':'');
      jpFind(d.title,an,d.length).then(function(hit){
        if(!hit)return;
        var jt=hit.trackName||d.title, ja=hit.artistName||an, ym=fmtYM(hit.releaseDate,d.releaseyear);
        el.textContent='♪ '+jt+(ja?' — '+ja:'')+(ym?' ('+ym+')':'');
      });
    }).catch(function(err){
      if(tries<2){setTimeout(function(){loadOneLaut(name,el,tries+1);},2500*(tries+1));}
      else{el.textContent='選曲情報を取得できません（タップ再生で再取得）';}
    });
}
function loadOneSoma(id,el,tries){
  somaGet(id).then(function(s){
    if(s){el.textContent='♪ '+s.title+(s.artist?' — '+s.artist:'');}
    else if(tries<2){setTimeout(function(){loadOneSoma(id,el,tries+1);},2500*(tries+1));}
    else{el.textContent='選曲情報を取得できません（タップ再生で再取得）';}
  });
}
function loadOneWorker(key,el,tries){
  workerGet(key).then(function(s){
    if(!s||!s.title){
      if(tries<2){setTimeout(function(){loadOneWorker(key,el,tries+1);},2500*(tries+1));}
      else{el.textContent='選曲情報を取得できません（タップ再生で再取得）';}
      return;
    }
    // キャッシュ命中曲は最初から日本語で表示（ちらつき防止）。未命中はローマ字→下のjpFindで差替。
    var wc=jpCached(s.title,s.artist);
    if(wc){var wym=fmtYM(wc.releaseDate,s.year);el.textContent='♪ '+(wc.trackName||s.title)+((wc.artistName||s.artist)?' — '+(wc.artistName||s.artist):'')+(wym?' ('+wym+')':'');}
    else el.textContent='♪ '+s.title+(s.artist?' — '+s.artist:'');
    // 邦楽(懐メロ/ヒット)は日本語化を試みる。RP(洋楽)は基本英語のまま。
    jpFind(s.title,s.artist).then(function(hit){
      if(!hit)return;
      var jt=hit.trackName||s.title, ja=hit.artistName||s.artist, ym=fmtYM(hit.releaseDate,s.year);
      if(/[^\x00-\x7F]/.test(jt+ja))el.textContent='♪ '+jt+(ja?' — '+ja:'')+(ym?' ('+ym+')':'');
    });
  });
}
function loadStationSongs(sel){
  var t=+new Date(); if(t-(songLoadAt[sel]||0)<60000){return;} songLoadAt[sel]=t;
  document.querySelectorAll(sel+' .stn[data-laut],'+sel+' .stn[data-soma],'+sel+' .stn[data-worker]').forEach(function(b){
    var el=b.querySelector('[data-prog]'); if(!el)return;
    // 保険(watchdog): どんな不具合(fetchが最後まで返らない等)でも「選曲を取得中…」が
    // 残り続けないよう、10秒後に取得中のままなら案内文へ切替。以降のリトライ成功時は曲名で上書きされる。
    (function(e){setTimeout(function(){if(e.textContent==='選曲を取得中…'){e.textContent='選曲情報を取得できません（タップ再生で再取得）';}},10000);})(el);
    if(b.dataset.laut){loadOneLaut(b.dataset.laut,el,0);}
    else if(b.dataset.soma){loadOneSoma(b.dataset.soma,el,0);}
    else if(b.dataset.worker){loadOneWorker(b.dataset.worker,el,0);}
  });
}
function loadRadioStationSongs(){loadStationSongs('#sec-radio');}
// NHKらじる各局の現在番組名・出演者を取得して表示（NHK now-on-air API, CORS:* 確認済）
var nhkAt=0;
function nhkHM(dt){return ('0'+dt.getHours()).slice(-2)+':'+('0'+dt.getMinutes()).slice(-2);}
function loadNhkPrograms(){
  var t=+new Date(); if(t-nhkAt<60000)return; nhkAt=t;
  var cards=document.querySelectorAll('.rcard[data-nhk]');
  var areas={};
  cards.forEach(function(c){(areas[c.dataset.narea]=areas[c.dataset.narea]||[]).push(c);});
  Object.keys(areas).forEach(function(area){
    fetch('https://api.nhk.jp/r8/pg/now/radio/'+area+'/now.json',{cache:'no-store'})
      .then(function(r){return r.json();})
      .then(function(d){
        var ms=Date.now();
        areas[area].forEach(function(c){
          var el=c.querySelector('[data-prog]');
          var ch=d[c.dataset.nhk], pub=ch&&ch.publication;
          if(!pub||!pub.length){el.textContent='番組情報なし';return;}
          var cur=pub.filter(function(it){
            return new Date(it.startDate).getTime()<=ms&&ms<=new Date(it.endDate).getTime();
          })[0]||pub[0];
          var acts=((cur.misc&&cur.misc.actList)||[]).map(function(a){return (a.role?a.role+':':'')+a.name;}).join('／');
          var s=new Date(cur.startDate),e=new Date(cur.endDate);
          el.textContent='▶ '+nhkHM(s)+'-'+nhkHM(e)+' '+(cur.name||'')+(acts?' ／ '+acts:'');
        });
      }).catch(function(){
        areas[area].forEach(function(c){
          c.querySelector('[data-prog]').textContent='番組取得に失敗（上の「🔄 番組・選曲を再取得」で再試行）';
        });
      });
  });
}
// laut.fmの時刻 "2026-07-04 09:05:24 +0200" → ミリ秒。曲の終了時刻から次曲を取りに行く時刻を決める。
function npTS(s){
  var m=s&&s.match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})\s*([+-]\d{2})(\d{2})/);
  return m?(Date.parse(m[1]+'-'+m[2]+'-'+m[3]+'T'+m[4]+':'+m[5]+':'+m[6]+m[7]+':'+m[8])||0):0;
}
var npEndTimer=null;
function nowPlaying(){
  if(audio.paused)return;
  if(curWorker){nowPlayingWorker();return;}
  if(curSoma){nowPlayingSoma();return;}
  if(!curLaut)return;
  var st=curLaut;
  fetch('https://api.laut.fm/station/'+encodeURIComponent(st)+'/current_song',{cache:'no-store'})
    .then(function(r){return r.json();})
    .then(function(d){
      if(st!==curLaut)return;
      if(d&&d.title){
        var an=d.artist&&d.artist.name?d.artist.name:'';
        // 曲が実際に変わった時だけ作り直す（同じ曲の再取得でローマ字に戻さない＝日本語表示を保持）
        if(d.title!==curTitle||an!==curArtist){
          curTitle=d.title; curArtist=an;
          // キャッシュ命中曲は初回描画からローマ字を挟まず日本語で出す（ちらつき防止）。未命中は従来どおり。
          var cj=jpCached(d.title,an);
          curMeta=cj||null;
          curSong=cj?((cj.trackName||d.title)+' — '+(cj.artistName||an)):(d.title+(an?' — '+an:''));
          var parts=[];
          if(d.album&&d.album!==d.title)parts.push(d.album);
          if(d.releaseyear)parts.push(String(d.releaseyear));
          if(d.genre)parts.push(d.genre);
          curDetail=parts.join(' ・ ');
          refreshUI();
          // 再生中の局カード(上)も、ミニと同時に即更新（キャッシュ命中なら日本語＋年で出す）
          if(cj){var cym=fmtYM(cj.releaseDate,'');setActiveCard(st,'♪ '+(cj.trackName||d.title)+' — '+(cj.artistName||an)+(cym?' ('+cym+')':''));}
          else setActiveCard(st,'♪ '+d.title+(an?' — '+an:'')+(d.releaseyear?' ('+d.releaseyear+'年)':''));
          jpLookup(d.title,an,st,d.length);
        }
        // 曲の終了直後に自動で次曲を取りに行く（切替を素早く反映）
        if(npEndTimer)clearTimeout(npEndTimer);
        var left=npTS(d.ends_at)-Date.now();
        if(left>0&&left<10*60*1000){npEndTimer=setTimeout(function(){if(st===curLaut)nowPlaying();},left+2500);}
      }else{curSong='';curDetail='';curTitle='';curArtist='';curMeta=null;refreshUI();}
    }).catch(function(){});
}
// SomaFM局の現在曲を上部プレーヤー/ミニ/カードに反映
function nowPlayingSoma(){
  var sm=curSoma;
  somaGet(sm).then(function(s){
    if(sm!==curSoma)return;
    if(s&&(s.title!==curTitle||s.artist!==curArtist)){
      curMeta=null; curTitle=s.title; curArtist=s.artist;
      curSong=s.title+(s.artist?' — '+s.artist:''); curDetail='';
      refreshUI();
      setActiveCard(sm,'♪ '+curSong);
    }else if(!s){ curSong=''; refreshUI(); }
  });
}
// Worker経由局(RP/懐メロ/邦楽ヒット)の現在曲を上部/ミニ/カードに反映（curTitleはローマ字保持し日本語化はjpLookupWorkerで上書き）
function nowPlayingWorker(){
  var wk=curWorker;
  workerGet(wk).then(function(s){
    if(wk!==curWorker)return;
    if(s&&s.title&&(s.title!==curTitle||s.artist!==curArtist)){
      curTitle=s.title; curArtist=s.artist; curDetail='';
      // キャッシュ命中曲は初回描画から日本語で出す（ちらつき防止）。未命中は従来どおりローマ字→後で差替。
      var cjw=jpCached(s.title,s.artist);
      curMeta=cjw||null;
      curSong=cjw?((cjw.trackName||s.title)+' — '+(cjw.artistName||s.artist)):(s.title+(s.artist?' — '+s.artist:''));
      refreshUI();
      if(cjw){var cywm=fmtYM(cjw.releaseDate,'');setActiveCard(wk,'♪ '+curSong+(cywm?' ('+cywm+')':''));}
      else setActiveCard(wk,'♪ '+curSong);
      jpLookupWorker(s.title,s.artist,wk);
    }else if(!s){ curSong=''; refreshUI(); }
  });
}
setInterval(nowPlaying,15000);
// iOSのPWAはバックグラウンドでfetch/タイマーを凍結・破棄するため、「選曲を取得中…」で
// 固着することがある。アプリに戻った時(visibilitychange)に、表示中タブの選曲取得をやり直す。
function reloadActiveSongs(src){
  var a=document.querySelector('.tab.active'), id=a?a.dataset.t:'';
  if(id==='bgm'){songLoadAt['#sec-bgm']=0;try{loadStationSongs('#sec-bgm');}catch(e){}}
  else if(id==='radio'){songLoadAt['#sec-radio']=0;try{loadRadioStationSongs();}catch(e){}}
}
document.addEventListener('visibilitychange',function(){
  if(document.hidden){return;}
  reloadActiveSongs('visible');
  if(!audio.paused)nowPlaying();
});
// 初回表示＋iOSのbfcache復帰でも必ず選曲取得を起動する（初期化時に取得が走らず固着する対策）
window.addEventListener('pageshow',function(){reloadActiveSongs('pageshow');});
// ライブ配信は一時停止すると停止位置から再開し、実時刻とズレて曲が途中で切れる。
// 再開時はストリームを開き直して“今の放送位置(ライブ)”から鳴らす。
function resumeLive(){
  var u=audio.src; if(!u)return;
  audio.src=u; audio.load(); audio.play().catch(function(){});
}
function playStation(url,name){
  try{stopTv();}catch(e){}
  if(audio.src===url){ if(audio.paused){resumeLive();}else{audio.pause();} return; }
  audio.src=url; curName=name;
  audio.play().catch(function(){});
  document.querySelectorAll('.stn').forEach(function(b){b.classList.toggle('active',b.dataset.url===url);});
  var act=document.querySelector('.stn.active');
  curLaut=act?(act.dataset.laut||''):''; curSoma=act?(act.dataset.soma||''):''; curWorker=act?(act.dataset.worker||''):'';
  curSong='';curDetail='';jpKey='';
  curTitle='';curArtist='';curMeta=null;lrcKey='';lrcLines=null;
  refreshUI();
  if(curLaut||curSoma||curWorker)nowPlaying();
}
document.querySelectorAll('.stn').forEach(function(b){
  b.addEventListener('click',function(){playStation(b.dataset.url,b.dataset.name);});
});
pp.addEventListener('click',function(){
  if(!audio.src){var f=document.querySelector('.stn'); if(f){playStation(f.dataset.url,f.dataset.name);} return;}
  if(audio.paused){resumeLive();}else{audio.pause();}
});
mpp.addEventListener('click',function(){ if(audio.paused){resumeLive();}else{audio.pause();} });
audio.addEventListener('play',refreshUI);
audio.addEventListener('pause',refreshUI);
audio.addEventListener('error',function(){nps.textContent='この局に接続できませんでした。別の局をお試しください';});

// 曲の詳細パネル（下の曲名タップで開く）。詳細はiTunes(日本)から、歌詞は著作権のため外部検索リンク。
var detail=document.getElementById('detail'),prev=document.getElementById('prev');
function fillDetail(){
  var m=curMeta;
  var art=document.getElementById('dart');
  if(m&&m.artworkUrl100){art.src=m.artworkUrl100.replace('100x100','300x300');art.classList.add('on');}
  else{art.classList.remove('on');art.removeAttribute('src');}
  var jt=(m&&m.trackName)?m.trackName:curTitle;
  var ja=(m&&m.artistName)?m.artistName:curArtist;
  document.getElementById('dttl').textContent='';   // 曲名は下のラベル付き行に統一（大見出しの重複を避ける）
  document.getElementById('dsub').textContent='';
  var meta=[];
  meta.push('曲名: '+jt);
  if(ja)meta.push('アーティスト名: '+ja);
  if(m&&m.releaseDate)meta.push('リリース: '+fmtYM(m.releaseDate,''));  // 〇〇年〇〇月
  if(m&&m.collectionName)meta.push('アルバム: '+m.collectionName);
  meta.push('ジャンル: '+curName);
  document.getElementById('dmeta').innerHTML=meta.map(esc).join('<br>');
  var dprev=document.getElementById('dprev');
  if(m&&m.previewUrl){dprev.style.display='';prev.src=m.previewUrl;dprev.textContent='▶ 試聴(30秒)';}
  else{dprev.style.display='none';}
  var qbase=(curArtist?curArtist+' ':'')+curTitle;
  document.getElementById('dlyric').href='https://www.google.com/search?q='+encodeURIComponent(qbase+' 歌詞');
  // YouTube検索（無料・サブスク不要でその曲を再生できる）
  document.getElementById('dyt').href='https://www.youtube.com/results?search_query='+encodeURIComponent(qbase);
  // Apple Music: 実在の曲ページ(trackViewUrl)に必ず飛ばす。無い場合はiTunesで曲を引いてから設定し、
  // それでも無ければ検索ではなくYouTubeへ（Apple側の“ライブラリが開くだけ”を防ぐ）。
  var ap=document.getElementById('dapple'), who=qbase;
  if(m&&m.trackViewUrl){ap.href=m.trackViewUrl;ap.style.display='';}
  else{
    ap.style.display='none';
    appleLink(curTitle,curArtist).then(function(u){
      if(who!==(curArtist?curArtist+' ':'')+curTitle)return;
      if(u){ap.href=u;ap.style.display='';}
    });
  }
}
// iTunes(日本)で曲を引き、実在の Apple Music 曲ページURL(trackViewUrl)を返す。無ければnull。
function appleLink(title,artist){
  // itDo経由に統一(直→warm→Worker共有キャッシュ)。iPhoneでもキャッシュ命中すればApple Musicリンクが出る。
  return itDo((artist?artist+' ':'')+title,1).then(function(rs){var r=rs&&rs[0];return r&&r.trackViewUrl?r.trackViewUrl:null;}).catch(function(){return null;});
}
function openDetail(){
  if(!curTitle){return;}
  fillDetail();
  detail.classList.add('on');
  lrcKey='';loadLyrics();
  if(lrcTimer)clearInterval(lrcTimer);
  lrcTimer=setInterval(lrcTick,3000);
}
function closeDetail(){detail.classList.remove('on');prev.pause();if(lrcTimer){clearInterval(lrcTimer);lrcTimer=null;}}
document.getElementById('mname').addEventListener('click',openDetail);
document.querySelector('.mini .minfo').addEventListener('click',openDetail);
document.getElementById('dclose').addEventListener('click',closeDetail);
detail.addEventListener('click',function(e){if(e.target===detail)closeDetail();});
document.getElementById('dprev').addEventListener('click',function(){
  if(prev.paused){audio.pause();prev.play().catch(function(){});this.textContent='❚❚ 試聴中';}
  else{prev.pause();this.textContent='▶ 試聴(30秒)';}
});
prev.addEventListener('ended',function(){document.getElementById('dprev').textContent='▶ 試聴(30秒)';});

// 最新更新（SWの更新確認→新規ナビゲーションで最新取得）。
// iOSのPWAは location.reload() 後に fetch が凍結する既知バグ(WebKit 211018/iOS17)があるため、
// リロードではなく「キャッシュ回避クエリ付きの新規ナビゲーション」にする（新規オープンと同じ挙動＝固着しない）。
function pulseReload(){try{location.replace(location.pathname+'?r='+(+new Date()));}catch(e){location.reload();}}
document.getElementById('refresh').addEventListener('click',function(){
  this.textContent='⏳ 更新中';
  var done=function(){pulseReload();};
  if('serviceWorker' in navigator){
    navigator.serviceWorker.getRegistration().then(function(r){
      if(r){try{r.update();}catch(e){}}
      done();
    }).catch(done);
  }else{done();}
});

// 新しい版が届いたことを右上のボタンで知らせる（自動では遷移しない）。
function markUpdateAvailable(){
  var b=document.getElementById('refresh');
  if(!b||b.classList.contains('upd'))return;
  b.classList.add('upd');
  // 通常時の「🔄 最新更新」と同じ字数に収める（長くすると右上でヘッダーの
  // 「最終 mm/dd hh:mm」に覆いかぶさる）
  b.textContent='🆕 新着あり';
  b.setAttribute('title','新しいニュース・相場が届いています。押すと最新の内容に切り替わります');
}
if('serviceWorker' in navigator){
  // 以前は新しいSWが制御を奪った時点でページを自動リロードしていたが、30分ごとに
  // 再生成しているため、ラジオ/BGM/テレビの再生中に音が切れ、読んでいた記事の位置も
  // 失われていた。自動遷移はやめ、更新するかどうかの判断は利用者に委ねる。
  // 初回訪問では、読み込み時点でまだ controller が無く、SWが登録・有効化された直後に
  // 1回目の controllerchange が来る。これは「更新」ではないので、その1回だけ読み飛ばす
  // （読み込み時のcontroller有無だけで判定すると、初回訪問のセッションは以後ずっと
  //   更新を検知できなくなる）。
  var swInitialClaim=!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange',function(){
    if(swInitialClaim){swInitialClaim=false;return;}
    markUpdateAvailable();
  });
  window.addEventListener('load',function(){
    // updateViaCache:'none' でブラウザは常に最新の sw.js を取りに行く（更新の取りこぼしを防ぐ）
    navigator.serviceWorker.register('sw.js',{updateViaCache:'none'}).then(function(reg){
      reg.update();
      setInterval(function(){reg.update();},15*60*1000); // 15分ごとに更新確認
      // 画面が再表示されたとき（PWA復帰・タブ切替）にも更新確認する
      document.addEventListener('visibilitychange',function(){if(!document.hidden){reg.update();}});
    }).catch(function(){});
  });
}