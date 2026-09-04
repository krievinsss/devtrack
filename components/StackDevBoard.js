'use client';

import { useCallback,useEffect,useMemo,useState } from 'react';
import { CheckCircle2,ChevronRight,Code2,Coins,Lightbulb,LockKeyhole,MessageSquareCode,MessageSquareText,Plus,RefreshCw,Search,Send,Tag,UserRound,X,Zap } from 'lucide-react';

const EMPTY_QUESTION={title:'',body:'',code:'',language:'javascript',tags:''};
const EMPTY_REPLY={body:'',code:'',language:'javascript'};
const LANGUAGES=['javascript','typescript','python','php','java','csharp','sql','html','css','bash','json','text'];

export default function StackDevBoard({user,initialQuestions=[]}){
  const[questions,setQuestions]=useState(initialQuestions),[selectedId,setSelectedId]=useState(initialQuestions[0]?.id||null),[query,setQuery]=useState(''),[filter,setFilter]=useState('all');
  const[composer,setComposer]=useState(false),[questionForm,setQuestionForm]=useState(EMPTY_QUESTION),[replyForm,setReplyForm]=useState(EMPTY_REPLY),[busy,setBusy]=useState(''),[error,setError]=useState('');

  const refresh=useCallback(async()=>{try{const response=await fetch(`/api/stackdev?t=${Date.now()}`,{cache:'no-store'}),data=await response.json();if(response.ok)setQuestions(data.questions||[])}catch{}},[]);
  useEffect(()=>{const timer=setInterval(()=>document.visibilityState==='visible'&&refresh(),10000),visible=()=>document.visibilityState==='visible'&&refresh();document.addEventListener('visibilitychange',visible);return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',visible)}},[refresh]);

  const selected=questions.find(item=>item.id===selectedId)||null;
  const filtered=useMemo(()=>questions.filter(item=>{
    const matchesStatus=filter==='all'||item.status===filter;
    const needle=query.trim().toLowerCase(),matchesQuery=!needle||`${item.title} ${item.body} ${(item.tags||[]).join(' ')} ${item.authorName}`.toLowerCase().includes(needle);
    return matchesStatus&&matchesQuery;
  }),[questions,query,filter]);
  const stats=useMemo(()=>({open:questions.filter(item=>item.status==='open').length,solved:questions.filter(item=>item.status==='solved').length,replies:questions.reduce((sum,item)=>sum+(item.replies?.length||0),0)}),[questions]);

  async function action(payload,key){
    if(busy)return null;setBusy(key);setError('');
    try{const response=await fetch('/api/stackdev',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)}),data=await response.json();if(!response.ok)throw new Error(data.error||'StackDev action failed');return data.result}
    catch(actionError){setError(actionError.message);return null}finally{setBusy('')}
  }
  function replaceQuestion(question){setQuestions(current=>[question,...current.filter(item=>item.id!==question.id)].sort(sortUpdated))}
  async function createQuestion(event){
    event.preventDefault();const result=await action({action:'create_question',...questionForm,tags:questionForm.tags.split(',').map(tag=>tag.trim()).filter(Boolean)},'create');
    if(!result)return;replaceQuestion(result);setSelectedId(result.id);setQuestionForm(EMPTY_QUESTION);setComposer(false);
  }
  async function addReply(event){
    event.preventDefault();if(!selected)return;const result=await action({action:'add_reply',questionId:selected.id,...replyForm},'reply');
    if(!result)return;replaceQuestion(result);setReplyForm(EMPTY_REPLY);
  }
  async function acceptReply(replyId){
    if(!selected||!window.confirm('Mark this reply as the accepted solution? This will solve the question.'))return;
    const result=await action({action:'accept_reply',questionId:selected.id,replyId},`accept_${replyId}`);if(!result)return;replaceQuestion(result.question);window.dispatchEvent(new Event('devtrack-gamification-refresh'));
  }
  async function changeStatus(status){
    if(!selected)return;const result=await action({action:'set_status',questionId:selected.id,status},`status_${status}`);if(result)replaceQuestion(result);
  }

  return <div className="stackdev-page">
    <section className="stackdev-hero">
      <div><span className="eyebrow">STUDENT DEVELOPER COMMUNITY</span><h1>StackDev</h1><p>Ask a precise question, share the relevant code and solve problems together.</p></div>
      {user.role==='student'&&<button className="btn primary" onClick={()=>setComposer(true)}><Plus size={16}/> Ask StackDev</button>}
    </section>

    <section className="stackdev-stats">
      <div><Lightbulb size={18}/><span><b>{stats.open}</b><small>Open questions</small></span></div>
      <div><CheckCircle2 size={18}/><span><b>{stats.solved}</b><small>Solved</small></span></div>
      <div><MessageSquareText size={18}/><span><b>{stats.replies}</b><small>Community replies</small></span></div>
      <div className="stackdev-reward"><Coins size={18}/><span><b>10 DC + 25 XP</b><small>Accepted solution reward</small></span></div>
    </section>

    {error&&<div className="notice danger stackdev-error">{error}</div>}
    <div className="stackdev-layout">
      <aside className="panel stackdev-browser">
        <div className="stackdev-search"><Search size={15}/><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search questions, tags or students…"/>{query&&<button onClick={()=>setQuery('')}><X size={13}/></button>}</div>
        <div className="stackdev-filters">{['all','open','solved','closed'].map(status=><button key={status} className={filter===status?'active':''} onClick={()=>setFilter(status)}>{status}</button>)}</div>
        <div className="stackdev-question-list">{filtered.length?filtered.map(question=><button key={question.id} className={selectedId===question.id?'active':''} onClick={()=>setSelectedId(question.id)}><div className="stackdev-list-top"><span className={`stackdev-status ${question.status}`}>{question.status}</span><small>{timeAgo(question.updatedAt||question.createdAt)}</small></div><b>{question.title}</b><p>{question.body}</p><div className="stackdev-list-meta"><span><MessageSquareText size={12}/>{question.replies?.length||0}</span><span><UserRound size={12}/>{question.authorName}</span><ChevronRight size={14}/></div></button>):<div className="stackdev-empty"><MessageSquareCode size={25}/><b>No matching questions.</b><span>Try another filter or ask the first one.</span></div>}</div>
      </aside>

      <main className="panel stackdev-thread">{selected?<QuestionThread question={selected} user={user} replyForm={replyForm} setReplyForm={setReplyForm} busy={busy} addReply={addReply} acceptReply={acceptReply} changeStatus={changeStatus}/>:<div className="stackdev-thread-empty"><MessageSquareCode size={40}/><h2>Select a StackDev question</h2><p>The full problem, code and discussion will open here.</p></div>}</main>
    </div>

    {composer&&<QuestionComposer form={questionForm} setForm={setQuestionForm} busy={busy} close={()=>setComposer(false)} submit={createQuestion}/>} 
  </div>;
}

