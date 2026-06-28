// Simple single-workspace UI. No login, tokens, or user accounts.
const $=id=>document.getElementById(id);
// Single-workspace conversation identifier, not an authentication token.
let conversationId=sessionStorage.getItem('veridian_conversation_id')||crypto.randomUUID();
sessionStorage.setItem('veridian_conversation_id',conversationId);
$('newChat').onclick=()=>{conversationId=crypto.randomUUID();sessionStorage.setItem('veridian_conversation_id',conversationId);$('messages').replaceChildren();toast('Started a new conversation')};

const toast=msg=>{const el=$('toast');el.textContent=msg;el.style.display='block';setTimeout(()=>el.style.display='none',4000)};
const api=async(path,options={})=>{const res=await fetch(path,{...options,headers:{'Content-Type':'application/json',...(options.headers||{})}});const data=await res.json();if(!res.ok)throw Error(data.detail||'Request failed');return data};
function view(name){['chat','docs','approval','admin'].forEach(x=>{$(x+'View').classList.toggle('hidden',x!==name);$(x+'Tab').classList.toggle('active',x===name)});$('heading').textContent={chat:'Ask your organization\'s knowledge',docs:'Document management',approval:'Approval requests',admin:'Operational overview'}[name];if(name==='docs')loadDocs();if(name==='admin')loadMetrics();if(name==='approval')loadApprovals()}
$('chatTab').onclick=()=>view('chat');$('docsTab').onclick=()=>view('docs');$('adminTab').onclick=()=>view('admin');$('approvalTab').onclick=()=>view('approval');$('refreshApprovals').onclick=loadApprovals;
function addMessage(content,kind,sources=[]){const el=document.createElement('div');el.className='message '+kind;el.textContent=content;if(sources.length){const wrap=document.createElement('div');wrap.className='sources';sources.forEach(s=>{const d=document.createElement('details');const title=document.createElement('summary');title.textContent=`[${s.index}] ${s.title} — page ${s.page}`;const excerpt=document.createElement('p');excerpt.textContent=s.excerpt;d.append(title,excerpt);wrap.append(d)});el.append(wrap);const feedback=document.createElement('button');feedback.textContent='👍 Helpful';feedback.onclick=async()=>{try{await api('/api/feedback',{method:'POST',body:JSON.stringify({rating:1})});toast('Feedback saved')}catch(e){toast(e.message)}};el.append(feedback)}$('messages').append(el);$('messages').scrollTo({top:$('messages').scrollHeight,behavior:'smooth'})}
$('chatForm').onsubmit=async e=>{e.preventDefault();const q=$('question').value.trim();if(!q)return;addMessage(q,'user');$('question').value='';addMessage('Searching approved documents...','assistant');const loading=$('messages').lastElementChild;try{const r=await api('/api/chat',{method:'POST',body:JSON.stringify({question:q,conversation_id:conversationId})});loading.remove();addMessage(r.answer,'assistant',r.sources);if(r.status==='pending_approval'){const btn=document.createElement('button');btn.textContent='Review approval request →';btn.onclick=()=>view('approval');$('messages').lastElementChild.append(btn)}}catch(err){loading.textContent=err.message}};
document.querySelectorAll('[data-q]').forEach(b=>b.onclick=()=>{$('question').value=b.dataset.q;$('question').focus()});
async function loadDocs(){
  const root=$('docs');
  root.setAttribute('aria-busy','true');
  root.textContent='Loading documents...';
  try{
    const r=await api('/api/documents');
    root.replaceChildren();
    if(!r.documents.length){
      const empty=document.createElement('div');empty.className='empty-state';
      const title=document.createElement('strong');title.textContent='No documents yet';
      const detail=document.createElement('p');detail.textContent='Upload an approved file to make it available in knowledge chat.';
      empty.append(title,detail);root.append(empty);
      return;
    }
    const table=document.createElement('table');table.className='data-table';
    const head=document.createElement('thead');const headerRow=document.createElement('tr');
    for(const label of ['Document','Status','Version']){
      const cell=document.createElement('th');cell.scope='col';cell.textContent=label;headerRow.append(cell);
    }
    head.append(headerRow);table.append(head);
    const body=document.createElement('tbody');
    for(const doc of r.documents){
      const row=document.createElement('tr');
      const title=document.createElement('td');title.textContent=doc.title;row.append(title);
      const status=document.createElement('td');const badge=document.createElement('span');
      badge.className='status-value';badge.dataset.status=String(doc.status).toLowerCase();
      badge.textContent=doc.status;status.append(badge);row.append(status);
      const version=document.createElement('td');version.textContent=`v${doc.current_version}`;row.append(version);
      body.append(row);
    }
    table.append(body);root.append(table);
  }catch(e){root.textContent=`Unable to load documents: ${e.message}`}
  finally{root.setAttribute('aria-busy','false')}
}
function renderMetricData(root,data){
  root.replaceChildren();
  root.setAttribute('aria-busy','false');
  for(const [key,value] of Object.entries(data)){
    const label=key==='documents'?'Documents by status':key==='feedback'?'Feedback ratings':key==='events'?'Guardrail event totals':key.replaceAll('_',' ');
    if(Array.isArray(value)){
      const section=document.createElement('section');section.className='metric-group';
      const heading=document.createElement('h4');heading.className='metric-group-heading';heading.textContent=label;section.append(heading);
      if(!value.length){
        const empty=document.createElement('div');empty.className='metric-empty';empty.textContent=`No ${label.toLowerCase()} returned.`;section.append(empty);
      }else{
        const columns=[...new Set(value.flatMap(item=>Object.keys(item)))];
        const table=document.createElement('table');table.className='data-table metric-table';
        const head=document.createElement('thead');const headerRow=document.createElement('tr');
        for(const column of columns){const cell=document.createElement('th');cell.scope='col';cell.textContent=column.replaceAll('_',' ');headerRow.append(cell)}
        head.append(headerRow);table.append(head);
        const body=document.createElement('tbody');
        for(const item of value){
          const row=document.createElement('tr');
          for(const column of columns){const cell=document.createElement('td');const cellValue=item[column];cell.textContent=cellValue===null||cellValue===undefined?'—':String(cellValue);row.append(cell)}
          body.append(row);
        }
        table.append(body);section.append(table);
      }
      root.append(section);
    }else{
      const list=document.createElement('dl');list.className='metric-list';
      const item=document.createElement('div');item.className='metric-item';
      const term=document.createElement('dt');term.textContent=label;
      const description=document.createElement('dd');description.textContent=value===null||value===undefined?'—':String(value);
      item.append(term,description);list.append(item);root.append(list);
    }
  }
}
async function loadMetrics(){
  const metrics=$('metrics');metrics.textContent='Loading metrics...';metrics.setAttribute('aria-busy','true');
  try{renderMetricData(metrics,await api('/api/admin/metrics'))}
  catch(e){metrics.textContent=`Unable to load workspace metrics: ${e.message}`;metrics.setAttribute('aria-busy','false')}
  const guardrails=$('guardrailMetrics');guardrails.textContent='Loading guardrail metrics...';guardrails.setAttribute('aria-busy','true');
  try{renderMetricData(guardrails,await api('/api/admin/guardrails'))}
  catch(e){guardrails.textContent=`Unable to load guardrail metrics: ${e.message}`;guardrails.setAttribute('aria-busy','false')}
}
$('uploadForm').onsubmit=async e=>{e.preventDefault();const f=$('file').files[0];if(!f)return;if(f.size>10485760){toast('Maximum file size is 10 MB');return}try{const r=await api('/api/documents/uploads',{method:'POST',body:JSON.stringify({filename:f.name})});const up=await fetch(r.upload_url,{method:'PUT',headers:r.headers,body:f});if(!up.ok)throw Error('S3 upload failed');toast('Uploaded to S3. Processing document now...');await api('/api/documents/complete',{method:'POST',body:JSON.stringify({document_id:r.document_id})});toast('Document indexed in Pinecone!');loadDocs()}catch(err){toast(err.message)}};

