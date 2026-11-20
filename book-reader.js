/* Athenaeum · Read as a Book. Optional manual page-turning reader.
   Works and covers are read from the existing archive; no duplicate uploads. */
(function(){
  'use strict';
  let current=null;
  const MOBILE_QUERY='(max-width: 700px)';
  const reduced=()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const mobile=()=>window.matchMedia(MOBILE_QUERY).matches;
  const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,sign=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[sign]));
  const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  // Wait for the actual cover rotation to finish, with a fallback when
  // browsers (including in-app Safari) omit transitionend events.
  function coverTurnFinished(cover){
    if(reduced())return delay(20);
    return new Promise(resolve=>{
      let finished=false;
      let timeout;
      function done(){
        if(finished)return;
        finished=true;
        cover.removeEventListener('transitionend',onEnd);
        clearTimeout(timeout);
        resolve();
      }
      function onEnd(event){
        if(event.target===cover&&event.propertyName==='transform')done();
      }
      cover.addEventListener('transitionend',onEnd);
      timeout=setTimeout(done,990);
    });
  }
  const nextFrame=()=>new Promise(resolve=>requestAnimationFrame(()=>resolve()));

  function pageDesign(kind,html,running,workId){
    return {kind,html,running:running||'ATHENAEUM',workId:workId||''};
  }

  function introPage(book){
    return pageDesign('intro',
      '<div class="br-title-inner"><div class="br-edition">THE ATHENAEUM ARCHIVE</div>'+
      '<span class="br-ornament">✦</span><h1>'+escapeHtml(book.title)+'</h1>'+
      '<div class="br-title-rule"></div><p>'+escapeHtml(book.owner||'Athenaeum')+'</p>'+
      (book.cover_artist?'<p class="br-cover-artist">Cover by '+escapeHtml(book.cover_artist)+'</p>':'')+
      '<span class="br-title-year">'+escapeHtml(book.year||'')+'</span></div>',
      'THE TITLE PAGE');
  }

  function tocPage(works){
    return pageDesign('toc',
      '<div class="br-toc"><span class="br-chapter-kicker">THE READING ROOM</span>'+
      '<h2>Contents</h2>'+
      (works.length?'<ol class="br-toc-list">'+works.map((work,i)=>
        '<li><button type="button" data-br-toc="'+escapeHtml(work.id)+'">'+
        '<span class="br-toc-numeral">'+String(i+1).padStart(2,'0')+'</span>'+
        '<span>'+escapeHtml(work.title)+'</span><span class="br-toc-arrow">↗</span></button></li>'
      ).join('')+'</ol>':'<p class="br-empty">Belum ada karya di dalam buku ini.</p>')+
      '<p class="br-toc-note">Pilih judul atau balik halaman secara manual untuk mulai membaca.</p></div>',
      'CONTENTS');
  }

  function contentPageHtml(page,index,total){
    return '<div class="br-page-pad"><div class="br-running-title">'+escapeHtml(page.running)+'</div>'+
      '<div class="br-copy'+(page.kind==='art'?' br-copy-art':'')+'">'+page.html+'</div>'+
      '<div class="br-page-foot"><span>ATHENAEUM</span><span>'+String(index+1).padStart(2,'0')+
      ' / '+String(total).padStart(2,'0')+'</span></div></div>';
  }

  function locateTextNode(parts,position){
    if(position<=0)return {node:parts[0].node,offset:0};
    for(const part of parts){
      if(position<=part.end)return {node:part.node,offset:position-part.start};
    }
    const last=parts[parts.length-1];
    return {node:last.node,offset:last.node.nodeValue.length};
  }

  /* Range.cloneContents preserves inline rich-text markup while splitting at
     measured page boundaries, rather than flattening writing into plain text. */
  function paginateRichText(raw,work,areaWidth,areaHeight,root){
    const doc=document.createElement('div');
    doc.innerHTML=raw||'';
    const walker=document.createTreeWalker(doc,NodeFilter.SHOW_TEXT);
    const parts=[];
    let charCount=0,node;
    while((node=walker.nextNode())){
      if(!node.nodeValue.length)continue;
      parts.push({node,start:charCount,end:charCount+node.nodeValue.length});
      charCount+=node.nodeValue.length;
    }
    const title='<div class="br-story-heading"><span class="br-chapter-kicker">'+
      escapeHtml(work.kind==='Gambar'?'ILLUSTRATION':'WRITTEN WORK')+'</span><h2>'+
      escapeHtml(work.title)+'</h2><p>by '+escapeHtml(work.author||'Athenaeum')+'</p></div>';
    if(!parts.length)return [pageDesign('story',
      title+(raw||'<p class="br-empty">Belum ada teks dalam karya ini.</p>'),work.title,work.id)];
    const flat=parts.map(part=>part.node.nodeValue).join('');
    const probe=document.createElement('div');
    probe.className='br-copy br-pagination-probe';
    probe.style.width=areaWidth+'px';
    probe.style.height=areaHeight+'px';
    root.appendChild(probe);
    const fragment=(start,end)=>{
      const begin=locateTextNode(parts,start);
      const finish=locateTextNode(parts,end);
      const range=document.createRange();
      range.setStart(begin.node,begin.offset);
      range.setEnd(finish.node,finish.offset);
      return range.cloneContents();
    };
    const fits=(start,end,prefix)=>{
      probe.innerHTML=prefix;
      probe.appendChild(fragment(start,end));
      return probe.scrollHeight<=areaHeight+2;
    };
    const pages=[];
    let start=0;
    while(start<charCount&&pages.length<300){
      const prefix=pages.length===0?title:'';
      let low=start+1,high=charCount,best=start;
      while(low<=high){
        const mid=Math.floor((low+high)/2);
        if(fits(start,mid,prefix)){best=mid;low=mid+1;}
        else high=mid-1;
      }
      if(best<=start)best=Math.min(charCount,start+Math.max(1,Math.floor(areaWidth/40)));
      // When possible, finish at a word boundary for natural-looking pages.
      if(best<charCount&&best-start>40){
        const whitespace=flat.lastIndexOf(' ',best-1);
        const lineBreak=flat.lastIndexOf('\n',best-1);
        const boundary=Math.max(whitespace,lineBreak);
        if(boundary>start+Math.floor((best-start)*.7))best=boundary+1;
      }
      const wrapper=document.createElement('div');
      wrapper.appendChild(fragment(start,best));
      pages.push(pageDesign('story',prefix+wrapper.innerHTML,work.title,work.id));
      start=best;
    }
    // If unusually long work exceeds the page budget, preserve all remaining text.
    if(start<charCount){
      const wrapper=document.createElement('div');
      wrapper.appendChild(fragment(start,charCount));
      pages.push(pageDesign('story','<p class="br-continued">Continued</p>'+wrapper.innerHTML,
        work.title,work.id));
    }
    probe.remove();
    return pages;
  }

  function buildPages(state){
    const root=state.overlay;
    const paper=root.querySelector('.br-right-page');
    const width=Math.max(135,paper.getBoundingClientRect().width);
    const height=Math.max(200,paper.getBoundingClientRect().height);
    const gutter=mobile()?48:74;
    const contentWidth=Math.max(90,width-gutter);
    const contentHeight=Math.max(95,height-(mobile()?124:145));
    const result=[introPage(state.book),tocPage(state.works)];
    state.starts={};
    for(const work of state.works){
      state.starts[work.id]=result.length;
      if(work.img){
        result.push(pageDesign('art',
          '<div class="br-illustration"><span class="br-chapter-kicker">ARTWORK</span>'+
          '<img src="'+escapeHtml(work.img)+'" alt="'+escapeHtml(work.title)+'" loading="lazy">'+
          '<div class="br-art-caption"><strong>'+escapeHtml(work.title)+'</strong>'+
          '<span>'+escapeHtml(work.author||'Athenaeum')+'</span></div></div>',
          work.title,work.id));
      }
      if(work.html&&work.html.trim()){
        result.push(...paginateRichText(work.html,work,contentWidth,contentHeight,root));
      }else if(!work.img){
        result.push(pageDesign('story',
          '<div class="br-story-heading"><span class="br-chapter-kicker">WRITTEN WORK</span>'+
          '<h2>'+escapeHtml(work.title)+'</h2><p>by '+
          escapeHtml(work.author||'Athenaeum')+'</p></div>'+
          '<p class="br-empty">Belum ada isi karya.</p>',
          work.title,work.id));
      }
    }
    if(result.length%2)result.push(pageDesign('blank',
      '<div class="br-endmark">❦</div>','ATHENAEUM'));
    return result;
  }

  function createOverlay(book){
    const overlay=document.createElement('div');
    overlay.className='br-reader-overlay';
    overlay.setAttribute('role','dialog');
    overlay.setAttribute('aria-modal','true');
    overlay.setAttribute('aria-label','Read as a Book: '+book.title);
    overlay.setAttribute('tabindex','-1');
    const image=book.img?'<img src="'+escapeHtml(book.img)+'" alt="'+escapeHtml(book.title)+'">':'';
    overlay.innerHTML=
      '<div class="br-reader-ui">'+
      '<header class="br-topbar">'+
        '<div class="br-brand"><span class="br-brand-mark">A.</span><span>ATHENAEUM <small>READ AS A BOOK</small></span></div>'+
        '<div class="br-header-actions">'+
          '<button type="button" class="br-top-button" data-br-action="close-book" hidden>Close Book</button>'+
          '<button type="button" class="br-top-button br-exit" data-br-action="exit" aria-label="Keluar dari Read as a Book">✕ <span>Exit</span></button>'+
        '</div>'+
      '</header>'+
      '<div class="br-theatre">'+
        '<div class="br-book-world is-closed" aria-label="Buku '+escapeHtml(book.title)+'">'+
          '<div class="br-spread">'+
            '<section class="br-page br-left-page" aria-label="Halaman kiri"></section>'+
            '<section class="br-page br-right-page" aria-label="Halaman kanan"></section>'+
          '</div>'+
          '<button type="button" class="br-cover-sheet" data-br-action="open-cover" aria-label="Buka sampul buku '+escapeHtml(book.title)+'" disabled>'+
            '<span class="br-cover-face br-front-cover">'+image+
              (!image?'<span class="br-cover-fallback">'+escapeHtml(book.title)+'</span>':'')+
              '<span class="br-cover-spine"></span></span>'+
            '<span class="br-cover-face br-inside-cover"><span>ATHENAEUM</span></span>'+
          '</button>'+
        '</div>'+
      '</div>'+
      '<footer class="br-reader-bottom">'+
        '<div class="br-turn-controls">'+
          '<button type="button" data-br-action="prev" disabled aria-label="Halaman sebelumnya">← <span>Previous</span></button>'+
          '<span class="br-counter" aria-live="polite">Preparing the pages…</span>'+
          '<button type="button" data-br-action="next" disabled aria-label="Halaman berikutnya"><span>Next</span> →</button>'+
        '</div>'+
        '<p class="br-reader-hint">Click a corner or use ← → to turn the pages.</p>'+
      '</footer>'+
      '</div>';
    return overlay;
  }

  function applyPages(state,idx){
    const total=state.pages.length;
    const showMobile=mobile();
    state.step=showMobile?1:2;
    state.index=Math.max(0,Math.min(idx,showMobile?total-1:Math.max(0,total-2)));
    if(!showMobile&&state.index%2)state.index--;
    const left=state.overlay.querySelector('.br-left-page');
    const right=state.overlay.querySelector('.br-right-page');
    left.innerHTML=showMobile?'':contentPageHtml(state.pages[state.index],state.index,total);
    const visibleIdx=showMobile?state.index:state.index+1;
    const display=state.pages[visibleIdx]||state.pages[state.index];
    right.innerHTML=contentPageHtml(display,visibleIdx,total);
    updateControls(state);
  }

  function updateControls(state){
    const root=state.overlay;
    const open=state.opened;
    const enabled=open&&state.ready&&!state.turning;
    const prev=root.querySelector('[data-br-action="prev"]');
    const next=root.querySelector('[data-br-action="next"]');
    const close=root.querySelector('[data-br-action="close-book"]');
    const cover=root.querySelector('[data-br-action="open-cover"]');
    if(prev)prev.disabled=!enabled||state.index<=0;
    if(next)next.disabled=!enabled||state.index+state.step>=state.pages.length;
    if(close)close.hidden=!open||state.turning;
    if(cover)cover.disabled=!state.ready||state.turning;
    const counter=root.querySelector('.br-counter');
    if(counter){
      counter.textContent=state.coverMotion?
        (state.coverMotion==='opening'?'Opening the book…':'Closing the book…'):
        !state.ready?'Preparing the pages…':!open?
        'Tap the cover to open':(mobile()?
          'PAGE '+(state.index+1)+' / '+state.pages.length:
          'PAGES '+(state.index+1)+'–'+Math.min(state.index+2,state.pages.length)+' / '+state.pages.length);
    }
    root.querySelector('.br-reader-hint').textContent=state.coverMotion?
      'The book is '+(state.coverMotion==='opening'?'opening.':'closing.') :
      open?(mobile()?'Swipe-free reading. Tap Next or Previous.':'Tap the page corners, use arrows, or choose a chapter in Contents.'):
      'A story begins when the cover opens.';
  }

  async function animateCover(state,open){
    if(!state.ready||state.turning||state.opened===open)return;
    state.turning=true;
    state.coverMotion=open?'opening':'closing';
    const world=state.overlay.querySelector('.br-book-world');
    const cover=state.overlay.querySelector('.br-cover-sheet');
    cover.classList.remove('br-cover-finished');
    // Ensure the closing rotation starts from the fully opened (-180°)
    // position, even when the cover had been hidden while reading.
    if(!open)void cover.offsetWidth;
    state.opened=open;
    if(open){
      world.classList.remove('is-closed','is-closing');
      world.classList.add('is-open');
      cover.classList.add('is-open');
      updateControls(state);
      await coverTurnFinished(cover);
      if(current!==state)return;
      cover.classList.add('br-cover-finished');
    }else{
      // The cover's inside face is the moving left leaf. Hide the static
      // left title page immediately so it cannot remain beside the cover.
      world.classList.add('is-closing');
      cover.classList.remove('is-open');
      world.classList.remove('is-open');
      world.classList.add('is-closed');
      updateControls(state);
      await coverTurnFinished(cover);
      if(current!==state)return;
      // Only AFTER the cover finishes do we remove the spread and reset
      // content for the next opening. No visible page swap mid-turn.
      world.classList.remove('is-closing');
      state.index=0;
      applyPages(state,0);
    }
    state.turning=false;
    state.coverMotion=null;
    updateControls(state);
  }

  function makeFlipper(state,target,forward){
    const showMobile=mobile(),total=state.pages.length;
    const sheet=document.createElement('div');
    sheet.className='br-flip-sheet'+(forward?'':' br-reverse')+(showMobile?' br-single':'');
    // On a phone, both directions hinge on the book's LEFT binding edge.
    // Going backward: the previous page comes in from the left, rather
    // than rotating the current leaf around its center.
    const fromIndex=showMobile?(forward?state.index:target):(forward?state.index+1:state.index);
    const toIndex=showMobile?(forward?target:state.index):(forward?target:target+1);
    sheet.innerHTML=
      '<div class="br-flip-face br-flip-front">'+
        contentPageHtml(state.pages[fromIndex],fromIndex,total)+'</div>'+
      '<div class="br-flip-face br-flip-back">'+
        contentPageHtml(state.pages[toIndex],toIndex,total)+'</div>';
    return sheet;
  }

  async function flip(state,direction){
    if(!state.opened||!state.ready||state.turning)return;
    const step=mobile()?1:2;
    const target=state.index+step*direction;
    if(target<0||target>=state.pages.length)return;
    state.turning=true;
    updateControls(state);
    const left=state.overlay.querySelector('.br-left-page');
    const right=state.overlay.querySelector('.br-right-page');
    const sheet=makeFlipper(state,target,direction>0);
    const total=state.pages.length;
    const showMobile=mobile();
    if(direction>0){
      right.innerHTML=contentPageHtml(state.pages[showMobile?target:target+1]||state.pages[target],
        showMobile?target:target+1,total);
    }else if(!showMobile){
      left.innerHTML=contentPageHtml(state.pages[target],target,total);
    }else if(showMobile){
      // Keep the currently visible page underneath the incoming leaf.
      // Swapping it now would make the text jump before the turn finishes.
    }
    const world=state.overlay.querySelector('.br-book-world');
    world.appendChild(sheet);
    await nextFrame();
    if(current!==state)return;
    sheet.classList.add('br-is-turning');
    await delay(reduced()?20:820);
    if(current!==state)return;
    sheet.remove();
    applyPages(state,target);
    state.turning=false;
    updateControls(state);
  }

  async function jumpToWork(state,workId){
    if(!state.opened||state.turning)return;
    const pageIndex=state.starts[workId];
    if(pageIndex==null)return;
    applyPages(state,pageIndex);
  }

  async function prepare(state,restoreWorkId){
    if(current!==state)return;
    state.ready=false;
    updateControls(state);
    await nextFrame();
    if(document.fonts?.ready)await document.fonts.ready;
    if(current!==state)return;
    state.pages=buildPages(state);
    state.ready=true;
    let target=restoreWorkId?state.starts[restoreWorkId]:null;
    if(target==null)target=state.index||0;
    applyPages(state,target);
  }

  function currentWork(state){
    const page=state.pages[state.index];
    return page?.workId||state.pages[state.index+1]?.workId||null;
  }

  function onClick(event){
    const state=current;
    if(!state)return;
    const toc=event.target.closest('[data-br-toc]');
    if(toc){jumpToWork(state,toc.dataset.brToc);return;}
    const button=event.target.closest('[data-br-action]');
    if(button){
      const action=button.dataset.brAction;
      if(action==='exit')destroy();
      else if(action==='open-cover')animateCover(state,true);
      else if(action==='close-book')animateCover(state,false);
      else if(action==='next')flip(state,1);
      else if(action==='prev')flip(state,-1);
      return;
    }
    if(!state.opened||state.turning)return;
    const page=event.target.closest('.br-page');
    if(page&&!event.target.closest('a,button,input,textarea')&&!window.getSelection()?.toString()){
      const rect=page.getBoundingClientRect();
      const nearBottom=event.clientY>rect.bottom-Math.min(110,rect.height*.24);
      if(!nearBottom)return;
      if(mobile()){
        const touchLeft=event.clientX<rect.left+rect.width*.28;
        const touchRight=event.clientX>rect.right-rect.width*.28;
        if(!touchLeft&&!touchRight)return;
        flip(state,touchLeft?-1:1);
      }else{
        const isLeft=page.classList.contains('br-left-page');
        if(isLeft&&event.clientX>rect.left+rect.width*.3)return;
        if(!isLeft&&event.clientX<rect.right-rect.width*.3)return;
        flip(state,isLeft?-1:1);
      }
    }
  }

  function onKeydown(event){
    const state=current;
    if(!state||event.target.closest('input,textarea,[contenteditable="true"]'))return;
    if(event.key==='Escape'){event.preventDefault();destroy();}
    else if(state.opened&&(event.key==='ArrowRight'||event.key==='ArrowLeft')){
      event.preventDefault();flip(state,event.key==='ArrowRight'?1:-1);
    }else if(!state.opened&&(event.key==='Enter'||event.key===' ')){
      if(document.activeElement?.dataset?.brAction==='open-cover'){
        event.preventDefault();animateCover(state,true);
      }
    }
  }

  function onResize(){
    const state=current;
    if(!state||state.turning)return;
    clearTimeout(state.resizeTimer);
    state.resizeTimer=setTimeout(()=>{
      if(current!==state||state.turning)return;
      const newWidth=state.overlay.querySelector('.br-right-page').getBoundingClientRect().width;
      const newHeight=state.overlay.querySelector('.br-right-page').getBoundingClientRect().height;
      if(Math.abs(newWidth-state.lastWidth)<8&&Math.abs(newHeight-state.lastHeight)<8)return;
      const workId=currentWork(state);
      state.lastWidth=newWidth;
      state.lastHeight=newHeight;
      prepare(state,workId).catch(err=>console.error('Book reader resize failed',err));
    },220);
  }

  function destroy(){
    const state=current;
    if(!state)return;
    current=null;
    clearTimeout(state.resizeTimer);
    state.overlay.removeEventListener('click',onClick);
    window.removeEventListener('keydown',onKeydown,true);
    window.removeEventListener('resize',onResize);
    state.overlay.remove();
    document.body.style.overflow=state.previousOverflow;
    state.launcher?.focus({preventScroll:true});
  }

  async function open(book,works,launcher){
    if(!book)return;
    destroy();
    const state={
      book,works:(works||[]).slice(),launcher:launcher||document.activeElement,
      pages:[],starts:{},index:0,step:2,ready:false,turning:false,opened:false,
      resizeTimer:null,previousOverflow:document.body.style.overflow,
      lastWidth:0,lastHeight:0
    };
    state.overlay=createOverlay(book);
    current=state;
    document.body.appendChild(state.overlay);
    document.body.style.overflow='hidden';
    state.overlay.addEventListener('click',onClick);
    window.addEventListener('keydown',onKeydown,true);
    window.addEventListener('resize',onResize);
    state.overlay.focus({preventScroll:true});
    try{
      await prepare(state);
      if(current!==state)return;
      const rect=state.overlay.querySelector('.br-right-page').getBoundingClientRect();
      state.lastWidth=rect.width;
      state.lastHeight=rect.height;
    }catch(err){
      console.error('Read as a Book could not prepare pages',err);
      if(current===state){
        const counter=state.overlay.querySelector('.br-counter');
        if(counter)counter.textContent='Could not prepare this book. Please try again.';
      }
    }
  }
  window.AthenaeumBookReader={open,destroy};
})();