function QuestionThread({question,user,replyForm,setReplyForm,busy,addReply,acceptReply,changeStatus}){
  const canManage=user.id===question.authorId||['teacher','admin'].includes(user.role),canReply=question.status==='open';
  const replies=[...(question.replies||[])].sort((a,b)=>Number(Boolean(b.accepted))-Number(Boolean(a.accepted))||new Date(a.createdAt)-new Date(b.createdAt));
  return <>
    <header className="stackdev-thread-head"><div><div className="stackdev-thread-labels"><span className={`stackdev-status ${question.status}`}>{question.status}</span>{(question.tags||[]).map(tag=><span className="stackdev-tag" key={tag}><Tag size={10}/>{tag}</span>)}</div><h2>{question.title}</h2><p>Asked by <b>{question.authorName}</b> · {new Date(question.createdAt).toLocaleString('lv-LV')}</p></div>{canManage&&question.status!=='solved'&&<button className="btn secondary compact" disabled={!!busy} onClick={()=>changeStatus(question.status==='open'?'closed':'open')}>{question.status==='open'?<><LockKeyhole size={14}/> Close</>:<><RefreshCw size={14}/> Reopen</>}</button>}</header>
    <article className="stackdev-question-body"><p>{question.body}</p>{question.code&&<CodeBlock code={question.code} language={question.language}/>}</article>
    <div className="stackdev-answer-heading"><div><MessageSquareText size={17}/><b>{replies.length} {replies.length===1?'reply':'replies'}</b></div>{question.status==='solved'&&<span><CheckCircle2 size={14}/> Solution accepted</span>}</div>
    <div className="stackdev-replies">{replies.length?replies.map(reply=><article className={`stackdev-reply ${reply.accepted?'accepted':''}`} key={reply.id}><header><div className="stackdev-avatar">{reply.authorName?.split(' ').map(part=>part[0]).slice(0,2).join('')}</div><div><b>{reply.authorName}</b><small>{reply.authorRole==='student'?'Student':'Teacher'} · {timeAgo(reply.createdAt)}</small></div>{reply.accepted&&<span className="accepted-label"><CheckCircle2 size={13}/> Accepted solution</span>}</header>{reply.body&&<p>{reply.body}</p>}{reply.code&&<CodeBlock code={reply.code} language={reply.language}/>} {canManage&&question.status==='open'&&!reply.accepted&&<button className="stackdev-accept" disabled={!!busy} onClick={()=>acceptReply(reply.id)}><CheckCircle2 size={14}/>{busy===`accept_${reply.id}`?'Accepting…':'Accept solution'}{reply.authorId!==question.authorId&&reply.authorRole==='student'&&<span><Zap size={12}/> +25 XP · +10 DC</span>}</button>}</article>):<div className="stackdev-no-replies"><MessageSquareText size={23}/><b>No replies yet.</b><span>Share the first useful idea or code example.</span></div>}</div>
    {canReply?<form className="stackdev-reply-form" onSubmit={addReply}><div className="stackdev-form-title"><Send size={16}/><div><b>Write a reply</b><small>Explain the idea and add only the code that matters.</small></div></div><textarea value={replyForm.body} onChange={event=>setReplyForm({...replyForm,body:event.target.value})} placeholder="Explain your solution…" maxLength={6000}/><CodeEditor form={replyForm} setForm={setReplyForm}/><button className="btn primary" disabled={busy==='reply'||(!replyForm.body.trim()&&!replyForm.code.trim())}>{busy==='reply'?'Posting…':<><Send size={14}/> Post reply</>}</button></form>:<div className="stackdev-closed-note"><LockKeyhole size={16}/><span>This discussion is {question.status}. New replies are disabled.</span></div>}
  </>;
}

