'use client';
import { useMemo,useState } from 'react';
import { useRouter } from 'next/navigation';
import { Coins,Sparkles,ShoppingBag,ShieldCheck,Trophy,Palette,Tag,Frame,Check,History } from 'lucide-react';

const typeLabel={avatar_frame:'Avatar frame',title:'Profile title',ui_theme:'UI theme'};
const typeIcon={avatar_frame:Frame,title:Tag,ui_theme:Palette};

export default function GamificationShop({user,initialProfile,initialTransactions,shop}){
  const router=useRouter();
  const [profile,setProfile]=useState(initialProfile);
  const [transactions,setTransactions]=useState(initialTransactions);
  const [busy,setBusy]=useState('');
  const [message,setMessage]=useState('');
  const owned=new Set(profile.inventory||[]);
  const nextLevelXp=Math.pow(profile.level,2)*180;
  const currentLevelStart=Math.pow(Math.max(0,profile.level-1),2)*180;
  const levelPct=Math.max(0,Math.min(100,Math.round((profile.xp-currentLevelStart)/Math.max(1,nextLevelXp-currentLevelStart)*100)));
  const equippedIds=new Set(Object.values(profile.equipped||{}).filter(Boolean));
  const inventory=useMemo(()=>shop.filter(i=>owned.has(i.id)),[shop,profile.inventory]);

  async function act(action,item){if(busy)return;setBusy(item.id);setMessage('');try{const r=await fetch('/api/gamification',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action,itemId:item.id})});const d=await r.json();if(!r.ok)throw new Error(d.error||'Action failed');setProfile(d.profile);setMessage(action==='buy'?`${item.name} added to your inventory.`:`${item.name} equipped.`);if(action==='buy'){setTransactions([{id:`local_${Date.now()}`,type:'purchase',credits:-item.price,label:`Purchased ${item.name}`,createdAt:new Date().toISOString()},...transactions])}router.refresh()}catch(e){setMessage(e.message)}finally{setBusy('')}}

  return <div className="game-page">
    <section className="game-hero"><div><span className="eyebrow">DEVTRACK REWARDS</span><h1>DevCredits Shop</h1><p>Earn rewards from your project results and spend them on cosmetic upgrades. Nothing here changes your grades.</p></div><div className="wallet-card"><div className="wallet-balance"><Coins size={21}/><span>DevCredits</span><strong>{profile.credits}</strong></div><div className="level-row"><div><span>Level {profile.level}</span><b>{profile.xp} XP</b></div><div className="game-progress"><span style={{width:`${levelPct}%`}}/></div><small>{Math.max(0,nextLevelXp-profile.xp)} XP to next level</small></div></div></section>

    {message&&<div className="notice game-notice">{message}</div>}

    <div className="game-layout"><main><div className="game-section-head"><div><h2><ShoppingBag size={20}/> Shop</h2><p>Cosmetic rewards only — collect them and make DevTrack yours.</p></div></div><div className="shop-grid">{shop.map(item=>{const Icon=typeIcon[item.type]||Sparkles;const isOwned=owned.has(item.id);const equipped=equippedIds.has(item.id);return <article className={`shop-card rarity-${item.rarity}`} key={item.id}><div className={`shop-preview ${item.preview||''}`}><Icon size={32}/><span>{item.rarity}</span></div><div className="shop-copy"><div className="shop-type">{typeLabel[item.type]}</div><h3>{item.name}</h3><p>{item.description}</p><div className="shop-card-foot"><span className="shop-price"><Coins size={14}/>{item.price}</span>{isOwned?<button className={equipped?'btn secondary compact equipped':'btn secondary compact'} disabled={equipped||busy===item.id} onClick={()=>act('equip',item)}>{equipped?<><Check size={14}/> Equipped</>:busy===item.id?'Working…':'Equip'}</button>:<button className="btn primary compact" disabled={profile.credits<item.price||busy===item.id} onClick={()=>act('buy',item)}>{busy===item.id?'Buying…':'Buy'}</button>}</div></div></article>})}</div></main>

      <aside className="game-sidebar"><section className="panel inventory-panel"><div className="panel-title"><div><h3><ShieldCheck size={17}/> Inventory</h3><small>{inventory.length} items owned</small></div></div>{inventory.length?inventory.map(item=><div className="inventory-row" key={item.id}><span>{item.name}<small>{typeLabel[item.type]}</small></span>{equippedIds.has(item.id)?<b>Equipped</b>:<button className="btn secondary compact" onClick={()=>act('equip',item)}>Equip</button>}</div>):<div className="empty-state">Your first cosmetic will appear here.</div>}</section><section className="panel transaction-panel"><div className="panel-title"><div><h3><History size={17}/> Recent rewards</h3><small>Transparent credit history</small></div></div>{transactions.slice(0,8).map(t=><div className="transaction-row" key={t.id}><div><b>{t.label}</b><small>{new Date(t.createdAt).toLocaleDateString('lv-LV')}</small></div><span className={Number(t.credits)>=0?'positive':'negative'}>{Number(t.credits)>0?'+':''}{t.credits} DC</span></div>)}{!transactions.length&&<div className="empty-state">Rewards from graded projects will appear here.</div>}</section></aside>
    </div>
  </div>
}
