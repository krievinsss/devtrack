'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Check,
  Coins,
  Crown,
  Flame,
  Frame,
  Gift,
  Hash,
  History,
  Lock,
  Palette,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Tag,
  Trophy,
  UserRound,
} from 'lucide-react';
import { avatarAsset } from '@/lib/avatarAssets';

const typeLabel = {
  avatar: 'Avatar',
  avatar_frame: 'Avatar frame',
  title: 'Profile title',
  slug: 'Profile slug',
  ui_theme: 'UI theme',
};

const typeIcon = {
  avatar: UserRound,
  avatar_frame: Frame,
  title: Tag,
  slug: Hash,
  ui_theme: Palette,
};

const filters = [
  ['all', 'All'],
  ['exclusive', 'Achievement Exclusives'],
  ['avatar', 'Avatars'],
  ['avatar_frame', 'Frames'],
  ['title', 'Titles'],
  ['slug', 'Slugs'],
  ['ui_theme', 'Themes'],
];

export default function GamificationShop({
  user,
  initialProfile,
  initialTransactions,
  shop,
  achievements = {},
  levelRewards = [],
}) {
  const router = useRouter();
  const [profile, setProfile] = useState(initialProfile);
  const [transactions, setTransactions] = useState(initialTransactions);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [filter, setFilter] = useState('all');

  const owned = new Set(profile.inventory || []);
  const equippedIds = new Set(Object.values(profile.equipped || {}).filter(Boolean));
  const inventory = useMemo(
    () => shop.filter((item) => owned.has(item.id)),
    [shop, profile.inventory]
  );
  const exclusives = shop.filter((item) => item.unlockAchievement);
  const visible =
    filter === 'all'
      ? shop
      : filter === 'exclusive'
        ? exclusives
        : shop.filter((item) => item.type === filter);

  const nextLevelXp = Math.pow(profile.level, 2) * 180;
  const currentLevelStart = Math.pow(Math.max(0, profile.level - 1), 2) * 180;
  const levelPct = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        ((profile.xp - currentLevelStart) /
          Math.max(1, nextLevelXp - currentLevelStart)) *
          100
      )
    )
  );

  async function act(action, item) {
    if (busy) return;
    setBusy(item.id);
    setMessage('');

    try {
      const payload = { action, itemId: item.id };
      if (action === 'equip') payload.equipped = { ...(profile.equipped || {}) };

      const response = await fetch('/api/gamification', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Action failed');

      setProfile(data.profile);
      setMessage(
        action === 'buy'
          ? `${item.name} added to your inventory.`
          : `${item.name} equipped.`
      );

      if (action === 'buy') {
        setTransactions((current) => [
          {
            id: `local_${Date.now()}`,
            credits: -item.price,
            label: `Purchased ${item.name}`,
            createdAt: new Date().toISOString(),
          },
          ...current,
        ]);
      }

      window.dispatchEvent(new Event('devtrack-gamification-refresh'));
      router.refresh();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy('');
    }
  }

  const currentAvatar = shop.find((item) => item.id === profile.equipped?.avatar);
  const avatarCount = shop.filter((item) => item.type === 'avatar').length;

  return (
    <div className="game-page">
      <section className="game-hero game-hero-wow">
        <div>
          <span className="eyebrow">DEVTRACK REWARDS</span>
          <h1>Build your developer identity.</h1>
          <p>
            Grades earn XP and DevCredits. Level up, collect cosmetics and unlock
            rare items that money cannot buy.
          </p>
          <div className="hero-meme-row">
            <span>YOLO</span><span>sigma</span><span>six seven</span>
            <span>+1000 aura</span><span>locked in</span><span>GOATed</span>
          </div>
        </div>

        <div className="wallet-card">
          <div className="wallet-balance">
            <Coins size={21} />
            <span>DevCredits</span>
            <strong>{profile.credits}</strong>
          </div>
          <div className="level-row">
            <div><span>Level {profile.level}</span><b>{profile.xp} XP</b></div>
            <div className="game-progress"><span style={{ width: `${levelPct}%` }} /></div>
            <small>{Math.max(0, nextLevelXp - profile.xp)} XP to next level</small>
          </div>
          <a href="#level-rewards" className="next-reward">
            <Gift size={14} /> Next level gives{' '}
            {levelRewards.find((item) => item.level === profile.level + 1)?.credits || 'more'} DC
          </a>
        </div>
      </section>

      {message && <div className="notice game-notice">{message}</div>}

      <section className="exclusive-showcase">
        <div className="exclusive-head">
          <div>
            <span className="eyebrow">MYTHIC EXCLUSIVES</span>
            <h2><Crown size={20} /> You cannot buy these.</h2>
            <p>Complete achievements to permanently unlock their cosmetics.</p>
          </div>
          <button onClick={() => setFilter('exclusive')}>View all {exclusives.length}</button>
        </div>

        <div className="exclusive-track">
          {exclusives.slice(0, 6).map((item) => {
            const unlocked = owned.has(item.id);
            const achievement = achievements[item.unlockAchievement];
            const src = avatarAsset(item.id);

            return (
              <button
                key={item.id}
                className={`exclusive-mini rarity-${item.rarity} ${unlocked ? 'unlocked' : ''}`}
                onClick={() => setFilter('exclusive')}
              >
                <div className={`exclusive-mini-art ${item.preview || ''}`}>
                  {src ? (
                    <img src={src} alt={item.name} />
                  ) : item.type === 'avatar_frame' ? (
                    <Frame size={25} />
                  ) : item.type === 'ui_theme' ? (
                    <Palette size={25} />
                  ) : item.type === 'title' ? (
                    <Tag size={25} />
                  ) : (
                    <Hash size={25} />
                  )}
                </div>
                <span>{item.name}</span>
                <small>{unlocked ? 'Unlocked' : `Unlock: ${achievement?.name || 'Achievement'}`}</small>
              </button>
            );
          })}
        </div>
      </section>

      <section className="level-rewards-strip" id="level-rewards">
        <div className="level-rewards-head">
          <div><span className="eyebrow">LEVEL UP</span><h2>Level rewards</h2></div>
          <p>Every level permanently grants more DevCredits.</p>
        </div>
        <div className="level-reward-track">
          {levelRewards.map((reward) => (
            <div
              key={reward.level}
              className={`level-reward-node ${profile.level >= reward.level ? 'claimed' : reward.level === profile.level + 1 ? 'next' : ''}`}
            >
              <span>Lv {reward.level}</span>
              <b><Coins size={13} />{reward.credits}</b>
              <small>{profile.level >= reward.level ? 'Claimed' : reward.level === profile.level + 1 ? 'Next' : 'Locked'}</small>
            </div>
          ))}
        </div>
      </section>

      <div className="shop-filter-bar">
        {filters.map(([id, label]) => {
          const count =
            id === 'all'
              ? shop.length
              : id === 'exclusive'
                ? exclusives.length
                : shop.filter((item) => item.type === id).length;
          return (
            <button key={id} className={filter === id ? 'active' : ''} onClick={() => setFilter(id)}>
              {label}<span>{count}</span>
            </button>
          );
        })}
      </div>

      <div className="game-layout">
        <main>
          <div className="game-section-head">
            <div>
              <h2><ShoppingBag size={20} /> {filter === 'exclusive' ? 'Achievement Exclusives' : 'Shop'}</h2>
              <p>
                {filter === 'exclusive'
                  ? 'These rewards are earned, never purchased.'
                  : `${visible.length} cosmetics in this category · ${avatarCount} avatars available.`}
              </p>
            </div>
          </div>

          <div className="shop-grid">
            {visible.map((item) => (
              <ShopCard
                key={item.id}
                item={item}
                profile={profile}
                owned={owned}
                equippedIds={equippedIds}
                busy={busy}
                achievements={achievements}
                act={act}
              />
            ))}
          </div>
        </main>

        <aside className="game-sidebar">
          <section className="panel profile-loadout">
            <div className="panel-title">
              <div><h3><Flame size={17} /> Current loadout</h3><small>Your public class profile</small></div>
            </div>
            <div className="loadout-preview">
              <div className={`loadout-avatar ${profile.equipped?.avatar_frame || ''}`}>
                {avatarAsset(currentAvatar?.id) ? (
                  <img src={avatarAsset(currentAvatar.id)} alt="" />
                ) : (
                  currentAvatar?.value || `${user.firstName?.[0]}${user.lastName?.[0]}`
                )}
              </div>
              <div>
                <b>{user.firstName} {user.lastName}</b>
                <span>{shop.find((item) => item.id === profile.equipped?.title)?.value || 'Student'}</span>
                {profile.equipped?.slug && (
                  <small>#{shop.find((item) => item.id === profile.equipped.slug)?.value}</small>
                )}
              </div>
            </div>
          </section>

          <section className="panel">
            <div className="panel-title">
              <div><h3><Trophy size={17} /> Achievements</h3><small>{(profile.achievements || []).length} unlocked</small></div>
            </div>
            {(profile.achievements || []).slice(0, 8).map((id) => {
              const achievement = achievements[id];
              return (
                <div className="inventory-row" key={id}>
                  <span>
                    {achievement?.name || id}
                    <small>{achievement?.description || 'Achievement unlocked'}</small>
                  </span>
                  <b>Unlocked</b>
                </div>
              );
            })}
          </section>

          <section className="panel inventory-panel">
            <div className="panel-title">
              <div><h3><ShieldCheck size={17} /> Inventory</h3><small>{inventory.length} items owned</small></div>
            </div>
            {inventory.map((item) => (
              <div className="inventory-row" key={item.id}>
                <span>
                  {item.name}
                  <small>{typeLabel[item.type]}</small>
                </span>
                {equippedIds.has(item.id) ? (
                  <b>Equipped</b>
                ) : (
                  <button
                    className="btn secondary compact"
                    disabled={busy === item.id}
                    onClick={() => act('equip', item)}
                  >
                    Equip
                  </button>
                )}
              </div>
            ))}
          </section>

          <section className="panel transaction-panel">
            <div className="panel-title">
              <div><h3><History size={17} /> Recent rewards</h3><small>Credit history</small></div>
            </div>
            {transactions.slice(0, 10).map((transaction) => (
              <div className="transaction-row" key={transaction.id}>
                <div>
                  <b>{transaction.label}</b>
                  <small>{new Date(transaction.createdAt).toLocaleDateString('lv-LV')}</small>
                </div>
                <span className={Number(transaction.credits) >= 0 ? 'positive' : 'negative'}>
                  {Number(transaction.credits) > 0 ? '+' : ''}{transaction.credits} DC
                </span>
              </div>
            ))}
          </section>
        </aside>
      </div>
    </div>
  );
}