// Admin approval workflow. DOM nodes use textContent (never untrusted innerHTML).
async function loadApprovals(){
  const root=$('approvalList');root.textContent='Loading approvals...';
  root.setAttribute('aria-busy','true');
  try{
    const response=await api('/api/approvals');
    if(!Array.isArray(response.approvals)) throw Error('Unexpected API response: approvals list missing');
    const approvals=response.approvals;
    const pending=approvals.filter(a=>String(a.status).trim().toLowerCase()==='pending').length;
    $('approvalSummary').textContent=`${pending} pending · ${approvals.length} total (most recent 100)`;
    root.replaceChildren();
    if(!approvals.length){
      const empty=document.createElement('div');empty.className='empty-state';
      const title=document.createElement('strong');title.textContent='No approval requests';
      const detail=document.createElement('p');detail.textContent='New requests requiring review will appear here.';
      empty.append(title,detail);root.append(empty);root.setAttribute('aria-busy','false');return;
    }
    for(const a of approvals){
      const card=document.createElement('article');card.className='approval-card';
      const header=document.createElement('div');header.className='approval-header';
      const title=document.createElement('strong');title.textContent=a.question;
      const badge=document.createElement('span');badge.className='approval-status '+a.status;badge.textContent=a.status;
      header.append(title,badge);card.append(header);
      const meta=document.createElement('p');meta.textContent=`Requested by ${a.requester} · ${new Date(a.created_at).toLocaleString()}`;card.append(meta);
      if(String(a.status).trim().toLowerCase()==='pending'){
        const actions=document.createElement('div');actions.className='approval-actions';
        for(const [label,approve] of [['Approve',true],['Reject',false]]){
          const button=document.createElement('button');button.textContent=label;button.className=approve?'approve-button':'reject-button';
          button.onclick=async()=>{
            const decision=approve?'approve':'reject';
            if(!confirm(`Are you sure you want to ${decision} this request? This records a decision only and does not execute the requested action.`))return;
            button.disabled=true;
            try{const r=await api(`/api/approvals/${encodeURIComponent(a.id)}/decision`,{method:'POST',body:JSON.stringify({approve})});toast(`Request ${r.status}. No action executed.`);await loadApprovals()}
            catch(e){toast(e.message);button.disabled=false}
          };
          actions.append(button);
        }
        card.append(actions);
      }else{
        const info=document.createElement('p');info.textContent=`Reviewed by ${a.reviewer||'unknown'} · ${a.reviewed_at?new Date(a.reviewed_at).toLocaleString():''} · No action executed`;card.append(info);
      }
      root.append(card);
    }
    root.setAttribute('aria-busy','false');
  }catch(e){root.textContent=`Unable to load approvals: ${e.message}. Check /api/approvals and your Uvicorn terminal.`;root.setAttribute('aria-busy','false');console.error('Approvals loading failed:',e)}
}
