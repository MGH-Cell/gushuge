// 构建单文件版 gushuge.html：11 个页面以内嵌 srcdoc iframe 方式装入一个 HTML
// 运行：node build-single.mjs
// 原理：每个页面在独立 iframe(srcdoc) 中运行，JS 作用域零冲突；
//       注入引导脚本负责 ① 页面间跳转改走外层 hash 路由 ② localStorage 与外层统一共享
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PAGES = ['index','xiaoshitan','taohuayuan','loushiming','ailianshuo','chengtiansi','sanxia','dazhongshushu','baitifang','wenjian','wenmai','wanjuan','shequ','mine','bang'];

// 注入到每个页面 <head> 最前面（早于页面自身所有脚本执行）
const BOOT = `<script>
(function(){
  /* ① 页面跳转：JS 里的 $g(...) 与所有指向 *.html 的链接，统一交外层路由 */
  function $g(u){ try{ parent.postMessage({go:String(u)},'*'); }catch(e){ location.href=u; } }
  window.$g=$g;
  document.addEventListener('click',function(e){
    var a=e.target&&e.target.closest&&e.target.closest('a[href]');
    if(!a)return;
    var h=a.getAttribute('href')||'';
    if(/^[a-zA-Z0-9_\\u4e00-\\u9fa5-]+\\.html(?:[?#].*)?$/.test(h)){
      e.preventDefault(); e.stopPropagation(); $g(h.split(/[?#]/)[0]);
    }
  },true);
  /* ② 存储共享：探测本 iframe 的 localStorage 是否与父页同一份；
        不共享（部分浏览器 file:// 下 srcdoc 为独立 opaque 存储）时代理到父页存储 */
  try{
    var K='__ls_probe__', V=String(Date.now())+Math.random();
    localStorage.setItem(K,V);
    var same = !(parent && parent!==window && parent.__gushiStore && parent.__gushiStore.getItem(K)!==V);
    localStorage.removeItem(K);
    if(!same){ Object.defineProperty(window,'localStorage',{configurable:true,value:parent.__gushiStore}); }
  }catch(err){
    var fb=(parent&&parent.__gushiStore)||{getItem:function(){return null;},setItem:function(){},removeItem:function(){},clear:function(){},key:function(){return null;},length:0};
    try{ Object.defineProperty(window,'localStorage',{configurable:true,value:fb}); }catch(e){}
  }
})();
<\/script>`;

const map = {};
for (const name of PAGES) {
  let html = fs.readFileSync(path.join(ROOT, name + '.html'), 'utf8');
  // 首页卷轴古画内嵌为 base64 data URI（单文件版无外部资源可引）
  if (name === 'index') {
    const artDir = path.join(ROOT, 'assets', 'scrolls');
    html = html.replace(/assets\/scrolls\/([a-z0-9_-]+\.jpg)/gi, (m, f) => {
      try { return 'data:image/jpeg;base64,' + fs.readFileSync(path.join(artDir, f)).toString('base64'); }
      catch (e) { return m; }
    });
  }
  // JS 跳转改走路由：location.href=expr;  ->  $g(expr);
  html = html.replace(/location\.href\s*=\s*([^;]+);/g, '$g($1);');
  // 注入引导脚本
  if (/<head[^>]*>/i.test(html)) html = html.replace(/<head[^>]*>/i, m => m + BOOT);
  else html = BOOT + html;
  map[name] = html;
}

// JSON 字符串字面量；把所有 </ 转成 <\/，防止内层 </script> 提前闭合外层脚本块
const pagesJson = JSON.stringify(map).replace(/<\//g, '<\\/');

const shell = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>古书阁 · 古诗文学习平台</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 64 64'%3E%3Crect width='64' height='64' rx='9' fill='%23a8412e'/%3E%3Ctext x='32' y='45' font-size='38' text-anchor='middle' fill='%23fbeeda' font-family='serif'%3E阁%3C/text%3E%3C/svg%3E">
<style>
  *{margin:0;padding:0;box-sizing:border-box;}
  html,body{height:100%;overflow:hidden;background:#f2ead7;}
  #frame{position:fixed;inset:0;width:100%;height:100%;border:0;background:#f2ead7;}
  #veil{position:fixed;inset:0;z-index:9;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;
    background:linear-gradient(180deg,#f6efdd 0%,#f1e8d3 52%,#e9dfc7 100%);
    font-family:"KaiTi","STKaiti","楷体",serif;color:#7a6c52;letter-spacing:.5em;
    transition:opacity .35s ease;}
  #veil.hide{opacity:0;pointer-events:none;}
  #veil .seal{width:54px;height:54px;border-radius:7px;background:#a8412e;color:#fbeeda;font-size:1.7rem;
    display:flex;align-items:center;justify-content:center;
    box-shadow:inset 0 0 0 2px rgba(251,238,218,.45);animation:beat 1.4s ease-in-out infinite;}
  #veil .txt{font-size:1.05rem;}
  @keyframes beat{0%,100%{transform:rotate(-4deg) scale(1);}50%{transform:rotate(-4deg) scale(1.08);}}
</style>
</head>
<body>
<iframe id="frame" title="古书阁"></iframe>
<div id="veil"><div class="seal">阁</div><div class="txt">展 卷 中</div></div>
<script>
var PAGES = ${pagesJson};
var frame=document.getElementById('frame'), veil=document.getElementById('veil');

/* 外层统一存储：file:// 下个别浏览器禁用 localStorage 时退化为内存存储（当次可用） */
var __gushiStore=(function(){
  try{ localStorage.setItem('__t','1'); localStorage.removeItem('__t'); return localStorage; }
  catch(e){
    var m={};
    return {getItem:function(k){return k in m?m[k]:null;},setItem:function(k,v){m[k]=String(v);},
      removeItem:function(k){delete m[k];},clear:function(){m={};},
      key:function(i){return Object.keys(m)[i]||null;},get length(){return Object.keys(m).length;}};
  }
})();

function curPage(){
  var mm=(location.hash||'').match(/^#\\/([a-zA-Z0-9_\\u4e00-\\u9fa5-]+)/);
  var n=mm?mm[1]:'index';
  return PAGES[n]?n:'index';
}
var lastPage=null;
function route(){
  var n=curPage();
  if(n===lastPage) return;
  lastPage=n;
  veil.classList.remove('hide');
  frame.srcdoc=PAGES[n];
}
frame.addEventListener('load',function(){
  veil.classList.add('hide');
  try{ var t=frame.contentDocument&&frame.contentDocument.title; if(t)document.title=t; }catch(e){}
});
window.addEventListener('hashchange',route);
/* 子页跳转消息 */
window.addEventListener('message',function(e){
  if(e.data&&e.data.go){
    var n=String(e.data.go).replace(/\\.html$/,'');
    if(PAGES[n]) location.hash='#/'+n;
  }
});
route();
<\/script>
</body>
</html>`;

fs.writeFileSync(path.join(ROOT, 'gushuge.html'), shell, 'utf8');
const kb = Math.round(Buffer.byteLength(shell, 'utf8') / 1024);
console.log('OK gushuge.html  pages=' + PAGES.length + '  size=' + kb + 'KB');