function ShopCard({ item, profile, owned, equippedIds, busy, achievements, act }) {
  const Icon = typeIcon[item.type] || Sparkles;
  const isOwned = owned.has(item.id);
  const equipped = equippedIds.has(item.id);
  const achievementLocked = Boolean(item.unlockAchievement) && !isOwned;
  const locked = profile.level < Number(item.minLevel || 1) || achievementLocked;
  const achievement = achievements[item.unlockAchievement];
  const src = avatarAsset(item.id);

  return (
    <article className={`shop-card rarity-${item.rarity} ${locked ? 'shop-locked' : ''} ${item.unlockAchievement ? 'achievement-exclusive-card' : ''}`}>
      <div className={`shop-preview ${item.preview || ''}`}>
        {src ? (
          <div className="shop-avatar-preview"><img src={src} alt={item.name} /></div>
        ) : (
          <Icon size={32} />
        )}
        <span>{item.rarity}</span>
        {item.type === 'slug' && <div className="slug-preview">#{item.value}</div>}
        {item.unlockAchievement && (
          <div className="achievement-ribbon"><Trophy size={12} /> Achievement exclusive</div>
        )}
        {achievementLocked ? (
          <div className="exclusive-unlock">
            <Lock size={13} />
            <div>
              <b>{achievement?.name || 'Achievement required'}</b>
              <small>{achievement?.description || 'Complete the required achievement.'}</small>
            </div>
          </div>
        ) : profile.level < Number(item.minLevel || 1) ? (
          <div className="level-lock"><Lock size={13} /> Lv {item.minLevel}</div>
        ) : null}
      </div>

      <div className="shop-copy">
        <div className="shop-type">{typeLabel[item.type]}</div>
        <h3>{item.name}</h3>
        <p>{item.description}</p>
        <div className="shop-card-foot">
          <span className="shop-price">
            {item.unlockAchievement ? (
              <><Trophy size={14} />{isOwned ? 'Earned' : 'Exclusive'}</>
            ) : (
              <><Coins size={14} />{item.price}</>
            )}
          </span>

          {isOwned ? (
            <button
              className={equipped ? 'btn secondary compact equipped' : 'btn secondary compact'}
              disabled={equipped || busy === item.id}
              onClick={() => act('equip', item)}
            >
              {equipped ? <><Check size={14} /> Equipped</> : busy === item.id ? 'Working…' : 'Equip'}
            </button>
          ) : item.unlockAchievement ? (
            <button className="btn secondary compact" disabled><Lock size={13} /> Locked</button>
          ) : (
            <button
              className="btn primary compact"
              disabled={locked || profile.credits < item.price || busy === item.id}
              onClick={() => act('buy', item)}
            >
              {profile.level < Number(item.minLevel || 1)
                ? `Lv ${item.minLevel}`
                : busy === item.id
                  ? 'Buying…'
                  : 'Buy'}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
