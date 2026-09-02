'use client';
import { useEffect,useRef } from 'react';
import { Bold,Italic,Underline,List,ListOrdered,Quote,Code2,Link2,Minus,Heading1,Heading2,Heading3,Eraser } from 'lucide-react';

function cmd(name,value){document.execCommand(name,false,value||null)}
const toolbar=[
  [Heading1,'formatBlock','h1','H1'],[Heading2,'formatBlock','h2','H2'],[Heading3,'formatBlock','h3','H3'],
  [Bold,'bold',null,'Bold'],[Italic,'italic',null,'Italic'],[Underline,'underline',null,'Underline'],
  [List,'insertUnorderedList',null,'Bullets'],[ListOrdered,'insertOrderedList',null,'Numbered list'],
  [Quote,'formatBlock','blockquote','Quote'],[Code2,'formatBlock','pre','Code block'],[Link2,'createLink',null,'Link'],
  [Minus,'insertHorizontalRule',null,'Divider'],[Eraser,'removeFormat',null,'Clear formatting']
];
export default function RichTextEditor({value,onChange,placeholder='Write the assignment…'}){
  const ref=useRef(null);
  useEffect(()=>{if(ref.current&&ref.current.innerHTML!==value)ref.current.innerHTML=value||''},[value]);
  function run(command,value){const nextValue=command==='createLink'?prompt('Link URL'):value;if(command==='createLink'&&!nextValue)return;cmd(command,nextValue);onChange(ref.current?.innerHTML||'')}
  return <div className="wysiwyg-shell"><div className="wysiwyg-toolbar">{toolbar.map(([Icon,command,commandValue,label],i)=><button type="button" key={i} title={label} onMouseDown={e=>{e.preventDefault();run(command,commandValue)}}><Icon size={15}/></button>)}</div><div ref={ref} className="wysiwyg-editor" contentEditable suppressContentEditableWarning data-placeholder={placeholder} onInput={e=>onChange(e.currentTarget.innerHTML)}/></div>;
}