function QuestionComposer({form,setForm,busy,close,submit}){return <div className="stackdev-modal" onMouseDown={close}><form className="stackdev-composer" onMouseDown={event=>event.stopPropagation()} onSubmit={submit}><header><div><span className="eyebrow">NEW STACKDEV TICKET</span><h2>Ask a code question</h2><p>Include what you tried, what happened and what you expected.</p></div><button type="button" onClick={close}><X size={18}/></button></header><label><span>Question title</span><input autoFocus value={form.title} onChange={event=>setForm({...form,title:event.target.value})} minLength={8} maxLength={140} placeholder="Example: Why does my fetch request return 401?" required/></label><label><span>Problem details</span><textarea value={form.body} onChange={event=>setForm({...form,body:event.target.value})} minLength={20} maxLength={6000} placeholder="What are you building, what did you try, and what error do you see?" required/></label><CodeEditor form={form} setForm={setForm}/><label><span>Tags <small>comma separated, max 5</small></span><input value={form.tags} onChange={event=>setForm({...form,tags:event.target.value})} placeholder="javascript, api, authentication"/></label><footer><button type="button" className="btn secondary" onClick={close}>Cancel</button><button className="btn primary" disabled={busy==='create'}>{busy==='create'?'Publishing…':<><Plus size={15}/> Publish question</>}</button></footer></form></div>}

function CodeEditor({form,setForm}){return <div className="stackdev-code-editor"><div><Code2 size={14}/><b>Code example</b><select value={form.language} onChange={event=>setForm({...form,language:event.target.value})}>{LANGUAGES.map(language=><option value={language} key={language}>{language}</option>)}</select></div><textarea spellCheck="false" value={form.code} onChange={event=>setForm({...form,code:event.target.value})} maxLength={12000} placeholder="Paste the relevant code here (optional)…"/></div>}
function CodeBlock({code,language}){return <div className="stackdev-code"><div><Code2 size={13}/><span>{language||'text'}</span></div><pre><code>{code}</code></pre></div>}
function sortUpdated(a,b){return new Date(b.updatedAt||b.createdAt)-new Date(a.updatedAt||a.createdAt)}
function timeAgo(value){const ms=Date.now()-new Date(value).getTime(),minutes=Math.max(0,Math.floor(ms/60000));if(minutes<1)return'just now';if(minutes<60)return`${minutes}m ago`;const hours=Math.floor(minutes/60);if(hours<24)return`${hours}h ago`;return`${Math.floor(hours/24)}d ago`}
