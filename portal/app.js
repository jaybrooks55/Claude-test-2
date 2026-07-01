"use strict";
/* ============================================================
   REVLAR ANALYST PORTAL — application logic
   Static, no build step. Only external dependency is the
   Supabase JS client (loaded in index.html from its CDN).

   CONFIG — paste your real values here.
   The publishable (anon) key is safe to be public.
   NEVER put a service-role key in this file.
   ============================================================ */
var SUPABASE_URL = "https://etzdbktxjjgnojirkpso.supabase.co";
var SUPABASE_PUBLISHABLE_KEY = "sb_publishable_J2llDj6tR1DUDyYAIi9bsg_sCSjBFIV";
var STORAGE_BUCKET = "case-files";
// Edge Function names in your Supabase project.
var DETECTION_FUNCTION = "super-api";      // runs Hive / Resemble / AI, returns verdict + score
var REPORT_FUNCTION = "generate-report";   // builds the court-ready PDF

(function(){
  /* ---------- runtime mode ---------- */
  var CONFIGURED = SUPABASE_URL.indexOf("YOUR_SUPABASE_URL") === -1 &&
                   SUPABASE_PUBLISHABLE_KEY.indexOf("YOUR_SUPABASE") === -1 &&
                   typeof window.supabase !== "undefined";
  var DEMO = !CONFIGURED;
  var sb = null;
  if (CONFIGURED) {
    try { sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY); }
    catch (e) { DEMO = true; }
  }

  var state = {
    user: null,
    loading: false,
    cases: [], clients: [], activity: [],
    caseId: null,
    profile: { name:"Analyst", role:"Verification Analyst" },
    density: "comfortable",
    notesTimer: null,
    accessToken: null,
    paletteSel: 0, paletteList: []
  };

  /* ---------- helpers ---------- */
  function $(id){ return document.getElementById(id); }
  function el(html){ var t=document.createElement("template"); t.innerHTML=html.trim(); return t.content.firstElementChild; }
  function esc(s){
    var map={ "&":"&amp;", "<":"&lt;", ">":"&gt;" };
    map['"']="&quot;"; map["'"]="&#39;";
    return String(s==null?"":s).replace(/[&<>"']/g, function(c){ return map[c]; });
  }
  function fmtMoney(n){ return "$"+Number(n||0).toLocaleString("en-US"); }
  function fmtDate(d){ if(!d) return "—"; var dt=new Date(d); return isNaN(dt.getTime())?String(d):dt.toLocaleDateString("en-US",{ year:"numeric", month:"short", day:"numeric" }); }
  function fmtTime(d){ var dt=new Date(d||Date.now()); return dt.toLocaleString("en-US",{ month:"short", day:"numeric", hour:"numeric", minute:"2-digit" }); }
  function timeAgo(d){ var s=Math.floor((Date.now()-new Date(d).getTime())/1000); if(isNaN(s)) return "";
    if(s<60) return s+"s ago"; if(s<3600) return Math.floor(s/60)+"m ago"; if(s<86400) return Math.floor(s/3600)+"h ago"; return Math.floor(s/86400)+"d ago"; }

  var ICONS = {
    dashboard:'<path d="M3 13h8V3H3zM13 21h8V3h-8zM3 21h8v-6H3z"/>',
    submit:'<path d="M12 5v14M5 12h14"/>',
    cases:'<path d="M3 7h18M3 12h18M3 17h18"/>',
    clients:'<path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>',
    activity:'<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
    settings:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>',
    check:'<path d="M20 6L9 17l-5-5"/>',
    lock:'<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>',
    download:'<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
    clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>',
    money:'<path d="M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>',
    back:'<path d="M19 12H5M11 18l-6-6 6-6"/>',
    copy:'<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>',
    search:'<circle cx="11" cy="11" r="8"/><path d="M21 21l-4.3-4.3"/>',
    image:'<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>',
    audio:'<path d="M3 10v4h4l5 5V5L7 10H3zM16 8a5 5 0 010 8"/>',
    video:'<rect x="2" y="5" width="14" height="14" rx="2"/><path d="M22 8l-6 4 6 4z"/>',
    file:'<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/>'
  };
  function icon(name,w){ w=w||18; return '<svg viewBox="0 0 24 24" width="'+w+'" height="'+w+'" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'+(ICONS[name]||"")+'</svg>'; }
  function typeIcon(t){ return t==="audio"?"audio":(t==="video"?"video":"image"); }

  function toast(msg,isErr){
    var t=$("toast"); t.className="toast show"+(isErr?" err":"");
    var ic = isErr ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>'
                   : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>';
    t.innerHTML = ic+"<span>"+esc(msg)+"</span>";
    clearTimeout(toast._t); toast._t=setTimeout(function(){ t.className="toast"; }, 3000);
  }

  function copyText(text){
    function done(){ toast("Copied to clipboard."); }
    if (navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(text).then(done).catch(fallback);
    } else { fallback(); }
    function fallback(){
      try{ var ta=document.createElement("textarea"); ta.value=text; ta.style.position="fixed"; ta.style.opacity="0";
        document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove(); done(); }
      catch(e){ toast("Could not copy.", true); }
    }
  }

  /* ============================================================
     DATA LAYER
     ============================================================ */
  function clientRef(){ var y=new Date().getFullYear(); return "RV-"+y+"-"+String(state.cases.length+1).padStart(4,"0"); }
  function nextRef(){
    if(!DEMO && sb){
      return sb.rpc("next_case_reference").then(function(r){ return (r && !r.error && r.data) ? r.data : clientRef(); }).catch(function(){ return clientRef(); });
    }
    return Promise.resolve(clientRef());
  }

  var DB = {
    loadAll: function(){
      if (DEMO){ seedDemo(); return Promise.resolve(); }
      return Promise.all([
        sb.from("cases").select("*").order("created_at",{ ascending:false }),
        sb.from("clients").select("*"),
        sb.from("activity_log").select("*").order("created_at",{ ascending:false }).limit(100)
      ]).then(function(res){
        state.cases    = (res[0] && res[0].data) || [];
        state.clients  = (res[1] && res[1].data) || [];
        state.activity = (res[2] && res[2].data) || [];
      });
    },
    createCase: function(c){
      if (DEMO){ c.id="demo-"+Date.now(); state.cases.unshift(c); return Promise.resolve(c); }
      return sb.from("cases").insert(c).select().single().then(function(r){ if(r.error) throw r.error; state.cases.unshift(r.data); return r.data; });
    },
    updateCase: function(id,patch){
      var local=getCase(id); if(local) Object.keys(patch).forEach(function(k){ local[k]=patch[k]; });
      if (DEMO) return Promise.resolve(local);
      return sb.from("cases").update(patch).eq("id",id).then(function(r){ if(r.error) throw r.error; return local; });
    },
    addActivity: function(a){
      a.created_at=a.created_at||new Date().toISOString();
      state.activity.unshift(a);
      if (DEMO) return Promise.resolve(a);
      return sb.from("activity_log").insert(a).then(function(){ return a; });
    }
  };

  function seedDemo(){
    var now=Date.now();
    state.clients=[{id:"c1",name:"Tribune Newsroom"},{id:"c2",name:"Harris County DA"},{id:"c3",name:"Meridian Insurance"},{id:"c4",name:"First Coastal Bank"}];
    state.cases=[
      {id:"d1",reference:"RV-2026-0007",client:"First Coastal Bank",type:"audio",urgency:"rush",analyst:"You",created_at:new Date(now-1*36e5).toISOString(),status:"In Progress",verdict:"MANIPULATED",score:93,analyst_verdict:null,analyst_verdict_reason:"",file_hash:"3a7bd3e2360a3d29eea436fcfb7e44c735d117c42d1c1835420b6b9942dd4f1b",file_path:"cases/RV-2026-0007/wire-auth.wav",notes:"Caller voice shows synthesis artifacts in sibilants; awaiting second engine pass."},
      {id:"d2",reference:"RV-2026-0006",client:"Tribune Newsroom",type:"video",urgency:"standard",analyst:"You",created_at:new Date(now-26*36e5).toISOString(),status:"Complete",verdict:"AUTHENTIC",score:88,analyst_verdict:"AUTHENTIC",analyst_verdict_reason:"No manipulation indicators across engines; metadata consistent. Cleared for publication.",file_hash:"9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",file_path:"cases/RV-2026-0006/clip.mp4",notes:"No manipulation indicators across engines."},
      {id:"d3",reference:"RV-2026-0005",client:"Harris County DA",type:"video",urgency:"rush",analyst:"You",created_at:new Date(now-49*36e5).toISOString(),status:"Complete",verdict:"MANIPULATED",score:97,analyst_verdict:"MANIPULATED",analyst_verdict_reason:"Face-swap signatures confirmed across two engines and on manual frame review.",file_hash:"2c26b46b68ffc68ff99b453c1d30413413422d706483bfa0f98a5e886266e7ae",file_path:"cases/RV-2026-0005/exhibit.mp4",notes:"Face-swap signatures confirmed. Full report delivered."},
      {id:"d4",reference:"RV-2026-0004",client:"Meridian Insurance",type:"image",urgency:"standard",analyst:"You",created_at:new Date(now-73*36e5).toISOString(),status:"Open",verdict:"PENDING",score:null,analyst_verdict:null,analyst_verdict_reason:"",file_hash:"da39a3ee5e6b4b0d3255bfef95601890afd80709b1c4f0c8d9e7a2f1b3c5d6e7",file_path:"cases/RV-2026-0004/claim.jpg",notes:""},
      {id:"d5",reference:"RV-2026-0003",client:"Meridian Insurance",type:"image",urgency:"standard",analyst:"You",created_at:new Date(now-99*36e5).toISOString(),status:"Complete",verdict:"INCONCLUSIVE",score:54,analyst_verdict:"INCONCLUSIVE",analyst_verdict_reason:"Compression too heavy for a confident call; requested original.",file_hash:"5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8",file_path:"cases/RV-2026-0003/photo.jpg",notes:"Recommended re-submission of original."}
    ];
    state.activity=[
      {created_at:new Date(now-0.5*36e5).toISOString(),action:"Updated notes",case_reference:"RV-2026-0007",analyst:"You"},
      {created_at:new Date(now-1*36e5).toISOString(),action:"Opened new case",case_reference:"RV-2026-0007",analyst:"You"},
      {created_at:new Date(now-25*36e5).toISOString(),action:"Generated report",case_reference:"RV-2026-0006",analyst:"You"},
      {created_at:new Date(now-26*36e5).toISOString(),action:"Set analyst verdict: AUTHENTIC",case_reference:"RV-2026-0006",analyst:"You"},
      {created_at:new Date(now-48*36e5).toISOString(),action:"Generated report",case_reference:"RV-2026-0005",analyst:"You"}
    ];
  }

  /* ============================================================
     AUTH
     ============================================================ */
  function setLoginMsg(text,kind){
    var m=$("loginMsg");
    if(!text){ m.className="login-msg"; m.innerHTML=""; return; }
    m.className="login-msg show "+(kind||"err");
    m.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg><span>'+esc(text)+'</span>';
  }
  function handleLogin(e){
    e.preventDefault();
    var email=$("email").value.trim(), pass=$("password").value, btn=$("loginBtn");
    setLoginMsg("");
    if(DEMO){ state.user={ email: email||"analyst@revlar.io" }; enterApp(); return; }
    if(!email||!pass){ setLoginMsg("Enter your email and password."); return; }
    btn.disabled=true; var orig=btn.textContent; btn.innerHTML='<span class="spinner"></span>';
    sb.auth.signInWithPassword({ email:email, password:pass }).then(function(res){
      if(res.error){ setLoginMsg(res.error.message||"Sign-in failed. Check your credentials."); btn.disabled=false; btn.textContent=orig; return; }
      state.user=res.data.user; state.accessToken=res.data.session?res.data.session.access_token:null; enterApp();
    }).catch(function(){ setLoginMsg("Could not reach the authentication server. Please try again."); btn.disabled=false; btn.textContent=orig; });
  }
  function handleSignOut(){
    if(sb && !DEMO){ sb.auth.signOut(); }
    state.user=null; state.accessToken=null; $("app").className=""; $("login").style.display="flex";
    var b=$("loginBtn"); b.disabled=false; b.textContent="Sign in"; $("password").value="";
  }
  function enterApp(){
    $("login").style.display="none"; $("app").className="show";
    $("demoBanner").className="demo-banner"+(DEMO?" show":"");
    if(state.user && state.user.email){
      state.profile.name=(state.user.user_metadata && state.user.user_metadata.name) || state.profile.name;
      $("topUser").textContent=state.user.email;
    }
    refreshUserChrome(); buildNav();
    state.loading=true; render();
    DB.loadAll().then(function(){ state.loading=false; render(); })
      .catch(function(err){ state.loading=false; render(); toast("Could not load data from Supabase. "+(err&&err.message?err.message:""), true); });
  }
  function refreshUserChrome(){
    var name=state.profile.name||"Analyst";
    var initials=name.split(/\s+/).map(function(p){ return p.charAt(0); }).join("").slice(0,2).toUpperCase()||"RA";
    $("sideAvatar").textContent=initials; $("sideName").textContent=name; $("sideRole").textContent=state.profile.role||"Revlar";
  }

  /* ============================================================
     ROUTING (hash based → deep links + back/forward)
     ============================================================ */
  var NAV=[
    {id:"dashboard",label:"Dashboard",icon:"dashboard"},
    {id:"submit",label:"New Submission",icon:"submit"},
    {id:"cases",label:"All Cases",icon:"cases"},
    {id:"clients",label:"Clients",icon:"clients"},
    {id:"activity",label:"Activity Log",icon:"activity"},
    {id:"settings",label:"Settings",icon:"settings"}
  ];
  var TITLES={ dashboard:"Dashboard", submit:"New Submission", cases:"All Cases", detail:"Case Detail", clients:"Clients", activity:"Activity Log", settings:"Settings" };

  function buildNav(){
    var nav=$("nav"); nav.innerHTML='<div class="navlabel label">Workspace</div>';
    NAV.forEach(function(item){
      nav.appendChild(el('<button data-nav="'+item.id+'"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'+ICONS[item.icon]+'</svg><span>'+esc(item.label)+'</span></button>'));
    });
  }
  function go(view,id){ if(view==="detail"){ location.hash="#/case/"+encodeURIComponent(id); } else { location.hash="#/"+view; } }
  function currentRoute(){
    var h=(location.hash||"").replace(/^#\/?/,"");
    if(!h) return { view:"dashboard" };
    var parts=h.split("/");
    if(parts[0]==="case" && parts[1]) return { view:"detail", id:decodeURIComponent(parts[1]) };
    if(TITLES[parts[0]]) return { view:parts[0] };
    return { view:"dashboard" };
  }
  function render(){
    if(!$("app").classList.contains("show")) return;
    var r=currentRoute();
    state.caseId = r.view==="detail" ? r.id : state.caseId;
    $("crumbTitle").textContent=TITLES[r.view]||"Portal";
    var btns=document.querySelectorAll("#nav button");
    for(var i=0;i<btns.length;i++){ var v=btns[i].getAttribute("data-nav"); btns[i].className=(v===r.view||(r.view==="detail"&&v==="cases"))?"active":""; }
    closeSidebar();
    var main=$("main"); window.scrollTo(0,0);
    if(state.loading && (r.view==="dashboard"||r.view==="cases")){ main.innerHTML=skeleton(); return; }
    if(r.view==="dashboard") renderDashboard(main);
    else if(r.view==="submit") renderSubmit(main);
    else if(r.view==="cases") renderCases(main);
    else if(r.view==="detail") renderDetail(main, r.id);
    else if(r.view==="clients") renderClients(main);
    else if(r.view==="activity") renderActivity(main);
    else if(r.view==="settings") renderSettings(main);
  }
  function skeleton(){
    var rows=""; for(var i=0;i<6;i++){ rows+='<div class="skel-row"><div class="skel" style="width:120px"></div><div class="skel" style="flex:1"></div><div class="skel" style="width:70px"></div></div>'; }
    return '<div class="view-head"><div class="skel" style="width:240px;height:24px"></div></div><div class="stats">'
      + '<div class="card stat"><div class="skel" style="width:80px;margin-bottom:14px"></div><div class="skel" style="width:50px;height:26px"></div></div>'.repeat(4)
      + '</div><div class="card">'+rows+'</div>';
  }

  /* ============================================================
     SHARED VIEW BITS
     ============================================================ */
  function statusTagClass(s){ return s==="Complete"?"good":(s==="In Progress"?"warn":(s==="Reopened"?"flag":"cyan")); }
  function statusRowClass(s){ return s==="Complete"?"s-complete":(s==="In Progress"?"s-progress":(s==="Reopened"?"s-reopened":"s-open")); }
  function verdictMeta(v){
    if(v==="AUTHENTIC")    return { cls:"good", color:"var(--good)", glow:"var(--good-glow)", vk:"v-good" };
    if(v==="MANIPULATED")  return { cls:"flag", color:"var(--flag)", glow:"var(--flag-glow)", vk:"v-flag" };
    if(v==="INCONCLUSIVE") return { cls:"warn", color:"var(--warn)", glow:"var(--warn-glow)", vk:"v-warn" };
    return { cls:"cyan", color:"var(--cyan)", glow:"var(--cyan-glow)", vk:"v-cyan" };
  }
  function emptyState(ic,text,action){ return '<div class="empty">'+icon(ic,34)+'<div>'+esc(text)+'</div>'+(action||"")+'</div>'; }

  /* ============================================================
     DASHBOARD
     ============================================================ */
  function renderDashboard(main){
    var total=state.cases.length;
    var active=state.cases.filter(function(c){ return c.status==="In Progress"||c.status==="Open"; }).length;
    var done=state.cases.filter(function(c){ return c.status==="Complete"; }).length;
    var revenue=done*200;
    var hour=new Date().getHours();
    var greet=hour<12?"Good morning":(hour<18?"Good afternoon":"Good evening");
    var name=(state.profile.name||"Analyst").split(/\s+/)[0];

    var recent=state.cases.slice(0,5);
    var recentRows = recent.length ? recent.map(function(c){
      var vm=verdictMeta(displayVerdict(c));
      return '<div class="row-item" data-open="'+esc(c.id)+'"><div class="ri-main"><div class="ri-ref">'+esc(c.reference)+'</div><div class="ri-name">'+esc(c.client)+'</div></div>'
        + '<div class="ri-meta"><span class="tag '+vm.cls+'">'+esc(displayVerdict(c))+'</span><div class="ri-date">'+fmtDate(c.created_at)+'</div></div></div>';
    }).join("") : emptyState("file","No cases yet",'<button class="btn btn-primary btn-sm" data-nav="submit">New Submission</button>');

    var feed = state.activity.slice(0,6).map(function(a){
      return '<div class="feed-item"><div class="feed-dot"></div><div><div class="feed-txt">'+esc(a.action)+(a.case_reference?' · <span class="accent mono" style="font-size:12.5px">'+esc(a.case_reference)+'</span>':"")+'</div><div class="feed-time">'+timeAgo(a.created_at)+'</div></div></div>';
    }).join("") || emptyState("activity","No activity yet");

    main.innerHTML =
      '<div class="view-head"><h1>'+esc(greet)+', '+esc(name)+'.</h1><p>Here is where your cases stand right now.</p></div>'
      + '<div class="stats">'
        + statCard("Total Cases",total,"All time","cases")
        + statCard("Active",active,"Open or in progress","clock")
        + statCard("Completed",done,"Reports delivered","check")
        + statCard("Est. Revenue",fmtMoney(revenue),"Completed × $200","money")
      + '</div>'
      + '<div class="grid-2">'
        + '<div class="card"><div class="panel-head"><h3>Recent cases</h3><button class="btn btn-ghost btn-sm" data-nav="cases">View all</button></div><div class="panel-body">'+recentRows+'</div></div>'
        + '<div class="card"><div class="panel-head"><h3>Recent activity</h3></div><div class="panel-body"><div class="feed">'+feed+'</div></div></div>'
      + '</div>';
  }
  function statCard(label,num,sub,ic){ return '<div class="card stat"><div class="ic">'+icon(ic,17)+'</div><div class="label">'+esc(label)+'</div><div class="num">'+esc(num)+'</div><div class="sub">'+esc(sub)+'</div></div>'; }

  /* ============================================================
     NEW SUBMISSION
     ============================================================ */
  function renderSubmit(main){
    var clientOpts=state.clients.map(function(c){ return '<option>'+esc(c.name)+'</option>'; }).join("");
    main.innerHTML=
      '<div class="view-head"><h1>New Submission</h1><p>Open a case. The file is hashed (SHA-256) for chain of custody before upload.</p></div>'
      + '<div class="card" style="max-width:640px;padding:24px;"><form id="submitForm" class="stack">'
        + '<div class="field"><label for="s-client">Client / Organization</label><input id="s-client" list="clientList" placeholder="Organization name" required/><datalist id="clientList">'+clientOpts+'</datalist></div>'
        + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:18px;">'
          + '<div class="field"><label for="s-type">Content type</label><select id="s-type"><option value="video">Video</option><option value="audio">Audio</option><option value="image">Image</option></select></div>'
          + '<div class="field"><label for="s-urgency">Urgency</label><select id="s-urgency"><option value="standard">Standard</option><option value="rush">Rush</option></select></div>'
        + '</div>'
        + '<div class="field"><label for="s-file">Evidence file</label><input id="s-file" type="file" required/></div>'
        + '<div id="hashPreview" class="label" style="display:none;color:var(--muted);"></div>'
        + '<div style="display:flex;gap:12px;align-items:center;"><button type="submit" class="btn btn-primary" id="submitBtn">'+icon("submit",16)+' Open case</button>'
        + '<button type="button" class="btn btn-ghost" data-nav="cases">Cancel</button></div>'
      + '</form></div>';
    $("s-file").addEventListener("change",function(){
      var f=this.files && this.files[0], p=$("hashPreview");
      if(!f){ p.style.display="none"; return; }
      p.style.display="block"; p.textContent="Hashing "+f.name+" …";
      sha256(f).then(function(h){ p.innerHTML="SHA-256 · <span class='mono' style='color:var(--cyan)'>"+esc(h.slice(0,32))+"…</span>"; }).catch(function(){ p.style.display="none"; });
    });
    $("submitForm").addEventListener("submit",handleSubmitCase);
  }
  function sha256(file){
    return file.arrayBuffer().then(function(buf){ return crypto.subtle.digest("SHA-256",buf); }).then(function(d){
      var b=new Uint8Array(d),o=""; for(var i=0;i<b.length;i++){ o+=b[i].toString(16).padStart(2,"0"); } return o;
    });
  }
  function handleSubmitCase(e){
    e.preventDefault();
    var btn=$("submitBtn"); btn.disabled=true; var orig=btn.innerHTML; btn.innerHTML='<span class="spinner"></span> Working…';
    var file=$("s-file").files[0];
    var record={ client:$("s-client").value.trim(), type:$("s-type").value, urgency:$("s-urgency").value,
      analyst:state.profile.name||"Analyst", status:"Open", verdict:"PENDING", score:null, analyst_verdict:null, analyst_verdict_reason:"",
      created_at:new Date().toISOString(), notes:"" };
    Promise.all([ nextRef(), sha256(file) ]).then(function(vals){
      record.reference=vals[0]; record.file_hash=vals[1];
      if(DEMO){ record.file_path="demo/"+file.name; return Promise.resolve(); }
      var path="cases/"+record.reference+"/"+file.name;
      return sb.storage.from(STORAGE_BUCKET).upload(path,file,{ upsert:true }).then(function(up){ if(up.error) throw up.error; record.file_path=path; });
    }).then(function(){ return DB.createCase(record); })
      .then(function(saved){ return DB.addActivity({ action:"Opened new case", case_reference:record.reference, analyst:record.analyst }).then(function(){ return saved; }); })
      .then(function(saved){ toast("Case "+record.reference+" created."); go("detail",saved.id); runDetection(saved.id); })
      .catch(function(err){ btn.disabled=false; btn.innerHTML=orig; toast("Could not create case. "+(err&&err.message?err.message:""), true); });
  }

  /* ============================================================
     ALL CASES
     ============================================================ */
  function renderCases(main){
    var statusOpts=["All statuses","Open","In Progress","Complete","Reopened"].map(function(s){ return '<option>'+s+'</option>'; }).join("");
    main.innerHTML=
      '<div class="view-head"><h1>All Cases</h1><p>Every verification case on record.</p></div>'
      + '<div class="filters">'
        + '<div class="field"><label>Search</label><input id="caseSearch" placeholder="Filter by client or reference"/></div>'
        + '<div class="field"><label>Status</label><select id="caseStatus">'+statusOpts+'</select></div>'
        + '<div class="spacer"></div>'
        + '<button class="btn btn-ghost btn-sm" id="densityBtn">'+densityLabel()+'</button>'
      + '</div>'
      + '<div class="card"><div class="table-wrap"><table id="caseTable"><thead><tr><th>Reference</th><th>Client</th><th>Type</th><th>Status</th><th>Verdict</th><th>Score</th><th>Date</th><th></th></tr></thead><tbody id="caseRows"></tbody></table></div></div>';
    $("caseSearch").addEventListener("input",drawCaseRows);
    $("caseStatus").addEventListener("change",drawCaseRows);
    $("densityBtn").addEventListener("click",toggleDensity);
    applyDensity(); drawCaseRows();
  }
  function densityLabel(){ return state.density==="compact"?"Comfortable view":"Compact view"; }
  function applyDensity(){ var t=$("caseTable"); if(t){ t.className=state.density==="compact"?"compact":""; } }
  function toggleDensity(){ state.density=state.density==="compact"?"comfortable":"compact"; try{ localStorage.setItem("revlar-density",state.density); }catch(e){} applyDensity(); var b=$("densityBtn"); if(b) b.textContent=densityLabel(); }
  function drawCaseRows(){
    var q=(($("caseSearch")&&$("caseSearch").value)||"").toLowerCase();
    var st=($("caseStatus")&&$("caseStatus").value)||"All statuses";
    var rows=state.cases.filter(function(c){
      var mq=!q||String(c.client||"").toLowerCase().indexOf(q)!==-1||String(c.reference||"").toLowerCase().indexOf(q)!==-1;
      return mq && (st==="All statuses"||c.status===st);
    });
    var tb=$("caseRows");
    if(!rows.length){ tb.innerHTML='<tr><td colspan="8">'+emptyState("file","No matching cases")+'</td></tr>'; return; }
    tb.innerHTML=rows.map(function(c){
      var vm=verdictMeta(displayVerdict(c));
      return '<tr class="'+statusRowClass(c.status)+'">'
        + '<td><span class="ref">'+esc(c.reference)+'</span></td>'
        + '<td>'+esc(c.client)+'</td>'
        + '<td style="text-transform:capitalize">'+esc(c.type)+'</td>'
        + '<td><span class="tag '+statusTagClass(c.status)+'">'+esc(c.status)+'</span></td>'
        + '<td><span class="tag '+vm.cls+'">'+esc(displayVerdict(c))+'</span></td>'
        + '<td><span class="score">'+(c.score==null?"—":esc(c.score)+"%")+'</span></td>'
        + '<td class="mono" style="font-size:12px;color:var(--muted)">'+fmtDate(c.created_at)+'</td>'
        + '<td><button class="btn btn-ghost btn-sm" data-open="'+esc(c.id)+'">View</button></td></tr>';
    }).join("");
  }

  /* ============================================================
     CASE DETAIL
     ============================================================ */
  function getCase(id){ return state.cases.filter(function(c){ return String(c.id)===String(id); })[0]; }
  function displayVerdict(c){ return (c.analyst_verdict && c.analyst_verdict!=="PENDING") ? c.analyst_verdict : (c.verdict||"PENDING"); }

  function renderDetail(main,id){
    state.caseId=id; var c=getCase(id);
    if(!c){ main.innerHTML='<div class="view-head"><h1>Case not found</h1></div>'+emptyState("file","That case could not be loaded.",'<button class="btn btn-ghost btn-sm" data-nav="cases">Back to cases</button>'); return; }
    var shown=displayVerdict(c); var vm=verdictMeta(shown);
    var source = (c.analyst_verdict && c.analyst_verdict!=="PENDING") ? "Analyst verdict — signed off by reviewer" : "Engine result — pending analyst sign-off";
    var analyzing=!!c._analyzing;
    var vmk = analyzing ? "v-cyan" : vm.vk;
    var verdictVisual = analyzing
      ? '<div class="vc-main"><div class="vc-verdict"><span class="spinner" style="width:14px;height:14px;border-top-color:var(--cyan)"></span><div><div class="vlabel">Result</div><div class="vval">Analyzing…</div></div></div><div class="vc-source">Detection stack is running…</div></div><div class="gauge" style="display:flex;align-items:center;justify-content:center"><span class="spinner" style="width:28px;height:28px;border-top-color:var(--cyan)"></span></div>'
      : '<div class="vc-main"><div class="vc-verdict"><span class="vc-pip" style="background:'+vm.color+';box-shadow:0 0 0 4px '+vm.glow+'"></span><div><div class="vlabel">Result</div><div class="vval">'+esc(shown)+'</div></div></div><div class="vc-source">'+esc(source)+'</div></div>'+gauge(c.score, vm.color);

    main.innerHTML=
      '<button class="btn btn-ghost btn-sm" data-nav="cases" style="margin-bottom:18px;">'+icon("back",15)+' Back to cases</button>'
      + '<div class="detail-head"><div><div class="ref">'+esc(c.reference)+' <button class="iconbtn-mini" data-copy="'+esc(c.reference)+'" title="Copy reference">'+icon("copy",13)+'</button></div><h1>'+esc(c.client)+'</h1></div>'
        + '<div style="display:flex;gap:8px;align-items:center;"><span class="tag '+statusTagClass(c.status)+'">'+esc(c.status)+'</span>'
        + '<button class="btn btn-primary btn-sm" data-report="'+esc(c.id)+'">'+icon("download",16)+' Generate Report</button></div></div>'

      + '<div class="detail-grid"><div class="stack">'

        + '<div class="card verdict-card '+vmk+'"><div class="vc-top"><span>Verdict</span><span>'+esc(c.reference)+'</span></div><div class="vc-body">'
          + verdictVisual
        + '</div></div>'

        + '<div class="card"><div class="panel-head"><h3>Detection engines</h3>'+runBtn(c)+'</div><div class="panel-body">'+engineRows(c)+'</div></div>'

        + '<div class="card"><div class="panel-head"><h3>Analyst verdict</h3></div><div class="panel-body"><div class="av-grid">'
          + '<div class="field"><label for="avSelect">Final verdict</label><select id="avSelect">'+verdictOptions(c.analyst_verdict)+'</select></div>'
          + '<div class="field"><label>&nbsp;</label><button class="btn btn-primary" data-saveverdict="'+esc(c.id)+'">Save verdict</button></div>'
          + '</div><div class="field" style="margin-top:14px;"><label for="avReason">Reasoning (appears in the report)</label><textarea id="avReason" placeholder="Explain the basis for the verdict — engine agreement, manual review, context.">'+esc(c.analyst_verdict_reason||"")+'</textarea></div>'
        + '</div></div>'

        + '<div class="card"><div class="panel-head"><h3>Working notes</h3><span class="saveind" id="notesSave">'+icon("check",13)+' Saved</span></div><div class="panel-body">'
          + '<textarea id="notesArea" placeholder="Scratch notes as you work — saved automatically.">'+esc(c.notes||"")+'</textarea>'
        + '</div></div>'

        + '<div class="card"><div class="panel-head"><h3>Case status</h3></div><div class="panel-body">'+statusPipeline(c)+'</div></div>'

      + '</div><div class="stack">'

        + '<div class="card"><div class="panel-head"><h3>Evidence</h3><span class="tag '+(c.type==="rush"?"flag":"cyan")+'" style="text-transform:capitalize">'+esc(c.type)+'</span></div><div class="panel-body"><div class="evidence">'+evidenceFrame(c)+'</div></div></div>'

        + '<div class="card"><div class="panel-head"><h3>Case file</h3></div><div class="panel-body"><div class="meta-list">'
          + metaRow("Client",esc(c.client))
          + metaRow("Type",'<span style="text-transform:capitalize">'+esc(c.type)+'</span>')
          + metaRow("Urgency",'<span class="tag '+(c.urgency==="rush"?"flag":"cyan")+'">'+esc(c.urgency||"standard")+'</span>')
          + metaRow("Analyst",esc(c.analyst||"—"))
          + metaRow("Opened",fmtDate(c.created_at))
          + '<div class="meta-row" style="display:block"><div class="k" style="margin-bottom:6px">SHA-256 (chain of custody)</div><div class="hash-row"><span class="hash">'+esc(c.file_hash||"—")+'</span>'+(c.file_hash?'<button class="iconbtn-mini" data-copy="'+esc(c.file_hash)+'" title="Copy hash">'+icon("copy",13)+'</button>':"")+'</div></div>'
        + '</div></div></div>'

        + '<div class="card"><div class="panel-head"><h3>Case activity</h3></div><div class="panel-body"><div class="feed" id="caseFeed">'+caseFeed(c)+'</div></div></div>'

      + '</div></div>';

    // autosave notes
    var ta=$("notesArea");
    if(ta){
      ta.addEventListener("input",function(){
        var ind=$("notesSave"); ind.className="saveind show"; ind.innerHTML='<span class="spinner" style="width:12px;height:12px;border-width:2px"></span> Saving';
        clearTimeout(state.notesTimer);
        state.notesTimer=setTimeout(function(){ autosaveNotes(c.id); }, 700);
      });
    }
    loadEvidence(c);
  }

  function gauge(score,color){
    var s=score==null?0:Math.max(0,Math.min(100,score));
    var r=46, c=2*Math.PI*r, off=c*(1-s/100);
    var num = score==null ? "—" : (s+"%");
    return '<svg class="gauge" viewBox="0 0 120 120">'
      + '<circle class="g-track" cx="60" cy="60" r="'+r+'"></circle>'
      + '<circle class="g-fill" cx="60" cy="60" r="'+r+'" stroke="'+color+'" stroke-dasharray="'+c.toFixed(1)+'" stroke-dashoffset="'+off.toFixed(1)+'"></circle>'
      + '<text x="60" y="58" text-anchor="middle" font-size="22">'+num+'</text>'
      + '<text x="60" y="76" text-anchor="middle" font-size="9" class="g-cap" letter-spacing="1">CONFIDENCE</text>'
      + '</svg>';
  }
  function verdictOptions(sel){
    return ["PENDING","MANIPULATED","AUTHENTIC","INCONCLUSIVE"].map(function(v){
      return '<option'+((sel||"PENDING")===v?' selected':"")+'>'+v+'</option>';
    }).join("");
  }
  function engineRows(c){
    var er = Array.isArray(c.engine_results) ? c.engine_results : null;
    var pending = !c.verdict || c.verdict==="PENDING";
    function findEng(keys){
      if(!er) return null;
      for(var i=0;i<er.length;i++){ var e=er[i], k=(e.key||"").toLowerCase(), n=(e.name||"").toLowerCase();
        for(var j=0;j<keys.length;j++){ if(k===keys[j] || n.indexOf(keys[j])!==-1) return e; } }
      return null;
    }
    function verdictTag(verdict, score){
      var m=verdict==="MANIPULATED", mid=verdict==="INCONCLUSIVE";
      var cls=m?"flag":(mid?"warn":"good"), lbl=m?"Flagged":(mid?"Review":"Clean");
      return '<span class="tag '+cls+'">'+lbl+(score!=null?" · "+esc(score)+"%":"")+'</span>';
    }
    function engTag(e, opts){
      opts=opts||{};
      if(c._analyzing) return '<span class="tag warn"><span class="d"></span>Running</span>';
      if(e) return verdictTag(e.verdict, e.score);
      if(opts.derive && !pending) return verdictTag(displayVerdict(c), c.score);   // older cases without per-engine data
      if(opts.planned) return '<span class="tag">Planned</span>';
      return pending ? '<span class="tag">Queued</span>' : '<span class="tag">&mdash;</span>';
    }
    var primary=(c.type==="audio")
      ? {nm:"Resemble Detect", ty:"Audio / voice detection", keys:["resemble"]}
      : {nm:"Hive Moderation", ty:"Image &amp; video detection", keys:["hive"]};
    var pe = findEng(primary.keys);
    var rd = findEng(["reality_defender","reality defender"]);
    return ''
      + '<div class="engine-row"><div><div class="en-nm">'+primary.nm+'</div><div class="en-ty">'+primary.ty+'</div></div>'+engTag(pe,{derive:true})+'</div>'
      + '<div class="engine-row"><div><div class="en-nm">Reality Defender</div><div class="en-ty">Multi-modal detection</div></div>'+engTag(rd,{planned:true})+'</div>'
      + '<div class="engine-row"><div><div class="en-nm">Sensity AI</div><div class="en-ty">Deepfake detection</div></div><span class="tag">Planned</span></div>'
      + '<div class="engine-row human"><div><div class="en-nm accent">Human analyst review</div><div class="en-ty">Included on every case</div></div>'
      + (c.status==="Complete"?'<span class="tag good"><span class="d"></span>Confirmed</span>':'<span class="tag warn"><span class="d"></span>In review</span>')+'</div>';
  }
  function metaRow(k,v){ return '<div class="meta-row"><span class="k">'+esc(k)+'</span><span class="v">'+v+'</span></div>'; }
  function runBtn(c){
    if(c._analyzing) return '<button class="btn btn-ghost btn-sm" disabled><span class="spinner" style="width:12px;height:12px;border-top-color:var(--cyan)"></span> Analyzing…</button>';
    var label=(!c.verdict || c.verdict==="PENDING") ? "Run detection" : "Re-run detection";
    return '<button class="btn btn-ghost btn-sm" data-rundetect="'+esc(c.id)+'">'+icon("activity",14)+' '+label+'</button>';
  }

  function statusPipeline(c){
    var steps=["Open","In Progress","Complete"];
    var idx=steps.indexOf(c.status); if(c.status==="Reopened") idx=0;
    var html='<div class="pipeline">';
    steps.forEach(function(s,i){
      var cls=i<idx?"done":(i===idx?"current":"");
      var inner=i<idx?icon("check",15):String(i+1);
      html+='<div class="pstep '+cls+'"><div class="dot" data-status="'+esc(s)+'" data-id="'+esc(c.id)+'" title="Set '+esc(s)+'">'+inner+'</div><div class="nm">'+esc(s)+'</div></div>';
    });
    html+='</div>';
    if(c.status==="Complete"){ html+='<div class="reopen-row"><button class="btn btn-ghost btn-sm" data-status="Reopened" data-id="'+esc(c.id)+'" data-confirm="1">Reopen case</button></div>'; }
    else if(c.status==="Reopened"){ html+='<div class="reopen-row"><span class="tag flag"><span class="d"></span>Reopened</span></div>'; }
    return html;
  }
  function caseFeed(c){
    var items=state.activity.filter(function(a){ return a.case_reference===c.reference; }).slice(0,8);
    if(!items.length) return emptyState("activity","No activity for this case yet");
    return items.map(function(a){ return '<div class="feed-item"><div class="feed-dot"></div><div><div class="feed-txt">'+esc(a.action)+'</div><div class="feed-time">'+fmtTime(a.created_at)+'</div></div></div>'; }).join("");
  }

  function evidenceFrame(c){
    var ti=typeIcon(c.type); var fn=(c.file_path||"").split("/").pop()||"evidence";
    return '<div class="frame" id="evFrame"><div class="placeholder">'+icon(ti,34)+'<div style="text-transform:capitalize">'+esc(c.type)+' evidence</div><div class="fn">'+esc(fn)+'</div>'
      + (DEMO?'<div style="margin-top:8px;font-size:12px;">Connect Supabase to preview the actual file.</div>':'<div style="margin-top:8px;font-size:12px;">Loading secure preview…</div>')+'</div></div>';
  }
  function loadEvidence(c){
    if(DEMO || !c.file_path || !sb) return;
    sb.storage.from(STORAGE_BUCKET).createSignedUrl(c.file_path,600).then(function(r){
      var box=$("evFrame"); if(!box||!r||r.error||!r.data) { if(box) box.innerHTML='<div class="placeholder">'+icon(typeIcon(c.type),34)+'<div>Preview unavailable</div></div>'; return; }
      var url=r.data.signedUrl;
      if(c.type==="image") box.innerHTML='<img src="'+url+'" alt="evidence"/>';
      else if(c.type==="audio") box.innerHTML='<audio controls src="'+url+'"></audio>';
      else if(c.type==="video") box.innerHTML='<video controls src="'+url+'"></video>';
      else box.innerHTML='<div class="placeholder">'+icon("file",34)+'<div class="fn">'+esc(c.file_path)+'</div></div>';
    }).catch(function(){});
  }

  function autosaveNotes(id){
    var ta=$("notesArea"); if(!ta) return; var c=getCase(id);
    DB.updateCase(id,{ notes:ta.value }).then(function(){
      var ind=$("notesSave"); if(ind){ ind.className="saveind show saved"; ind.innerHTML=icon("check",13)+" Saved"; }
    }).catch(function(err){ var ind=$("notesSave"); if(ind){ ind.className="saveind show"; ind.textContent="Save failed"; } toast("Could not save notes. "+(err&&err.message?err.message:""), true); });
  }
  function saveVerdict(id){
    var sel=$("avSelect"), reason=$("avReason"); if(!sel) return; var c=getCase(id);
    var v=sel.value;
    DB.updateCase(id,{ analyst_verdict:v, analyst_verdict_reason:reason?reason.value:"" }).then(function(){
      return DB.addActivity({ action:"Set analyst verdict: "+v, case_reference:c.reference, analyst:state.profile.name });
    }).then(function(){ render(); toast("Analyst verdict saved."); }).catch(function(err){ toast("Could not save verdict. "+(err&&err.message?err.message:""), true); });
  }
  function setStatus(id,status,needsConfirm){
    if(needsConfirm && !window.confirm("Reopen this completed case? This moves it back into the active queue.")) return;
    var c=getCase(id);
    DB.updateCase(id,{ status:status }).then(function(){
      return DB.addActivity({ action:"Marked "+status, case_reference:c.reference, analyst:state.profile.name });
    }).then(function(){ render(); toast("Status set to "+status+"."); }).catch(function(err){ toast("Could not update status. "+(err&&err.message?err.message:""), true); });
  }

  /* ============================================================
     EDGE FUNCTION calls (report + detection).
     This file never runs detection or builds a PDF itself — it
     only calls the server-side functions and shows the result.
     ============================================================ */
  function fnHeaders(){
    return { "Authorization":"Bearer "+(state.accessToken||SUPABASE_PUBLISHABLE_KEY), "apikey":SUPABASE_PUBLISHABLE_KEY, "Content-Type":"application/json" };
  }
  // Matches the payload shape the generate-report Edge Function expects.
  function reportPayload(c){
    return {
      id:c.reference, client:c.client, type:c.type, urgency:c.urgency||"standard",
      analyst:c.analyst, date:fmtDate(c.created_at),
      verdict:displayVerdict(c), score:c.score, file_hash:c.file_hash||null, notes:c.notes||"",
      analyst_verdict:c.analyst_verdict||null, analyst_verdict_reason:c.analyst_verdict_reason||"",
      activity: state.activity.filter(function(a){ return a.case_reference===c.reference; })
        .map(function(a){ return { user:a.analyst||"", action:a.action, time:fmtTime(a.created_at) }; })
    };
  }
  function generateReport(id){
    var c=getCase(id);
    if(DEMO){ toast("Preview mode: connect Supabase to generate the real PDF.", true); return; }
    toast("Generating report…");
    fetch(SUPABASE_URL+"/functions/v1/"+REPORT_FUNCTION,{
      method:"POST", headers:fnHeaders(), body:JSON.stringify({ case: reportPayload(c) })
    }).then(function(resp){
      if(resp.status===404) throw new Error("The generate-report function is not deployed. Please deploy it in Supabase.");
      if(!resp.ok) throw new Error("Report service returned "+resp.status+".");
      return resp.blob();
    }).then(function(blob){
      var url=URL.createObjectURL(blob); var a=document.createElement("a");
      a.href=url; a.download=(c.reference||"revlar-report")+".pdf"; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
      DB.addActivity({ action:"Generated report", case_reference:c.reference, analyst:state.profile.name });
      toast("Report downloaded.");
    }).catch(function(err){ toast(err&&err.message?err.message:"Could not generate the report.", true); });
  }

  // Kicks off the detection stack for a case. In real mode this calls your
  // super-api Edge Function (Hive / Resemble / AI, server-side), then writes
  // the returned verdict + score onto the case. In preview mode it simulates.
  function runDetection(id){
    var c=getCase(id); if(!c) return;
    c._analyzing=true; if(state.caseId===id) render();
    if(DEMO){
      setTimeout(function(){
        if(!getCase(id)) return;
        function mv(s){ return s>=70?"MANIPULATED":(s<=38?"AUTHENTIC":"INCONCLUSIVE"); }
        var base=(c.type==="audio")?58:52;
        var pscore=Math.min(99, base+Math.floor(Math.random()*44));
        var rdscore=Math.min(99, Math.max(5, pscore+Math.floor(Math.random()*20)-10));
        var engines=[
          { key:(c.type==="audio"?"resemble":"hive"), name:(c.type==="audio"?"Resemble Detect (audio)":"Hive AI-Generated & Deepfake Detection"), verdict:mv(pscore), score:pscore },
          { key:"reality_defender", name:"Reality Defender", verdict:mv(rdscore), score:rdscore }
        ];
        var score=Math.max(pscore,rdscore);
        var verdict=mv(score);
        c._analyzing=false;
        DB.updateCase(id,{ verdict:verdict, score:score, status:"In Progress", engine_results:engines }).then(function(){
          return DB.addActivity({ action:"Automated analysis complete (simulated preview)", case_reference:c.reference, analyst:"Detection stack" });
        }).then(function(){ if(state.caseId===id) render(); toast("Analysis complete (simulated — connect Supabase for real detection)."); });
      }, 1700);
      return;
    }
    if(!c.file_path){ c._analyzing=false; if(state.caseId===id) render(); toast("This case has no uploaded file to analyze.", true); return; }
    // super-api takes { case_ref, file_path } and routes by file extension.
    fetch(SUPABASE_URL+"/functions/v1/"+DETECTION_FUNCTION,{
      method:"POST", headers:fnHeaders(), body:JSON.stringify({ case_ref:c.reference, file_path:c.file_path })
    }).then(function(r){
      return r.json().catch(function(){ throw new Error("detection returned an unreadable response ("+r.status+")"); });
    }).then(function(data){
      c._analyzing=false;
      if(data && data.ok){
        var v = data.verdict || "INCONCLUSIVE";
        var s = (data.manipulation_score!=null) ? data.manipulation_score : null;
        var eng = data.engine ? (data.engine.charAt(0).toUpperCase()+data.engine.slice(1)) : "Detection stack";
        DB.updateCase(id,{ verdict:v, score:s, status:"In Progress", engine_results:(data.engines||null) }).then(function(){
          return DB.addActivity({ action:"Automated analysis — "+v+(s==null?"":" ("+s+")"), case_reference:c.reference, analyst:eng });
        }).then(function(){ if(state.caseId===id) render(); toast("Detection complete — "+v+"."); });
      } else {
        // super-api reports some failures with HTTP 200 + an error/debug field
        var msg = (data && (data.error || (data.debug ? ("engine error: "+data.debug) : null))) || "Detection did not return a result.";
        if(data && data.available_files){ msg += " (file not found in storage)"; }
        if(state.caseId===id) render();
        toast(msg, true);
      }
    }).catch(function(err){
      c._analyzing=false; if(state.caseId===id) render();
      toast("Detection failed: "+(err&&err.message?err.message:"error")+".", true);
    });
  }

  /* ============================================================
     CLIENTS / ACTIVITY / SETTINGS
     ============================================================ */
  function renderClients(main){
    var counts={}; state.cases.forEach(function(c){ counts[c.client]=(counts[c.client]||0)+1; });
    var names={}; state.clients.forEach(function(c){ names[c.name]=true; }); Object.keys(counts).forEach(function(n){ names[n]=true; });
    var list=Object.keys(names);
    main.innerHTML='<div class="view-head"><h1>Clients</h1><p>Organizations you verify media for.</p></div>'
      + (list.length?'<div class="clients-grid">'+list.map(function(n){ var cnt=counts[n]||0; return '<div class="card client-card" data-client="'+esc(n)+'"><div class="cc-nm">'+esc(n)+'</div><div class="cc-meta">'+cnt+' case'+(cnt===1?"":"s")+'</div></div>'; }).join("")+'</div>':emptyState("clients","No clients yet"));
  }
  function renderActivity(main){
    var items=state.activity.slice(0,100);
    main.innerHTML='<div class="view-head"><h1>Activity Log</h1><p>A chronological record of analyst actions.</p></div><div class="card"><div class="panel-body">'
      + (items.length?'<div class="feed">'+items.map(function(a){ return '<div class="feed-item"><div class="feed-dot"></div><div style="flex:1"><div class="feed-txt">'+esc(a.action)+(a.case_reference?' · <span class="accent mono" style="font-size:12.5px">'+esc(a.case_reference)+'</span>':"")+'</div><div class="feed-time">'+fmtTime(a.created_at)+(a.analyst?" · "+esc(a.analyst):"")+'</div></div></div>'; }).join("")+'</div>':emptyState("activity","No activity yet"))
      + '</div></div>';
  }
  function renderSettings(main){
    var theme=document.documentElement.getAttribute("data-theme");
    main.innerHTML='<div class="view-head"><h1>Settings</h1><p>Your profile and display preferences.</p></div>'
      + '<div class="card" style="max-width:620px;padding:24px;"><div class="stack">'
        + '<div style="display:flex;align-items:center;gap:14px;"><div class="avatar" style="width:54px;height:54px;font-size:20px;border-radius:12px;">'+esc((state.profile.name||"RA").slice(0,2).toUpperCase())+'</div>'
          + '<div><div style="font-weight:650;font-size:16px;">'+esc(state.profile.name)+'</div><div class="label">'+esc(state.user&&state.user.email?state.user.email:"analyst@revlar.io")+'</div></div></div>'
        + '<div class="field"><label for="set-name">Display name</label><input id="set-name" value="'+esc(state.profile.name)+'"/></div>'
        + '<div class="field"><label for="set-role">Role</label><input id="set-role" value="'+esc(state.profile.role)+'"/></div>'
        + '<div class="field"><label>Appearance</label><div style="display:flex;gap:8px;"><button class="btn btn-ghost btn-sm" data-theme-set="dark"'+(theme==="dark"?' style="border-color:var(--cyan);color:var(--cyan-bright)"':"")+'>Night</button><button class="btn btn-ghost btn-sm" data-theme-set="light"'+(theme==="light"?' style="border-color:var(--cyan);color:var(--cyan-bright)"':"")+'>Light</button></div></div>'
        + '<div><button class="btn btn-primary" id="saveProfile">Save profile</button></div>'
      + '</div></div>';
    $("saveProfile").addEventListener("click",function(){ state.profile.name=$("set-name").value.trim()||"Analyst"; state.profile.role=$("set-role").value.trim()||"Revlar"; refreshUserChrome(); toast("Profile saved."); });
  }

  /* ============================================================
     THEME / SIDEBAR
     ============================================================ */
  function applyTheme(t){
    document.documentElement.setAttribute("data-theme",t);
    try{ localStorage.setItem("revlar-theme",t); }catch(e){}
    var icn=$("themeIcon"); if(icn){ icn.innerHTML=(t==="light")?'<path d="M21 12.8A9 9 0 1111.2 3 7 7 0 0021 12.8z"/>':'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'; }
  }
  function toggleTheme(){ applyTheme(document.documentElement.getAttribute("data-theme")==="light"?"dark":"light"); }
  function openSidebar(){ $("sidebar").classList.add("open"); $("scrim").classList.add("show"); }
  function closeSidebar(){ $("sidebar").classList.remove("open"); $("scrim").classList.remove("show"); }

  /* ============================================================
     COMMAND PALETTE
     ============================================================ */
  function openPalette(){
    var ov=$("palette"); ov.classList.add("open"); state.paletteSel=0;
    var inp=$("paletteInput"); inp.value=""; drawPalette(""); setTimeout(function(){ inp.focus(); },10);
  }
  function closePalette(){ $("palette").classList.remove("open"); }
  function drawPalette(q){
    q=(q||"").toLowerCase();
    var list=state.cases.filter(function(c){ return !q||String(c.reference||"").toLowerCase().indexOf(q)!==-1||String(c.client||"").toLowerCase().indexOf(q)!==-1; }).slice(0,8);
    state.paletteList=list;
    var res=$("paletteResults");
    if(!list.length){ res.innerHTML='<div class="palette-empty">No cases match.</div>'; return; }
    res.innerHTML=list.map(function(c,i){
      var vm=verdictMeta(displayVerdict(c));
      return '<div class="palette-item'+(i===state.paletteSel?" sel":"")+'" data-palette="'+esc(c.id)+'"><div><div class="pi-ref">'+esc(c.reference)+'</div><div class="pi-name">'+esc(c.client)+'</div></div><span class="tag '+vm.cls+'">'+esc(displayVerdict(c))+'</span></div>';
    }).join("");
  }
  function paletteMove(d){
    if(!state.paletteList.length) return;
    state.paletteSel=(state.paletteSel+d+state.paletteList.length)%state.paletteList.length;
    var items=document.querySelectorAll(".palette-item");
    for(var i=0;i<items.length;i++){ items[i].className="palette-item"+(i===state.paletteSel?" sel":""); }
    if(items[state.paletteSel]) items[state.paletteSel].scrollIntoView({ block:"nearest" });
  }
  function paletteChoose(){ var c=state.paletteList[state.paletteSel]; if(c){ closePalette(); go("detail",c.id); } }

  /* ============================================================
     EVENT DELEGATION + KEYBOARD
     ============================================================ */
  document.addEventListener("click",function(e){
    var t;
    if((t=e.target.closest("[data-nav]")))        { go(t.getAttribute("data-nav")); return; }
    if((t=e.target.closest("[data-open]")))       { go("detail",t.getAttribute("data-open")); return; }
    if((t=e.target.closest("[data-status]")))     { setStatus(t.getAttribute("data-id"),t.getAttribute("data-status"),t.getAttribute("data-confirm")==="1"); return; }
    if((t=e.target.closest("[data-saveverdict]"))){ saveVerdict(t.getAttribute("data-saveverdict")); return; }
    if((t=e.target.closest("[data-report]")))     { generateReport(t.getAttribute("data-report")); return; }
    if((t=e.target.closest("[data-rundetect]")))  { runDetection(t.getAttribute("data-rundetect")); return; }
    if((t=e.target.closest("[data-copy]")))       { copyText(t.getAttribute("data-copy")); return; }
    if((t=e.target.closest("[data-client]")))     { go("cases"); setTimeout(function(){ var s=$("caseSearch"); if(s){ s.value=t.getAttribute("data-client"); drawCaseRows(); } },30); return; }
    if((t=e.target.closest("[data-theme-set]")))  { applyTheme(t.getAttribute("data-theme-set")); render(); return; }
    if((t=e.target.closest("[data-palette]")))    { closePalette(); go("detail",t.getAttribute("data-palette")); return; }
    if(e.target.closest("#themeBtn"))   { toggleTheme(); return; }
    if(e.target.closest("#signOutBtn")) { handleSignOut(); return; }
    if(e.target.closest("#hamburger"))  { openSidebar(); return; }
    if(e.target.closest("#paletteBtn")) { openPalette(); return; }
    if(e.target===$("scrim"))           { closeSidebar(); return; }
    if(e.target===$("palette"))         { closePalette(); return; }
  });

  document.addEventListener("keydown",function(e){
    var pal=$("palette");
    if((e.metaKey||e.ctrlKey) && (e.key==="k"||e.key==="K")){ e.preventDefault(); if($("app").classList.contains("show")){ pal.classList.contains("open")?closePalette():openPalette(); } return; }
    if(pal && pal.classList.contains("open")){
      if(e.key==="Escape"){ closePalette(); }
      else if(e.key==="ArrowDown"){ e.preventDefault(); paletteMove(1); }
      else if(e.key==="ArrowUp"){ e.preventDefault(); paletteMove(-1); }
      else if(e.key==="Enter"){ e.preventDefault(); paletteChoose(); }
      return;
    }
    if(e.key==="Escape"){ closeSidebar(); }
    var typing=/^(INPUT|TEXTAREA|SELECT)$/.test((e.target.tagName||""));
    if(e.key==="/" && !typing && $("app").classList.contains("show")){ e.preventDefault(); openPalette(); }
  });

  /* ============================================================
     BOOT
     ============================================================ */
  function boot(){
    var savedTheme="dark"; try{ savedTheme=localStorage.getItem("revlar-theme")||"dark"; }catch(e){}
    applyTheme(savedTheme);
    try{ state.density=localStorage.getItem("revlar-density")||"comfortable"; }catch(e){}

    $("loginForm").addEventListener("submit",handleLogin);
    $("paletteInput").addEventListener("input",function(){ state.paletteSel=0; drawPalette(this.value); });
    window.addEventListener("hashchange",render);

    $("demoNote").innerHTML = DEMO
      ? "Preview mode is on (Supabase not connected). Enter anything to explore the portal with sample data."
      : "Secured by Supabase Auth.";

    if(!DEMO && sb){
      // keep the access token fresh across automatic session refreshes
      sb.auth.onAuthStateChange(function(_evt, session){
        if(session){ state.accessToken=session.access_token; state.user=session.user; } else { state.accessToken=null; }
      });
      sb.auth.getSession().then(function(res){ if(res&&res.data&&res.data.session){ state.user=res.data.session.user; state.accessToken=res.data.session.access_token; enterApp(); } }).catch(function(){});
    }
  }
  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",boot); else boot();
})();
