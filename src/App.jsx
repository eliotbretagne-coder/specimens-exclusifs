import React, { useState, useEffect, useRef, useCallback } from "react";
import { supabase, ADMIN_EMAIL } from "./supabaseClient.js";

const RARITIES = {
  rare:            { label: "Rare",             color: "#5B8DEF", dim: "#2b3a5c" },
  super_rare:      { label: "Super Rare",        color: "#2DD4BF", dim: "#1c3f3c" },
  epic:            { label: "Épique",            color: "#A855F7", dim: "#382a4d" },
  legendary:       { label: "Légendaire",        color: "#F0A93A", dim: "#4a3820" },
  mythic:          { label: "Mythique",          color: "#EC4899", dim: "#4a2338" },
  ultra_legendary: { label: "Ultra-Légendaire",  color: "#FFD54A", dim: "#4a3f1a" },
};
const RARITY_ORDER = ["rare", "super_rare", "epic", "legendary", "mythic", "ultra_legendary"];
const MAX_HP = 300, MAX_ATK = 150, MAX_SPEED = 10;
const EMPTY_MOVE = { name: "", dmg: 0, heal: 0, desc: "" };

function todayStr() { return new Date().toISOString().slice(0, 10); }
function slug(s) { return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") + "-" + Math.random().toString(36).slice(2, 7); }

function weightedPick(entries) {
  const total = entries.reduce((s, e) => s + e.p, 0);
  if (total <= 0) return null;
  let r = Math.random() * total;
  for (const e of entries) { if (r < e.p) return e; r -= e.p; }
  return entries[entries.length - 1];
}
function rollBox(box) {
  const pool = [
    ...(box.coin_entries || []).map((e) => ({ kind: "coin", value: e.amount, p: e.probability })),
    ...(box.character_entries || []).map((e) => ({ kind: "char", id: e.character_id, p: e.probability })),
    ...(box.item_entries || []).map((e) => ({ kind: "item", id: e.item_id, p: e.probability })),
  ];
  const results = [];
  for (let i = 0; i < (box.rewards_count || 1); i++) { const r = weightedPick(pool); if (r) results.push(r); }
  return results;
}

/* ---------------------------------- UI bits ---------------------------------- */

function RarityTag({ rarity }) {
  const r = RARITIES[rarity] || RARITIES.rare;
  return (
    <span style={{
      fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 700,
      letterSpacing: 0.5, textTransform: "uppercase", color: r.color,
      background: r.dim, border: `1px solid ${r.color}55`, borderRadius: 5,
      padding: "3px 7px", display: "inline-block",
    }}>{r.label}</span>
  );
}

function StatBar({ icon, value, max, color }) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  return (
    <div style={{ flex: 1 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 3 }}>
        <span>{icon}</span>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color: "#eee" }}>{value}<span style={{ color: "#5c5b68" }}>/{max}</span></span>
      </div>
      <div style={{ height: 6, background: "#232230", borderRadius: 4, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 4, boxShadow: `0 0 8px ${color}88` }} />
      </div>
    </div>
  );
}

function CharCard({ character, locked, onClick, small }) {
  const r = RARITIES[character.rarity] || RARITIES.rare;
  const foil = character.rarity === "ultra_legendary";
  return (
    <button onClick={onClick} style={{
      all: "unset", cursor: "pointer", position: "relative",
      width: small ? 92 : "100%", aspectRatio: "3/4.1",
      borderRadius: 14, overflow: "hidden", boxSizing: "border-box",
      background: locked ? "#1a1a22" : "#1d1c26",
      border: foil ? "2px solid transparent" : `1.5px solid ${locked ? "#33333f" : r.color + "88"}`,
      backgroundImage: foil && !locked ? "linear-gradient(#1d1c26,#1d1c26), conic-gradient(from 0deg, #FFD54A, #EC4899, #A855F7, #2DD4BF, #5B8DEF, #FFD54A)" : undefined,
      backgroundOrigin: "border-box", backgroundClip: foil && !locked ? "padding-box, border-box" : undefined,
      boxShadow: locked ? "none" : `0 0 16px ${r.color}33`,
    }}>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column" }}>
        <div style={{ flex: 1, position: "relative", overflow: "hidden", background: "#111117" }}>
          {character.image_url && !locked ? (
            <img src={character.image_url} alt={character.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30 }}>{locked ? "🔒" : "🃏"}</div>
          )}
          {locked && <div style={{ position: "absolute", inset: 0, background: "rgba(10,10,14,0.55)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>🔒</div>}
        </div>
        <div style={{ padding: "6px 7px 8px", background: "#17161f" }}>
          <div style={{ fontFamily: "Bungee, sans-serif", fontSize: small ? 10 : 12, color: locked ? "#55555f" : "#f4f2ec", lineHeight: 1.15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {locked ? "???" : character.name}
          </div>
          {!small && <div style={{ marginTop: 4 }}><RarityTag rarity={character.rarity} /></div>}
        </div>
      </div>
    </button>
  );
}

function Toast({ text }) {
  return (
    <div style={{
      position: "fixed", bottom: 90, left: "50%", transform: "translateX(-50%)",
      background: "#22212c", border: "1px solid #35343f", borderRadius: 12,
      padding: "10px 18px", fontSize: 13.5, fontWeight: 600, zIndex: 400,
      boxShadow: "0 8px 24px rgba(0,0,0,0.4)", maxWidth: "90%", textAlign: "center",
    }}>{text}</div>
  );
}

const inputStyle = {
  width: "100%", boxSizing: "border-box", background: "#17161f", border: "1.5px solid #2a2933",
  borderRadius: 12, padding: "12px 14px", color: "#f4f2ec", fontSize: 14, outline: "none", marginBottom: 10,
  fontFamily: "'Work Sans', sans-serif",
};
const selectStyle = { ...inputStyle, appearance: "auto" };

/* ---------------------------------- Auth ---------------------------------- */

function AuthScreen({ onToast }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setError(""); setBusy(true);
    try {
      if (mode === "signup") {
        const { error: err } = await supabase.auth.signUp({ email, password, options: { data: { username: username || email.split("@")[0] } } });
        if (err) throw err;
        onToast("Compte créé ! Si la confirmation par email est activée, vérifie ta boîte mail.");
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) throw err;
      }
    } catch (e) {
      setError(e.message === "Invalid login credentials" ? "Email ou mot de passe incorrect." : e.message);
    } finally { setBusy(false); }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0e0e13", color: "#f4f2ec", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "'Work Sans', sans-serif" }}>
      <div style={{ width: "100%", maxWidth: 380 }}>
        <div style={{ textAlign: "center", marginBottom: 26 }}>
          <div style={{ fontSize: 44, marginBottom: 6 }}>🃏</div>
          <div style={{ fontFamily: "Bungee, sans-serif", fontSize: 24, lineHeight: 1.25, background: "linear-gradient(90deg,#FFD54A,#EC4899,#A855F7)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            Les Spécimens<br/>Exclusifs
          </div>
        </div>
        <div style={{ display: "flex", background: "#17161f", borderRadius: 12, padding: 4, marginBottom: 18 }}>
          {["login", "signup"].map((m) => (
            <button key={m} onClick={() => setMode(m)} style={{
              all: "unset", cursor: "pointer", flex: 1, textAlign: "center", padding: "9px 0", borderRadius: 9,
              fontWeight: 700, fontSize: 12.5, background: mode === m ? "#2b2a38" : "transparent", color: mode === m ? "#F0A93A" : "#8a8998",
            }}>{m === "login" ? "Connexion" : "Inscription"}</button>
          ))}
        </div>
        {mode === "signup" && <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Ton pseudo" maxLength={18} style={inputStyle} />}
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" type="email" style={inputStyle} />
        <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mot de passe" type="password" style={inputStyle} />
        {error && <div style={{ color: "#ef6a6a", fontSize: 12.5, marginBottom: 10 }}>{error}</div>}
        <button disabled={busy || !email || !password} onClick={submit} style={{
          width: "100%", padding: "14px 0", borderRadius: 12, border: "none", cursor: "pointer",
          background: "linear-gradient(90deg,#F0A93A,#EC4899)", color: "#141119", fontWeight: 800, fontSize: 14.5, opacity: busy ? 0.6 : 1,
        }}>{busy ? "…" : mode === "login" ? "Se connecter" : "Créer mon compte"}</button>
      </div>
    </div>
  );
}

/* ---------------------------------- App ---------------------------------- */

export default function App() {
  const [session, setSession] = useState(undefined);
  const [profile, setProfile] = useState(null);
  const [game, setGame] = useState(null);
  const [tab, setTab] = useState("specimens");
  const [detailChar, setDetailChar] = useState(null);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const showToast = useCallback((msg) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const loadProfile = useCallback(async (uid) => {
    let { data, error } = await supabase.from("profiles").select("*").eq("id", uid).single();
    if (error || !data) { await new Promise((r) => setTimeout(r, 1200)); ({ data, error } = await supabase.from("profiles").select("*").eq("id", uid).single()); }
    setProfile(data || null);
  }, []);

  const loadGame = useCallback(async () => {
    const [c, i, b, n] = await Promise.all([
      supabase.from("characters").select("*"),
      supabase.from("game_items").select("*"),
      supabase.from("loot_boxes").select("*"),
      supabase.from("game_events").select("*").order("published_at", { ascending: false }),
    ]);
    setGame({ characters: c.data || [], items: i.data || [], boxes: b.data || [], events: n.data || [] });
  }, []);

  useEffect(() => { if (session) { loadProfile(session.user.id); loadGame(); } else { setProfile(null); } }, [session, loadProfile, loadGame]);

  const persistProfile = useCallback(async (patch) => {
    if (!profile) return;
    const next = { ...profile, ...patch };
    setProfile(next);
    await supabase.from("profiles").update(patch).eq("id", profile.id);
  }, [profile]);

  if (session === undefined) return <LoadingScreen text="Chargement…" />;
  if (!session) return <AuthScreen onToast={showToast} />;
  if (!profile || !game) return <LoadingScreen text="Chargement de ton profil…" />;

  const isAdmin = profile.is_admin === true;

  return (
    <div style={{ minHeight: "100vh", background: "#0e0e13", color: "#f4f2ec", fontFamily: "'Work Sans', sans-serif", paddingBottom: 78 }}>
      <TopBar profile={profile} menuOpen={menuOpen} setMenuOpen={setMenuOpen} onLogout={() => supabase.auth.signOut()} />
      <div style={{ maxWidth: 480, margin: "0 auto", padding: "14px 14px 24px" }}>
        {tab === "specimens" && <SpecimensTab profile={profile} game={game} onOpen={setDetailChar} />}
        {tab === "shop" && <ShopTab profile={profile} game={game} persistProfile={persistProfile} showToast={showToast} />}
        {tab === "battle" && <BattleTab profile={profile} game={game} persistProfile={persistProfile} />}
        {tab === "friends" && <FriendsTab profile={profile} game={game} showToast={showToast} persistProfile={persistProfile} />}
        {tab === "news" && <NewsTab game={game} profile={profile} showToast={showToast} />}
        {tab === "profile" && <ProfileTab profile={profile} game={game} persistProfile={persistProfile} showToast={showToast} />}
        {tab === "admin" && isAdmin && <AdminTab game={game} reload={loadGame} showToast={showToast} />}
      </div>
      <BottomNav tab={tab} setTab={setTab} isAdmin={isAdmin} />
      {detailChar && <CharModal character={detailChar} owned={profile.unlocked_character_ids?.includes(detailChar.id)} onClose={() => setDetailChar(null)} />}
      {toast && <Toast text={toast} />}
    </div>
  );
}

function LoadingScreen({ text }) {
  return <div style={{ minHeight: "100vh", background: "#0e0e13", display: "flex", alignItems: "center", justifyContent: "center", color: "#666", fontFamily: "'Work Sans', sans-serif" }}>{text}</div>;
}

function TopBar({ profile, onLogout, menuOpen, setMenuOpen }) {
  return (
    <div style={{
      position: "sticky", top: 0, zIndex: 50, background: "#0e0e13ee", backdropFilter: "blur(8px)",
      borderBottom: "1px solid #201f28", padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
        <div style={{ fontSize: 20 }}>🃏</div>
        <div style={{ fontFamily: "Bungee, sans-serif", fontSize: 13.5 }}>Spécimens Exclusifs</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, position: "relative" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, background: "#17161f", border: "1px solid #F0A93A44", borderRadius: 20, padding: "5px 12px 5px 8px" }}>
          <span style={{ fontSize: 15 }}>⭐</span>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 13.5, color: "#F0A93A" }}>{(profile.coins ?? 0).toLocaleString("fr-FR")}</span>
        </div>
        <button onClick={() => setMenuOpen((v) => !v)} style={{ all: "unset", cursor: "pointer", width: 30, height: 30, borderRadius: "50%", background: "#231c2e", border: "1px solid #A855F755", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>⚙️</button>
        {menuOpen && (
          <div style={{ position: "absolute", top: 40, right: 0, background: "#1c1b24", border: "1px solid #2a2933", borderRadius: 12, padding: 6, minWidth: 160, boxShadow: "0 10px 30px rgba(0,0,0,0.5)" }}>
            <button onClick={onLogout} style={{ all: "unset", cursor: "pointer", display: "block", width: "100%", padding: "9px 12px", borderRadius: 8, fontSize: 12.5, fontWeight: 700, color: "#ef6a6a" }}>🚪 Se déconnecter</button>
          </div>
        )}
      </div>
    </div>
  );
}

function BottomNav({ tab, setTab, isAdmin }) {
  const items = [
    { id: "specimens", icon: "🃏", label: "Spécimens" },
    { id: "shop", icon: "🎁", label: "Boutique" },
    { id: "battle", icon: "⚔️", label: "Combat" },
    { id: "friends", icon: "👥", label: "Amis" },
    { id: "news", icon: "📰", label: "Actus" },
    { id: "profile", icon: "👤", label: "Profil" },
    ...(isAdmin ? [{ id: "admin", icon: "🛠️", label: "Admin" }] : []),
  ];
  return (
    <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 100, background: "#141319ee", backdropFilter: "blur(10px)", borderTop: "1px solid #201f28", display: "flex", justifyContent: "space-around", padding: "8px 2px calc(8px + env(safe-area-inset-bottom))", overflowX: "auto" }}>
      {items.map((it) => (
        <button key={it.id} onClick={() => setTab(it.id)} style={{ all: "unset", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "4px 7px", borderRadius: 10, minWidth: 44, background: tab === it.id ? "#22212c" : "transparent" }}>
          <span style={{ fontSize: 16, opacity: tab === it.id ? 1 : 0.55 }}>{it.icon}</span>
          <span style={{ fontSize: 8.5, fontWeight: 700, color: tab === it.id ? "#F0A93A" : "#6f6e7c", letterSpacing: 0.2 }}>{it.label}</span>
        </button>
      ))}
    </div>
  );
}

/* ---------------------------------- Spécimens ---------------------------------- */

function SpecimensTab({ profile, game, onOpen }) {
  const [filter, setFilter] = useState("all");
  const owned = profile.unlocked_character_ids?.length || 0;
  const list = filter === "all" ? game.characters : game.characters.filter((c) => c.rarity === filter);
  const sorted = [...list].sort((a, b) => RARITY_ORDER.indexOf(b.rarity) - RARITY_ORDER.indexOf(a.rarity));
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
        <div style={{ fontFamily: "Bungee, sans-serif", fontSize: 18 }}>Collection</div>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12.5, color: "#9a99a8" }}>{owned}/{game.characters.length}</div>
      </div>
      <div style={{ display: "flex", gap: 6, overflowX: "auto", padding: "12px 0 14px" }}>
        {["all", ...RARITY_ORDER].map((r) => (
          <button key={r} onClick={() => setFilter(r)} style={{ all: "unset", cursor: "pointer", whiteSpace: "nowrap", padding: "6px 12px", borderRadius: 20, fontSize: 11.5, fontWeight: 700, border: `1.5px solid ${filter === r ? (r === "all" ? "#F0A93A" : RARITIES[r].color) : "#2a2933"}`, color: filter === r ? (r === "all" ? "#F0A93A" : RARITIES[r].color) : "#8a8998", background: filter === r ? "#1c1b24" : "transparent" }}>{r === "all" ? "Tous" : RARITIES[r].label}</button>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
        {sorted.map((c) => <CharCard key={c.id} character={c} locked={!profile.unlocked_character_ids?.includes(c.id)} onClick={() => onOpen(c)} />)}
      </div>
    </div>
  );
}

function MoveRow({ label, move }) {
  if (!move || (!move.dmg && !move.heal) || !move.name || move.name === "—") return null;
  return (
    <div style={{ background: "#17161f", borderRadius: 12, padding: "11px 13px", marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <div style={{ fontSize: 10, color: "#77768a", fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase" }}>{label}</div>
        <div style={{ display: "flex", gap: 8 }}>
          {move.dmg > 0 && <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: "#ef6a6a", fontWeight: 700 }}>-{move.dmg}</span>}
          {move.heal > 0 && <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: "#7cd992", fontWeight: 700 }}>+{move.heal}</span>}
        </div>
      </div>
      <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 3 }}>{move.name}</div>
      {move.desc && <div style={{ fontSize: 12, color: "#a3a2af", lineHeight: 1.45 }}>{move.desc}</div>}
    </div>
  );
}

function CharModal({ character, owned, onClose }) {
  const r = RARITIES[character.rarity];
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(6,6,9,0.78)", zIndex: 300, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 480, maxHeight: "88vh", overflowY: "auto", background: "#141319", borderRadius: "20px 20px 0 0", padding: "18px 18px 30px", border: `1px solid ${r.color}44`, borderBottom: "none" }}>
        <div style={{ width: 40, height: 4, background: "#2f2e39", borderRadius: 4, margin: "0 auto 14px" }} />
        <div style={{ display: "flex", gap: 14 }}>
          <div style={{ width: 100, height: 128, borderRadius: 12, overflow: "hidden", flexShrink: 0, background: "#0e0e13", border: `1.5px solid ${r.color}66` }}>
            {character.image_url && owned ? <img src={character.image_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32 }}>{owned ? "🃏" : "🔒"}</div>}
          </div>
          <div style={{ flex: 1 }}>
            <RarityTag rarity={character.rarity} />
            <div style={{ fontFamily: "Bungee, sans-serif", fontSize: 19, margin: "7px 0 4px" }}>{owned ? character.name : "???"}</div>
            <div style={{ fontSize: 12, color: "#8a8998" }}>📍 {character.habitat}</div>
          </div>
        </div>
        {owned ? (
          <>
            {character.description && <div style={{ fontSize: 13, color: "#c2c1cc", lineHeight: 1.55, marginTop: 14, fontStyle: "italic" }}>{character.description}</div>}
            <div style={{ display: "flex", gap: 12, background: "#17161f", borderRadius: 12, padding: "14px 14px", margin: "14px 0" }}>
              <StatBar icon="♡ Vie" value={character.hp} max={MAX_HP} color="#7cd992" />
              <StatBar icon="⚡ Attaque" value={Math.max(character.attack1?.dmg || 0, character.attack2?.dmg || 0)} max={MAX_ATK} color="#ef6a6a" />
              <StatBar icon="👟 Vitesse" value={character.speed} max={MAX_SPEED} color="#5B8DEF" />
            </div>
            <MoveRow label="Attaque 1" move={character.attack1} />
            <MoveRow label="Attaque 2" move={character.attack2} />
            <MoveRow label="Super" move={character.super} />
          </>
        ) : (
          <div style={{ marginTop: 18, padding: 16, background: "#17161f", borderRadius: 12, fontSize: 13, color: "#8a8998", textAlign: "center" }}>Spécimen non débloqué. Ouvre des boîtes dans la boutique pour tenter ta chance.</div>
        )}
        <button onClick={onClose} style={{ all: "unset", cursor: "pointer", display: "block", width: "100%", textAlign: "center", marginTop: 18, padding: "12px 0", borderRadius: 12, background: "#1e1d27", color: "#c2c1cc", fontWeight: 700, fontSize: 13 }}>Fermer</button>
      </div>
    </div>
  );
}

/* ---------------------------------- Boutique + animation ---------------------------------- */

function ShopTab({ profile, game, persistProfile, showToast }) {
  const [opening, setOpening] = useState(null);
  const [results, setResults] = useState(null);
  const [revealed, setRevealed] = useState(0);
  const charById = (id) => game.characters.find((c) => c.id === id);
  const itemById = (id) => game.items.find((i) => i.id === id);
  const freeClaimedToday = profile.last_free_box_claim === todayStr();
  const activeBoxes = game.boxes.filter((b) => b.is_active);

  const openBox = (box) => {
    if (box.is_free) { if (freeClaimedToday) { showToast("Boîte gratuite déjà réclamée aujourd'hui."); return; } }
    else if ((profile.coins || 0) < box.price) { showToast("Pas assez de pièces."); return; }
    setOpening(box); setResults(null); setRevealed(0);
  };

  const startRoll = async () => {
    const box = opening;
    const r = rollBox(box);
    setResults(r);

    const patch = {};
    let coins = profile.coins || 0;
    let unlockedC = [...(profile.unlocked_character_ids || [])];
    let unlockedI = [...(profile.unlocked_item_ids || [])];
    let stacks = { ...(profile.item_stacks || {}) };
    for (const res of r) {
      if (res.kind === "coin") coins += res.value;
      else if (res.kind === "char") { if (!unlockedC.includes(res.id)) unlockedC.push(res.id); }
      else if (res.kind === "item") { if (!unlockedI.includes(res.id)) unlockedI.push(res.id); stacks[res.id] = (stacks[res.id] || 0) + 1; }
    }
    patch.coins = box.is_free ? coins : coins - box.price;
    patch.unlocked_character_ids = unlockedC;
    patch.unlocked_item_ids = unlockedI;
    patch.item_stacks = stacks;
    patch.boxes_opened = (profile.boxes_opened || 0) + 1;
    if (box.is_free) patch.last_free_box_claim = todayStr();
    await persistProfile(patch);
  };

  return (
    <div>
      <div style={{ fontFamily: "Bungee, sans-serif", fontSize: 18, marginBottom: 14 }}>Boutique</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {activeBoxes.map((box) => (
          <div key={box.id} style={{ background: "#17161f", border: "1px solid #24232d", borderRadius: 16, padding: 12, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
            <div style={{ width: "100%", aspectRatio: "1", borderRadius: 12, overflow: "hidden", background: "#0e0e13" }}>
              {box.image_url ? <img src={box.image_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 34 }}>🎁</div>}
            </div>
            <div style={{ fontWeight: 800, fontSize: 12.5, textAlign: "center" }}>{box.name}</div>
            <div style={{ fontSize: 10, color: "#8a8998", textAlign: "center" }}>{box.rewards_count} récompense{box.rewards_count > 1 ? "s" : ""}</div>
            <button onClick={() => openBox(box)} style={{ all: "unset", cursor: "pointer", width: "100%", textAlign: "center", padding: "8px 0", borderRadius: 10, fontWeight: 800, fontSize: 12,
              background: box.is_free ? (freeClaimedToday ? "#232230" : "linear-gradient(90deg,#2DD4BF,#5B8DEF)") : "#232230",
              color: box.is_free ? (freeClaimedToday ? "#5c5b68" : "#0e0e13") : "#F0A93A", border: box.is_free ? "none" : "1px solid #F0A93A55" }}>
              {box.is_free ? (freeClaimedToday ? "Réclamée" : "Gratuit") : `⭐ ${box.price}`}
            </button>
          </div>
        ))}
      </div>

      {opening && (
        <BoxOpenOverlay
          box={opening} results={results} revealed={revealed}
          onStart={startRoll}
          onRevealNext={() => setRevealed((v) => v + 1)}
          onClose={() => setOpening(null)}
          charById={charById} itemById={itemById}
        />
      )}
    </div>
  );
}

function BoxOpenOverlay({ box, results, revealed, onStart, onRevealNext, onClose, charById, itemById }) {
  const finished = results && revealed >= results.length;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(4,4,7,0.94)", zIndex: 300, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, overflow: "hidden" }}>
      <style>{`
        @keyframes chestPulse { 0%,100%{ transform: scale(1) rotate(-1deg);} 50%{ transform: scale(1.06) rotate(1deg);} }
        @keyframes sparkle { 0%{ opacity:0; transform: scale(0) rotate(0deg);} 40%{opacity:1;} 100%{ opacity:0; transform: scale(1.4) rotate(180deg);} }
        @keyframes flipReveal { 0%{ transform: rotateY(180deg) scale(0.85); opacity:0.4;} 60%{ transform: rotateY(0deg) scale(1.06);} 100%{ transform: rotateY(0deg) scale(1); opacity:1;} }
        @keyframes shineSweep { 0%{ background-position: -150% 0;} 100%{ background-position: 250% 0;} }
        @keyframes glowRing { 0%,100%{ box-shadow: 0 0 30px currentColor, 0 0 60px currentColor;} 50%{ box-shadow: 0 0 55px currentColor, 0 0 100px currentColor;} }
      `}</style>

      {!results ? (
        <>
          <div onClick={onStart} style={{
            width: 170, height: 220, borderRadius: 18, cursor: "pointer", position: "relative",
            background: "linear-gradient(135deg,#26202f,#17161f)", border: "2px solid #F0A93A77",
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 60,
            animation: "chestPulse 1.3s ease-in-out infinite", color: "#F0A93A",
          }}>
            🎁
            {[...Array(6)].map((_, i) => (
              <span key={i} style={{ position: "absolute", fontSize: 16, top: `${10 + (i * 13) % 80}%`, left: `${(i * 27) % 90}%`, animation: `sparkle 1.6s ease-in-out ${i * 0.25}s infinite` }}>✨</span>
            ))}
          </div>
          <div style={{ marginTop: 24, fontSize: 13.5, color: "#e5e4ee", fontWeight: 700 }}>Touche la boîte pour l'ouvrir</div>
        </>
      ) : (
        <>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center", maxWidth: 440, minHeight: 190 }}>
            {results.map((res, i) => {
              if (i < revealed) return <RewardCard key={i} res={res} charById={charById} itemById={itemById} revealing={i === revealed - 1} />;
              if (i === revealed) return <FaceDownCard key={i} active onClick={onRevealNext} />;
              return <FaceDownCard key={i} />;
            })}
          </div>
          {!finished ? (
            <div style={{ marginTop: 22, fontSize: 13, color: "#F0A93A", fontWeight: 700 }}>👆 Touche la carte {revealed + 1} / {results.length} pour la révéler</div>
          ) : (
            <button onClick={onClose} style={{ all: "unset", cursor: "pointer", marginTop: 26, padding: "13px 30px", borderRadius: 12, background: "linear-gradient(90deg,#F0A93A,#EC4899)", color: "#141119", fontWeight: 800, fontSize: 13.5 }}>Continuer</button>
          )}
        </>
      )}
    </div>
  );
}

function FaceDownCard({ active, onClick }) {
  return (
    <button onClick={active ? onClick : undefined} style={{
      all: "unset", width: 118, height: 154, borderRadius: 13, boxSizing: "border-box",
      background: "linear-gradient(135deg,#26202f,#17161f)",
      border: active ? "2px solid #F0A93A" : "1.5px solid #2e2d3a",
      display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30,
      opacity: active ? 1 : 0.4, cursor: active ? "pointer" : "default",
      animation: active ? "glowRing 1.1s ease-in-out infinite" : undefined, color: "#F0A93A",
    }}>🃏</button>
  );
}

function RewardCard({ res, charById, itemById, revealing }) {
  let color = "#F0A93A", border = "#F0A93A66";
  let body = null;
  if (res.kind === "coin") {
    body = (<><div style={{ fontSize: 26 }}>⭐</div><div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 800, fontSize: 16, color: "#F0A93A" }}>+{res.value}</div><div style={{ fontSize: 9.5, color: "#8a8998" }}>pièces</div></>);
  } else if (res.kind === "char") {
    const c = charById(res.id);
    if (c) { const r = RARITIES[c.rarity]; color = r.color; border = r.color;
      body = (<>
        <div style={{ width: "100%", height: 92, borderRadius: 8, overflow: "hidden", background: "#0e0e13" }}>
          {c.image_url ? <img src={c.image_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>🃏</div>}
        </div>
        <div style={{ fontWeight: 800, fontSize: 11, marginTop: 6, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", width: "100%", textAlign: "center" }}>{c.name}</div>
        <RarityTag rarity={c.rarity} />
      </>);
    }
  } else {
    const it = itemById(res.id);
    if (it) { const r = RARITIES[it.rarity]; color = r.color; border = r.color;
      body = (<>
        <div style={{ width: "100%", height: 92, borderRadius: 8, overflow: "hidden", background: "#0e0e13" }}>
          {it.image_url ? <img src={it.image_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>🎒</div>}
        </div>
        <div style={{ fontWeight: 800, fontSize: 11, marginTop: 6, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", width: "100%", textAlign: "center" }}>{it.name}</div>
        <RarityTag rarity={it.rarity} />
      </>);
    }
  }
  return (
    <div style={{
      width: 118, height: 154, borderRadius: 13, background: "#17161f", border: `2px solid ${border}`,
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 8,
      color, animation: revealing ? "flipReveal 0.6s ease-out, glowRing 1.4s ease-in-out 0.6s 2" : undefined,
    }}>{body}</div>
  );
}

/* ---------------------------------- Combat ---------------------------------- */

function BattleTab({ profile, game, persistProfile }) {
  const owned = game.characters.filter((c) => profile.unlocked_character_ids?.includes(c.id));
  const [team, setTeam] = useState([]);
  const [fight, setFight] = useState(null);
  const logRef = useRef(null);
  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [fight?.log]);
  const toggleTeam = (id) => setTeam((t) => t.includes(id) ? t.filter((x) => x !== id) : (t.length < 3 ? [...t, id] : t));
  const charById = (id) => game.characters.find((c) => c.id === id);
  const pickBotTeam = () => [...game.characters].sort(() => Math.random() - 0.5).slice(0, 3);

  const startFight = () => {
    const botTeam = pickBotTeam();
    const playerChars = team.map((id) => charById(id));
    setFight({
      player: { chars: playerChars.map((c) => ({ ...c, curHp: c.hp, buff: 0, superUsed: false })), active: 0 },
      bot: { chars: botTeam.map((c) => ({ ...c, curHp: c.hp, buff: 0, superUsed: false })), active: 0 },
      log: [`Le combat commence : ${playerChars.map((c) => c.name).join(", ")} contre ${botTeam.map((c) => c.name).join(", ")} !`],
      over: false, result: null,
    });
  };

  const doTurn = (playerAction) => {
    setFight((f) => {
      if (!f || f.over) return f;
      const state = JSON.parse(JSON.stringify(f));
      const p = state.player, b = state.bot;
      const pc = p.chars[p.active], bc = b.chars[b.active];
      const log = []; let itemConsumedId = null;
      if (playerAction.type === "item") { pc.buff += playerAction.item.atk_bonus || 0; log.push(`🎒 Tu utilises ${playerAction.item.name} sur ${pc.name}.`); itemConsumedId = playerAction.item.id; }
      const botMoves = ["attack1", bc.attack2 && (bc.attack2.dmg || bc.attack2.heal) ? "attack2" : null, !bc.superUsed ? "super" : null].filter(Boolean);
      const botMoveKey = botMoves[Math.floor(Math.random() * botMoves.length)] || "attack1";
      const playerMoveKey = playerAction.type === "move" ? playerAction.moveKey : "attack1";
      const applyMove = (attacker, defender, moveKey, isSuper) => {
        const move = attacker[moveKey]; if (!move) return [];
        const dmg = Math.round((move.dmg || 0) * (1 + (attacker.buff || 0) / 100));
        defender.curHp = Math.max(0, defender.curHp - dmg);
        if (move.heal) attacker.curHp = Math.min(attacker.hp, attacker.curHp + move.heal);
        if (isSuper) attacker.superUsed = true;
        const parts = [];
        if (dmg > 0) parts.push(`${attacker.name} utilise ${move.name} : -${dmg} PV à ${defender.name}.`);
        if (move.heal) parts.push(`${attacker.name} récupère ${move.heal} PV.`);
        return parts;
      };
      const order = pc.speed >= bc.speed ? ["p", "bot"] : ["bot", "p"];
      for (const turn of order) {
        if (state.player.chars.every((c) => c.curHp <= 0) || state.bot.chars.every((c) => c.curHp <= 0)) break;
        if (turn === "p") log.push(...applyMove(pc, bc, playerMoveKey, playerMoveKey === "super"));
        else log.push(...applyMove(bc, pc, botMoveKey, botMoveKey === "super"));
      }
      const advance = (side) => { while (side.active < side.chars.length && side.chars[side.active].curHp <= 0) { log.push(`${side.chars[side.active].name} est K.O. !`); side.active += 1; } };
      advance(p); advance(b);
      let over = false, result = null;
      if (p.active >= p.chars.length) { over = true; result = "lose"; log.push("Défaite..."); }
      else if (b.active >= b.chars.length) { over = true; result = "win"; log.push("Victoire ! 🎉"); }
      state.log = [...state.log, ...log]; state.over = over; state.result = result;
      if (over || itemConsumedId) {
        const patch = {};
        if (itemConsumedId) { const stacks = { ...(profile.item_stacks || {}) }; stacks[itemConsumedId] = Math.max(0, (stacks[itemConsumedId] || 0) - 1); patch.item_stacks = stacks; }
        if (over) { const reward = result === "win" ? 40 + Math.floor(Math.random() * 60) : 15; patch.coins = (profile.coins || 0) + reward; state.reward = reward; }
        persistProfile(patch);
      }
      return state;
    });
  };

  if (fight) {
    const p = fight.player, b = fight.bot;
    const pc = p.chars[Math.min(p.active, p.chars.length - 1)];
    const myItems = Object.entries(profile.item_stacks || {}).filter(([, n]) => n > 0);
    const itemById = (id) => game.items.find((i) => i.id === id);
    return (
      <div>
        <style>{`@keyframes activeGlow { 0%,100%{ box-shadow: 0 0 0 3px #F0A93A, 0 0 18px #F0A93A88;} 50%{ box-shadow: 0 0 0 3px #FFD54A, 0 0 26px #FFD54Aaa;} }`}</style>
        <div style={{ background: "linear-gradient(160deg,#1a2440,#241830)", border: "1px solid #33345a", borderRadius: 16, padding: 12, marginBottom: 12 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
            <BattleSidePanel title="Ton équipe" chars={p.chars} active={p.active} teamColor="#5B8DEF" />
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2 }}>
              <div style={{ fontSize: 22 }}>⚔️</div>
              <div style={{ fontSize: 9, color: "#8a8998", fontWeight: 800 }}>VS</div>
            </div>
            <BattleSidePanel title="Adversaire" chars={b.chars} active={b.active} align="right" teamColor="#ef6a6a" />
          </div>
        </div>
        <div ref={logRef} style={{ background: "#111117", border: "1px solid #232230", borderRadius: 12, padding: 12, height: 130, overflowY: "auto", margin: "12px 0", fontSize: 12, lineHeight: 1.6, color: "#b9b8c4" }}>{fight.log.map((l, i) => <div key={i}>{l}</div>)}</div>
        {!fight.over ? (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, background: "#1a1922", borderRadius: 10, padding: "8px 10px" }}>
              {pc.image_url ? <img src={pc.image_url} alt="" style={{ width: 30, height: 30, borderRadius: "50%", objectFit: "cover", border: "2px solid #5B8DEF" }} /> : <div style={{ width: 30, height: 30, borderRadius: "50%", background: "#5B8DEF33", display: "flex", alignItems: "center", justifyContent: "center" }}>🃏</div>}
              <div style={{ fontSize: 12.5, fontWeight: 800 }}>Choisis l'action de {pc.name}</div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <ActionBtn label={pc.attack1?.name} sub={`-${pc.attack1?.dmg || 0} dégâts`} icon="🥊" kind="attack1" onClick={() => doTurn({ type: "move", moveKey: "attack1" })} />
              {pc.attack2 && (pc.attack2.dmg > 0 || pc.attack2.heal > 0) && <ActionBtn label={pc.attack2.name} sub={pc.attack2.dmg ? `-${pc.attack2.dmg} dégâts` : `+${pc.attack2.heal} PV`} icon="💥" kind="attack2" onClick={() => doTurn({ type: "move", moveKey: "attack2" })} />}
              {pc.super && <ActionBtn label={pc.super.name} sub={`SUPER · -${pc.super.dmg}`} icon="🌟" kind="super" disabled={pc.superUsed} onClick={() => doTurn({ type: "move", moveKey: "super" })} />}
            </div>
            {myItems.length > 0 && (<>
              <div style={{ fontSize: 11, color: "#A855F7", fontWeight: 800, margin: "12px 0 6px", textTransform: "uppercase" }}>🎒 Objets actifs</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{myItems.map(([id, n]) => { const it = itemById(id); if (!it) return null; return <ActionBtn key={id} label={`${it.name} ×${n}`} sub={it.effect} icon="🎒" kind="item" onClick={() => doTurn({ type: "item", item: it })} />; })}</div>
            </>)}
          </>
        ) : (
          <div style={{ textAlign: "center", padding: "18px 0", background: fight.result === "win" ? "linear-gradient(160deg,#173322,#0e0e13)" : "linear-gradient(160deg,#331717,#0e0e13)", borderRadius: 16, border: `1.5px solid ${fight.result === "win" ? "#7cd99255" : "#ef6a6a55"}` }}>
            <div style={{ fontSize: 40, marginBottom: 6 }}>{fight.result === "win" ? "🏆" : "💀"}</div>
            <div style={{ fontFamily: "Bungee, sans-serif", fontSize: 20, color: fight.result === "win" ? "#7cd992" : "#ef6a6a", marginBottom: 6 }}>{fight.result === "win" ? "Victoire !" : "Défaite"}</div>
            <div style={{ fontSize: 14, color: "#F0A93A", fontWeight: 800, marginBottom: 16 }}>+{fight.reward} ⭐</div>
            <button onClick={() => { setFight(null); setTeam([]); }} style={{ all: "unset", cursor: "pointer", padding: "12px 28px", borderRadius: 12, background: "linear-gradient(90deg,#F0A93A,#EC4899)", color: "#141119", fontWeight: 800, fontSize: 13.5 }}>Retour</button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <div style={{ fontFamily: "Bungee, sans-serif", fontSize: 18, marginBottom: 4 }}>Combat</div>
      <div style={{ fontSize: 12.5, color: "#8a8998", marginBottom: 14 }}>Choisis jusqu'à 3 spécimens et affronte un bot. Le combat amical entre joueurs arrive bientôt dans l'onglet Amis.</div>
      {owned.length === 0 ? (
        <div style={{ background: "#17161f", borderRadius: 12, padding: 20, textAlign: "center", fontSize: 13, color: "#8a8998" }}>Débloque des spécimens dans la boutique d'abord.</div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 16 }}>
            {owned.map((c) => (
              <div key={c.id} style={{ position: "relative" }}>
                <CharCard character={c} locked={false} onClick={() => toggleTeam(c.id)} />
                {team.includes(c.id) && <div style={{ position: "absolute", top: 6, right: 6, width: 22, height: 22, borderRadius: "50%", background: "#F0A93A", color: "#141119", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 12 }}>{team.indexOf(c.id) + 1}</div>}
              </div>
            ))}
          </div>
          <button disabled={team.length === 0} onClick={startFight} style={{ all: "unset", cursor: team.length ? "pointer" : "not-allowed", display: "block", width: "100%", textAlign: "center", padding: "14px 0", borderRadius: 12, fontWeight: 800, fontSize: 14, background: team.length ? "linear-gradient(90deg,#F0A93A,#EC4899)" : "#232230", color: team.length ? "#141119" : "#5c5b68" }}>Lancer le combat ({team.length}/3)</button>
        </>
      )}
    </div>
  );
}

const ACTION_KIND_STYLE = {
  attack1: { bg: "linear-gradient(135deg,#3a2a1a,#2a1c12)", border: "#F0A93A", text: "#F0A93A" },
  attack2: { bg: "linear-gradient(135deg,#1a2a3a,#12202c)", border: "#5B8DEF", text: "#5B8DEF" },
  super:   { bg: "linear-gradient(135deg,#3a2a12,#2a1c08)", border: "#FFD54A", text: "#FFD54A" },
  item:    { bg: "linear-gradient(135deg,#2a1a3a,#1c122a)", border: "#A855F7", text: "#A855F7" },
};

function ActionBtn({ label, sub, icon, onClick, disabled, kind }) {
  const st = ACTION_KIND_STYLE[kind] || ACTION_KIND_STYLE.attack1;
  return (
    <button disabled={disabled} onClick={onClick} style={{
      all: "unset", cursor: disabled ? "not-allowed" : "pointer", padding: "12px 12px", borderRadius: 13,
      background: disabled ? "#1a1922" : st.bg, border: `2px solid ${disabled ? "#232230" : st.border}`,
      opacity: disabled ? 0.35 : 1, display: "flex", alignItems: "center", gap: 9,
      boxShadow: disabled ? "none" : `0 3px 12px ${st.border}33`,
    }}>
      <span style={{ fontSize: 18 }}>{icon}</span>
      <span style={{ textAlign: "left" }}>
        <div style={{ fontWeight: 800, fontSize: 12.5, color: disabled ? "#6b6a78" : st.text, marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: 10.5, color: "#a3a2af" }}>{sub}</div>
      </span>
    </button>
  );
}

function BattleSidePanel({ title, chars, active, align, teamColor }) {
  return (
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 10, color: teamColor, fontWeight: 800, marginBottom: 8, textAlign: align === "right" ? "right" : "left", textTransform: "uppercase", letterSpacing: 0.4 }}>{title}</div>
      {chars.map((c, i) => {
        const pct = Math.max(0, Math.round((c.curHp / c.hp) * 100));
        const isActive = i === active && c.curHp > 0;
        const hpColor = pct > 50 ? "#7cd992" : pct > 20 ? "#F0A93A" : "#ef6a6a";
        return (
          <div key={i} style={{ opacity: c.curHp <= 0 ? 0.3 : 1, marginBottom: 8, display: "flex", gap: 7, flexDirection: align === "right" ? "row-reverse" : "row", alignItems: "center" }}>
            <div style={{
              width: 34, height: 34, borderRadius: "50%", flexShrink: 0, overflow: "hidden", background: "#0e0e13",
              border: `2px solid ${isActive ? teamColor : "#33333f"}`,
              animation: isActive ? "activeGlow 1s ease-in-out infinite" : undefined,
            }}>
              {c.image_url ? <img src={c.image_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>🃏</div>}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, marginBottom: 2, flexDirection: align === "right" ? "row-reverse" : "row" }}>
                <span style={{ fontWeight: isActive ? 800 : 600, color: isActive ? "#fff" : "#c2c1cc" }}>{c.name}</span>
                <span style={{ color: hpColor, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 }}>{c.curHp}/{c.hp}</span>
              </div>
              <div style={{ height: 6, background: "#232230", borderRadius: 4, overflow: "hidden" }}><div style={{ height: "100%", width: `${pct}%`, background: hpColor, boxShadow: `0 0 6px ${hpColor}` }} /></div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------------------------------- Amis ---------------------------------- */

function FriendsTab({ profile, game, showToast, persistProfile }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [friendships, setFriendships] = useState([]);
  const [challenges, setChallenges] = useState([]);
  const [busy, setBusy] = useState(false);
  const [pickingFor, setPickingFor] = useState(null); // { mode: 'new'|'respond', friend or challenge }
  const [activeChallengeId, setActiveChallengeId] = useState(null);

  const loadFriendships = useCallback(async () => {
    const { data } = await supabase.from("friendships").select("*").or(`requester_id.eq.${profile.id},addressee_id.eq.${profile.id}`);
    if (!data) return;
    const ids = [...new Set(data.flatMap((f) => [f.requester_id, f.addressee_id]))].filter((id) => id !== profile.id);
    let profiles = {};
    if (ids.length) { const { data: p } = await supabase.from("profiles").select("id,username,avatar").in("id", ids); (p || []).forEach((pr) => { profiles[pr.id] = pr; }); }
    setFriendships(data.map((f) => ({ ...f, other: profiles[f.requester_id === profile.id ? f.addressee_id : f.requester_id] })));
  }, [profile.id]);

  const loadChallenges = useCallback(async () => {
    const { data } = await supabase.from("battle_challenges").select("*").or(`challenger_id.eq.${profile.id},opponent_id.eq.${profile.id}`).neq("status", "declined").order("created_at", { ascending: false });
    if (!data) return;
    const ids = [...new Set(data.flatMap((c) => [c.challenger_id, c.opponent_id]))];
    const { data: p } = await supabase.from("profiles").select("id,username,avatar").in("id", ids);
    const profiles = {}; (p || []).forEach((pr) => { profiles[pr.id] = pr; });
    setChallenges(data.map((c) => ({ ...c, challenger: profiles[c.challenger_id], opponent: profiles[c.opponent_id] })));
  }, [profile.id]);

  useEffect(() => { loadFriendships(); loadChallenges(); }, [loadFriendships, loadChallenges]);

  useEffect(() => {
    const ch = supabase.channel(`challenges-${profile.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "battle_challenges" }, () => loadChallenges())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [profile.id, loadChallenges]);

  const search = async (q) => {
    setQuery(q);
    if (q.trim().length < 2) { setResults([]); return; }
    const { data } = await supabase.from("profiles").select("id,username,avatar").ilike("username", `%${q.trim()}%`).neq("id", profile.id).limit(10);
    setResults(data || []);
  };

  const sendRequest = async (target) => {
    setBusy(true);
    const { error } = await supabase.from("friendships").insert({ requester_id: profile.id, addressee_id: target.id, status: "pending" });
    setBusy(false);
    if (error) showToast("Erreur : " + error.message); else { showToast(`Demande envoyée à ${target.username}.`); loadFriendships(); }
  };

  const respond = async (f, status) => { await supabase.from("friendships").update({ status }).eq("id", f.id); loadFriendships(); };

  const createChallenge = async (friend, teamIds) => {
    const hp = teamIds.map((id) => game.characters.find((c) => c.id === id)?.hp || 100);
    const { error } = await supabase.from("battle_challenges").insert({
      challenger_id: profile.id, opponent_id: friend.id, status: "pending",
      state: { teamA: teamIds, hpA: hp, superA: teamIds.map(() => false), activeA: 0, log: [] },
    });
    setPickingFor(null);
    if (error) showToast("Erreur : " + error.message); else { showToast(`Défi envoyé à ${friend.username} !`); loadChallenges(); }
  };

  const acceptChallenge = async (challenge, teamIds) => {
    const hp = teamIds.map((id) => game.characters.find((c) => c.id === id)?.hp || 100);
    const st = challenge.state;
    const { error } = await supabase.from("battle_challenges").update({
      status: "fighting",
      state: { ...st, teamB: teamIds, hpB: hp, superB: teamIds.map(() => false), activeB: 0, choiceA: null, choiceB: null, log: [...(st.log || []), "Le combat commence !"], finished: false },
    }).eq("id", challenge.id);
    setPickingFor(null);
    if (error) showToast("Erreur : " + error.message); else { setActiveChallengeId(challenge.id); loadChallenges(); }
  };

  const declineChallenge = async (challenge) => { await supabase.from("battle_challenges").update({ status: "declined" }).eq("id", challenge.id); loadChallenges(); };

  const pending = friendships.filter((f) => f.status === "pending" && f.addressee_id === profile.id);
  const sent = friendships.filter((f) => f.status === "pending" && f.requester_id === profile.id);
  const accepted = friendships.filter((f) => f.status === "accepted");
  const friendIds = new Set(friendships.map((f) => f.other?.id));

  const incomingChallenges = challenges.filter((c) => c.opponent_id === profile.id && c.status === "pending");
  const outgoingChallenges = challenges.filter((c) => c.challenger_id === profile.id && c.status === "pending");
  const liveChallenges = challenges.filter((c) => c.status === "fighting" && (c.challenger_id === profile.id || c.opponent_id === profile.id));
  const owned = game.characters.filter((c) => profile.unlocked_character_ids?.includes(c.id));

  if (activeChallengeId) {
    const c = challenges.find((x) => x.id === activeChallengeId);
    if (!c || c.status !== "fighting") { return <div style={{ padding: 20, textAlign: "center", color: "#8a8998" }}>Combat terminé ou introuvable. <button onClick={() => setActiveChallengeId(null)} style={{ all: "unset", cursor: "pointer", color: "#F0A93A", fontWeight: 700 }}>Retour</button></div>; }
    return <FriendBattleView challenge={c} game={game} profile={profile} persistProfile={persistProfile} onExit={() => setActiveChallengeId(null)} />;
  }

  return (
    <div>
      <div style={{ fontFamily: "Bungee, sans-serif", fontSize: 18, marginBottom: 14 }}>Amis</div>

      <input value={query} onChange={(e) => search(e.target.value)} placeholder="Chercher un pseudo…" style={inputStyle} />
      {results.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
          {results.map((u) => (
            <div key={u.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#17161f", border: "1px solid #24232d", borderRadius: 10, padding: "9px 12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span>{u.avatar || "🙂"}</span><span style={{ fontSize: 13, fontWeight: 700 }}>{u.username}</span></div>
              {friendIds.has(u.id) ? <span style={{ fontSize: 11, color: "#5c5b68" }}>déjà lié</span> : <button disabled={busy} onClick={() => sendRequest(u)} style={{ all: "unset", cursor: "pointer", fontSize: 11.5, fontWeight: 700, color: "#F0A93A", padding: "6px 10px", borderRadius: 8, border: "1px solid #F0A93A55" }}>+ Ajouter</button>}
            </div>
          ))}
        </div>
      )}

      {liveChallenges.length > 0 && (
        <Section title="⚔️ Combats en cours">
          {liveChallenges.map((c) => { const other = c.challenger_id === profile.id ? c.opponent : c.challenger; return (
            <button key={c.id} onClick={() => setActiveChallengeId(c.id)} style={{ all: "unset", cursor: "pointer", display: "block", width: "100%", background: "linear-gradient(90deg,#2a2314,#17161f)", border: "1.5px solid #F0A93A66", borderRadius: 10, padding: "10px 12px", marginBottom: 6, fontSize: 12.5, fontWeight: 800, color: "#F0A93A" }}>Rejoindre le combat contre {other?.username || "?"} ▶</button>
          ); })}
        </Section>
      )}

      {incomingChallenges.length > 0 && (
        <Section title="Défis reçus">
          {incomingChallenges.map((c) => (
            <div key={c.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#17161f", border: "1px solid #24232d", borderRadius: 10, padding: "9px 12px", marginBottom: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>{c.challenger?.username || "?"} te défie</span>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => setPickingFor({ mode: "respond", challenge: c })} style={{ all: "unset", cursor: "pointer", fontSize: 11, fontWeight: 700, color: "#7cd992", padding: "6px 9px", borderRadius: 8, border: "1px solid #7cd99255" }}>Répondre</button>
                <button onClick={() => declineChallenge(c)} style={{ all: "unset", cursor: "pointer", fontSize: 11, fontWeight: 700, color: "#ef6a6a", padding: "6px 9px", borderRadius: 8, border: "1px solid #ef6a6a55" }}>Refuser</button>
              </div>
            </div>
          ))}
        </Section>
      )}

      {outgoingChallenges.length > 0 && (
        <Section title="Défis envoyés">
          {outgoingChallenges.map((c) => <div key={c.id} style={{ fontSize: 12.5, color: "#8a8998", background: "#17161f", border: "1px solid #24232d", borderRadius: 10, padding: "9px 12px", marginBottom: 6 }}>{c.opponent?.username || "?"} — en attente</div>)}
        </Section>
      )}

      {pending.length > 0 && (
        <Section title="Demandes d'amis reçues">
          {pending.map((f) => (
            <div key={f.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#17161f", border: "1px solid #24232d", borderRadius: 10, padding: "9px 12px", marginBottom: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>{f.other?.username || "?"}</span>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => respond(f, "accepted")} style={{ all: "unset", cursor: "pointer", fontSize: 11, fontWeight: 700, color: "#7cd992", padding: "6px 9px", borderRadius: 8, border: "1px solid #7cd99255" }}>Accepter</button>
                <button onClick={() => respond(f, "declined")} style={{ all: "unset", cursor: "pointer", fontSize: 11, fontWeight: 700, color: "#ef6a6a", padding: "6px 9px", borderRadius: 8, border: "1px solid #ef6a6a55" }}>Refuser</button>
              </div>
            </div>
          ))}
        </Section>
      )}

      {sent.length > 0 && <Section title="Demandes envoyées">{sent.map((f) => <div key={f.id} style={{ fontSize: 12.5, color: "#8a8998", background: "#17161f", border: "1px solid #24232d", borderRadius: 10, padding: "9px 12px", marginBottom: 6 }}>{f.other?.username || "?"} — en attente</div>)}</Section>}

      <Section title={`Amis (${accepted.length})`}>
        {accepted.length === 0 && <div style={{ fontSize: 12.5, color: "#5c5b68" }}>Aucun ami pour l'instant.</div>}
        {accepted.map((f) => (
          <div key={f.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#17161f", border: "1px solid #24232d", borderRadius: 10, padding: "9px 12px", marginBottom: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span>{f.other?.avatar || "🙂"}</span><span style={{ fontSize: 13, fontWeight: 700 }}>{f.other?.username || "?"}</span></div>
            <button disabled={owned.length === 0} onClick={() => setPickingFor({ mode: "new", friend: f.other })} style={{ all: "unset", cursor: owned.length ? "pointer" : "not-allowed", fontSize: 11, fontWeight: 800, color: owned.length ? "#F0A93A" : "#5c5b68", padding: "6px 10px", borderRadius: 8, border: `1px solid ${owned.length ? "#F0A93A55" : "#2a2933"}` }}>⚔️ Défier</button>
          </div>
        ))}
      </Section>

      {pickingFor && (
        <TeamPickModal
          owned={owned}
          onCancel={() => setPickingFor(null)}
          onConfirm={(teamIds) => pickingFor.mode === "new" ? createChallenge(pickingFor.friend, teamIds) : acceptChallenge(pickingFor.challenge, teamIds)}
        />
      )}
    </div>
  );
}

function TeamPickModal({ owned, onCancel, onConfirm }) {
  const [team, setTeam] = useState([]);
  const toggle = (id) => setTeam((t) => t.includes(id) ? t.filter((x) => x !== id) : (t.length < 3 ? [...t, id] : t));
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(6,6,9,0.85)", zIndex: 300, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div style={{ width: "100%", maxWidth: 480, maxHeight: "85vh", overflowY: "auto", background: "#141319", borderRadius: "20px 20px 0 0", padding: "18px 18px 24px", border: "1px solid #F0A93A44", borderBottom: "none" }}>
        <div style={{ fontFamily: "Bungee, sans-serif", fontSize: 16, marginBottom: 12 }}>Choisis ton équipe ({team.length}/3)</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 16 }}>
          {owned.map((c) => (
            <div key={c.id} style={{ position: "relative" }}>
              <CharCard character={c} locked={false} onClick={() => toggle(c.id)} />
              {team.includes(c.id) && <div style={{ position: "absolute", top: 6, right: 6, width: 22, height: 22, borderRadius: "50%", background: "#F0A93A", color: "#141119", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 12 }}>{team.indexOf(c.id) + 1}</div>}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onCancel} style={{ all: "unset", cursor: "pointer", flex: 1, textAlign: "center", padding: "12px 0", borderRadius: 10, background: "#232230", color: "#c2c1cc", fontWeight: 700, fontSize: 13 }}>Annuler</button>
          <button disabled={team.length === 0} onClick={() => onConfirm(team)} style={{ all: "unset", cursor: team.length ? "pointer" : "not-allowed", flex: 2, textAlign: "center", padding: "12px 0", borderRadius: 10, background: team.length ? "linear-gradient(90deg,#F0A93A,#EC4899)" : "#232230", color: team.length ? "#141119" : "#5c5b68", fontWeight: 800, fontSize: 13 }}>Confirmer</button>
        </div>
      </div>
    </div>
  );
}

function FriendBattleView({ challenge, game, profile, persistProfile, onExit }) {
  const [row, setRow] = useState(challenge);
  const isChallenger = row.challenger_id === profile.id;
  const charById = (id) => game.characters.find((c) => c.id === id);

  useEffect(() => {
    const ch = supabase.channel(`fight-${challenge.id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "battle_challenges", filter: `id=eq.${challenge.id}` }, (payload) => setRow(payload.new))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [challenge.id]);

  const st = row.state || {};
  const myTeam = isChallenger ? st.teamA : st.teamB;
  const oppTeam = isChallenger ? st.teamB : st.teamA;
  const myHp = isChallenger ? st.hpA : st.hpB;
  const oppHp = isChallenger ? st.hpB : st.hpA;
  const myActive = isChallenger ? st.activeA : st.activeB;
  const oppActive = isChallenger ? st.activeB : st.activeA;
  const mySuper = isChallenger ? st.superA : st.superB;
  const myChoice = isChallenger ? st.choiceA : st.choiceB;
  const finished = st.finished;

  const rewardedRef = useRef(false);
  useEffect(() => {
    if (finished && !rewardedRef.current) {
      rewardedRef.current = true;
      const iWon = (st.winner === "A" && isChallenger) || (st.winner === "B" && !isChallenger);
      const reward = iWon ? 60 + Math.floor(Math.random() * 60) : 20;
      persistProfile({ coins: (profile.coins || 0) + reward });
    }
  }, [finished]);

  const chooseAction = async (moveKey) => {
    if (myChoice) return; // already chosen, waiting for opponent
    const patch = isChallenger ? { choiceA: moveKey } : { choiceB: moveKey };
    let nextState = { ...st, ...patch };

    // resolve only from the challenger side once both picks are in, to avoid double resolution
    if (nextState.choiceA && nextState.choiceB) {
      nextState = resolveFriendTurn(nextState, game);
    }
    await supabase.from("battle_challenges").update({ state: nextState, status: nextState.finished ? "finished" : "fighting" }).eq("id", row.id);
  };

  if (!myTeam || !oppTeam) return <div style={{ padding: 20, textAlign: "center", color: "#8a8998" }}>En attente de l'équipe adverse…</div>;

  const myChar = charById(myTeam[myActive]);
  const activeMyHp = myHp[myActive];

  return (
    <div>
      <button onClick={onExit} style={{ all: "unset", cursor: "pointer", fontSize: 11.5, color: "#8a8998", marginBottom: 10, display: "block" }}>← Retour aux amis</button>
      <div style={{ background: "linear-gradient(160deg,#1a2440,#241830)", border: "1px solid #33345a", borderRadius: 16, padding: 12, marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <FriendTeamPanel team={myTeam} hp={myHp} active={myActive} charById={charById} teamColor="#5B8DEF" title="Toi" />
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}><div style={{ fontSize: 20 }}>⚔️</div></div>
          <FriendTeamPanel team={oppTeam} hp={oppHp} active={oppActive} charById={charById} teamColor="#ef6a6a" title="Adversaire" align="right" />
        </div>
      </div>

      <div style={{ background: "#111117", border: "1px solid #232230", borderRadius: 12, padding: 12, height: 130, overflowY: "auto", marginBottom: 12, fontSize: 12, lineHeight: 1.6, color: "#b9b8c4" }}>
        {(st.log || []).map((l, i) => <div key={i}>{l}</div>)}
      </div>

      {finished ? (
        <div style={{ textAlign: "center", padding: "18px 0" }}>
          <div style={{ fontSize: 36 }}>{(st.winner === "A") === isChallenger ? "🏆" : "💀"}</div>
          <div style={{ fontFamily: "Bungee, sans-serif", fontSize: 18, marginBottom: 12 }}>{(st.winner === "A") === isChallenger ? "Victoire !" : "Défaite"}</div>
          <button onClick={onExit} style={{ all: "unset", cursor: "pointer", padding: "12px 28px", borderRadius: 12, background: "linear-gradient(90deg,#F0A93A,#EC4899)", color: "#141119", fontWeight: 800, fontSize: 13.5 }}>Retour</button>
        </div>
      ) : myChoice ? (
        <div style={{ textAlign: "center", padding: "14px 0", color: "#8a8998", fontSize: 13 }}>⏳ En attente de l'action de l'adversaire…</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <ActionBtn label={myChar.attack1?.name} sub={`-${myChar.attack1?.dmg || 0}`} icon="🥊" kind="attack1" onClick={() => chooseAction("attack1")} />
          {myChar.attack2 && (myChar.attack2.dmg > 0 || myChar.attack2.heal > 0) && <ActionBtn label={myChar.attack2.name} sub={myChar.attack2.dmg ? `-${myChar.attack2.dmg}` : `+${myChar.attack2.heal} PV`} icon="💥" kind="attack2" onClick={() => chooseAction("attack2")} />}
          {myChar.super && <ActionBtn label={myChar.super.name} sub={`SUPER · -${myChar.super.dmg}`} icon="🌟" kind="super" disabled={mySuper[myActive]} onClick={() => chooseAction("super")} />}
        </div>
      )}
    </div>
  );
}

function FriendTeamPanel({ team, hp, active, charById, teamColor, title, align }) {
  return (
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 10, color: teamColor, fontWeight: 800, marginBottom: 8, textAlign: align === "right" ? "right" : "left", textTransform: "uppercase" }}>{title}</div>
      {team.map((id, i) => { const c = charById(id); if (!c) return null; const pct = Math.max(0, Math.round((hp[i] / c.hp) * 100)); const isActive = i === active && hp[i] > 0; const hpColor = pct > 50 ? "#7cd992" : pct > 20 ? "#F0A93A" : "#ef6a6a"; return (
        <div key={i} style={{ opacity: hp[i] <= 0 ? 0.3 : 1, marginBottom: 8, display: "flex", gap: 7, flexDirection: align === "right" ? "row-reverse" : "row", alignItems: "center" }}>
          <div style={{ width: 34, height: 34, borderRadius: "50%", flexShrink: 0, overflow: "hidden", background: "#0e0e13", border: `2px solid ${isActive ? teamColor : "#33333f"}` }}>
            {c.image_url ? <img src={c.image_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>🃏</div>}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, marginBottom: 2, flexDirection: align === "right" ? "row-reverse" : "row" }}>
              <span style={{ fontWeight: isActive ? 800 : 600 }}>{c.name}</span>
              <span style={{ color: hpColor, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 }}>{hp[i]}/{c.hp}</span>
            </div>
            <div style={{ height: 6, background: "#232230", borderRadius: 4, overflow: "hidden" }}><div style={{ height: "100%", width: `${pct}%`, background: hpColor }} /></div>
          </div>
        </div>
      ); })}
    </div>
  );
}

function resolveFriendTurn(st, game) {
  const charById = (id) => game.characters.find((c) => c.id === id);
  const s = JSON.parse(JSON.stringify(st));
  const charA = charById(s.teamA[s.activeA]), charB = charById(s.teamB[s.activeB]);
  const log = [];
  const applyMove = (attackerChar, attackerHpArr, attackerActive, attackerSuperArr, moveKey, defenderChar, defenderHpArr, defenderActive) => {
    const move = attackerChar[moveKey]; if (!move) return;
    const dmg = move.dmg || 0;
    defenderHpArr[defenderActive] = Math.max(0, defenderHpArr[defenderActive] - dmg);
    if (move.heal) attackerHpArr[attackerActive] = Math.min(attackerChar.hp, attackerHpArr[attackerActive] + move.heal);
    if (moveKey === "super") attackerSuperArr[attackerActive] = true;
    if (dmg > 0) log.push(`${attackerChar.name} utilise ${move.name} : -${dmg} PV à ${defenderChar.name}.`);
    if (move.heal) log.push(`${attackerChar.name} récupère ${move.heal} PV.`);
  };
  const order = charA.speed >= charB.speed ? ["A", "B"] : ["B", "A"];
  for (const turn of order) {
    if (s.hpA.every((h) => h <= 0) || s.hpB.every((h) => h <= 0)) break;
    if (turn === "A") applyMove(charA, s.hpA, s.activeA, s.superA, s.choiceA, charB, s.hpB, s.activeB);
    else applyMove(charB, s.hpB, s.activeB, s.superB, s.choiceB, charA, s.hpA, s.activeA);
  }
  while (s.activeA < s.teamA.length && s.hpA[s.activeA] <= 0) { log.push(`${charById(s.teamA[s.activeA]).name} est K.O. !`); s.activeA += 1; }
  while (s.activeB < s.teamB.length && s.hpB[s.activeB] <= 0) { log.push(`${charById(s.teamB[s.activeB]).name} est K.O. !`); s.activeB += 1; }
  let finished = false, winner = null;
  if (s.activeA >= s.teamA.length) { finished = true; winner = "B"; log.push("L'équipe A est vaincue !"); }
  else if (s.activeB >= s.teamB.length) { finished = true; winner = "A"; log.push("L'équipe B est vaincue !"); }
  s.log = [...(s.log || []), ...log];
  s.choiceA = null; s.choiceB = null;
  s.finished = finished; s.winner = winner;
  return s;
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 11, color: "#77768a", fontWeight: 700, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.4 }}>{title}</div>
      {children}
    </div>
  );
}

/* ---------------------------------- Actus ---------------------------------- */

function NewsTab({ game, profile, showToast }) {
  const sorted = [...game.events].sort((a, b) => (b.pinned - a.pinned) || (b.published_at || "").localeCompare(a.published_at || ""));
  return (
    <div>
      <div style={{ fontFamily: "Bungee, sans-serif", fontSize: 18, marginBottom: 14 }}>Actualités</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {sorted.map((n) => <NewsItem key={n.id} n={n} profile={profile} showToast={showToast} />)}
        {sorted.length === 0 && <div style={{ color: "#5c5b68", fontSize: 13 }}>Aucune actu pour le moment.</div>}
      </div>
    </div>
  );
}

function NewsItem({ n, profile, showToast }) {
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from("event_comments").select("*").eq("event_id", n.id).order("created_at", { ascending: true });
    setComments(data || []);
  }, [n.id]);

  useEffect(() => { if (open && comments === null) load(); }, [open, comments, load]);

  const post = async () => {
    if (!text.trim()) return;
    setBusy(true);
    const { error } = await supabase.from("event_comments").insert({ event_id: n.id, user_id: profile.id, username: profile.username, content: text.trim() });
    setBusy(false);
    if (error) showToast("Erreur : " + error.message);
    else { setText(""); load(); }
  };

  return (
    <div style={{ background: "#17161f", border: "1px solid #24232d", borderRadius: 14, padding: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        {n.pinned && <span style={{ fontSize: 12 }}>📌</span>}
        <div style={{ fontWeight: 800, fontSize: 14.5, flex: 1 }}>{n.title}</div>
        <div style={{ fontSize: 10.5, color: "#77768a", fontFamily: "'JetBrains Mono', monospace" }}>{n.published_at}</div>
      </div>
      <div style={{ fontSize: 12.5, color: "#b9b8c4", lineHeight: 1.6, whiteSpace: "pre-line" }}>{n.content}</div>

      <button onClick={() => setOpen((v) => !v)} style={{ all: "unset", cursor: "pointer", marginTop: 10, fontSize: 11.5, fontWeight: 700, color: "#F0A93A" }}>
        💬 {open ? "Masquer les réponses" : `Voir / répondre${comments ? ` (${comments.length})` : ""}`}
      </button>

      {open && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #24232d" }}>
          {comments === null && <div style={{ fontSize: 11.5, color: "#5c5b68" }}>Chargement…</div>}
          {comments && comments.length === 0 && <div style={{ fontSize: 11.5, color: "#5c5b68", marginBottom: 8 }}>Sois le premier à répondre.</div>}
          {comments && comments.map((c) => (
            <div key={c.id} style={{ marginBottom: 8, background: "#111117", borderRadius: 9, padding: "8px 10px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: "#5B8DEF" }}>{c.username}</span>
                {!c.approved && <span style={{ fontSize: 9, fontWeight: 700, color: "#F0A93A", background: "#2a2314", border: "1px solid #F0A93A55", borderRadius: 5, padding: "1px 6px" }}>en attente de validation</span>}
              </div>
              <div style={{ fontSize: 12, color: "#c2c1cc", lineHeight: 1.5 }}>{c.content}</div>
            </div>
          ))}
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Écris une réponse…" style={{ ...inputStyle, marginBottom: 0, flex: 1 }} onKeyDown={(e) => e.key === "Enter" && post()} />
            <button disabled={busy} onClick={post} style={{ all: "unset", cursor: "pointer", padding: "0 14px", borderRadius: 10, background: "linear-gradient(90deg,#F0A93A,#EC4899)", color: "#141119", fontWeight: 800, fontSize: 12 }}>➤</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------- Profil ---------------------------------- */

function ProfileTab({ profile, game, persistProfile, showToast }) {
  const [confirmReset, setConfirmReset] = useState(false);
  const [coinInput, setCoinInput] = useState(100);
  const charById = (id) => game.characters.find((c) => c.id === id);
  const itemById = (id) => game.items.find((i) => i.id === id);
  const ptdTotal = (profile.unlocked_character_ids || []).reduce((s, id) => { const c = charById(id); return s + (c ? c.ptd : 0); }, 0);

  return (
    <div>
      <div style={{ fontFamily: "Bungee, sans-serif", fontSize: 18, marginBottom: 14 }}>Profil</div>
      <div style={{ background: "#17161f", border: "1px solid #24232d", borderRadius: 16, padding: 18, textAlign: "center", marginBottom: 14 }}>
        <div style={{ fontSize: 44, marginBottom: 6 }}>{profile.avatar || "🙂"}</div>
        <div style={{ fontFamily: "Bungee, sans-serif", fontSize: 17 }}>{profile.username}</div>
        <div style={{ fontSize: 11, color: "#5c5b68", marginTop: 2 }}>{profile.email}</div>
        {profile.is_admin && <div style={{ marginTop: 8 }}><span style={{ fontSize: 11, color: "#FFD54A", fontWeight: 800, background: "#4a3f1a", border: "1px solid #FFD54A55", borderRadius: 6, padding: "3px 9px" }}>🛠️ Administrateur</span></div>}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
        <MiniStat label="Pièces" value={(profile.coins ?? 0).toLocaleString("fr-FR")} icon="⭐" />
        <MiniStat label="Spécimens" value={`${(profile.unlocked_character_ids || []).length}/${game.characters.length}`} icon="🃏" />
        <MiniStat label="Boîtes ouvertes" value={profile.boxes_opened ?? 0} icon="🎁" />
        <MiniStat label="PTD total" value={ptdTotal} icon="📊" />
      </div>

      {profile.is_admin && (
        <div style={{ background: "#231c2e", border: "1px solid #A855F755", borderRadius: 14, padding: 14, marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: "#A855F7", fontWeight: 700, marginBottom: 10, textTransform: "uppercase" }}>🛠️ Outils admin — pièces de test</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input type="number" value={coinInput} onChange={(e) => setCoinInput(parseInt(e.target.value) || 0)} style={{ ...inputStyle, marginBottom: 0, width: 90 }} />
            <button onClick={() => persistProfile({ coins: (profile.coins || 0) + coinInput })} style={{ all: "unset", cursor: "pointer", padding: "10px 14px", borderRadius: 10, background: "#7cd992", color: "#0e0e13", fontWeight: 800, fontSize: 12 }}>+ Ajouter</button>
            <button onClick={() => persistProfile({ coins: Math.max(0, (profile.coins || 0) - coinInput) })} style={{ all: "unset", cursor: "pointer", padding: "10px 14px", borderRadius: 10, background: "#ef6a6a", color: "#0e0e13", fontWeight: 800, fontSize: 12 }}>− Retirer</button>
          </div>
        </div>
      )}

      <div style={{ background: "#17161f", border: "1px solid #24232d", borderRadius: 14, padding: 14, marginBottom: 14 }}>
        <div style={{ fontSize: 11, color: "#77768a", fontWeight: 700, marginBottom: 10, textTransform: "uppercase" }}>Objets</div>
        {Object.entries(profile.item_stacks || {}).filter(([, n]) => n > 0).length === 0 ? (
          <div style={{ fontSize: 12.5, color: "#5c5b68" }}>Aucun objet pour le moment.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {Object.entries(profile.item_stacks || {}).filter(([, n]) => n > 0).map(([id, n]) => { const it = itemById(id); if (!it) return null; return (
              <div key={id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div><div style={{ fontWeight: 700, fontSize: 12.5 }}>{it.name}</div><div style={{ fontSize: 10.5, color: "#8a8998" }}>{it.effect}</div></div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 800, color: "#A855F7" }}>×{n}</div>
              </div>
            ); })}
          </div>
        )}
      </div>

      {!confirmReset ? (
        <button onClick={() => setConfirmReset(true)} style={{ all: "unset", cursor: "pointer", display: "block", width: "100%", textAlign: "center", padding: "12px 0", borderRadius: 12, background: "#231a1a", border: "1px solid #ef6a6a55", color: "#ef6a6a", fontWeight: 700, fontSize: 12.5 }}>Réinitialiser ma progression</button>
      ) : (
        <div style={{ background: "#231a1a", border: "1px solid #ef6a6a55", borderRadius: 12, padding: 14, textAlign: "center" }}>
          <div style={{ fontSize: 12.5, color: "#f0b8b8", marginBottom: 10 }}>Ceci effacera ta collection, tes pièces et tes objets. Confirmer ?</div>
          <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
            <button onClick={() => setConfirmReset(false)} style={{ all: "unset", cursor: "pointer", padding: "9px 16px", borderRadius: 10, background: "#2a2933", color: "#c2c1cc", fontSize: 12, fontWeight: 700 }}>Annuler</button>
            <button onClick={async () => { await persistProfile({ coins: 300, unlocked_character_ids: [], unlocked_item_ids: [], item_stacks: {}, boxes_opened: 0, last_free_box_claim: null }); setConfirmReset(false); showToast("Progression réinitialisée."); }} style={{ all: "unset", cursor: "pointer", padding: "9px 16px", borderRadius: 10, background: "#ef6a6a", color: "#141119", fontSize: 12, fontWeight: 800 }}>Confirmer</button>
          </div>
        </div>
      )}
    </div>
  );
}

function MiniStat({ label, value, icon }) {
  return (
    <div style={{ background: "#17161f", border: "1px solid #24232d", borderRadius: 14, padding: "12px 14px" }}>
      <div style={{ fontSize: 16, marginBottom: 4 }}>{icon}</div>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 800, fontSize: 15 }}>{value}</div>
      <div style={{ fontSize: 10, color: "#77768a" }}>{label}</div>
    </div>
  );
}

/* ---------------------------------- Admin ---------------------------------- */

function AdminTab({ game, reload, showToast }) {
  const [section, setSection] = useState("characters");
  const [editing, setEditing] = useState(null); // { type, row } or { type, row: null } for new
  const sections = [
    { id: "characters", label: "Personnages" },
    { id: "items", label: "Objets" },
    { id: "boxes", label: "Boîtes" },
    { id: "events", label: "Événements" },
    { id: "comments", label: "Commentaires" },
  ];
  const deleteRow = async (table, id) => {
    const { error } = await supabase.from(table).delete().eq("id", id);
    if (error) showToast("Erreur : " + error.message);
    else { showToast("Supprimé."); reload(); }
  };

  if (editing?.type === "characters") return <CharacterForm row={editing.row} onDone={() => { setEditing(null); reload(); }} onCancel={() => setEditing(null)} showToast={showToast} />;
  if (editing?.type === "items") return <ItemForm row={editing.row} onDone={() => { setEditing(null); reload(); }} onCancel={() => setEditing(null)} showToast={showToast} />;
  if (editing?.type === "boxes") return <BoxForm row={editing.row} game={game} onDone={() => { setEditing(null); reload(); }} onCancel={() => setEditing(null)} showToast={showToast} />;

  return (
    <div>
      <div style={{ fontFamily: "Bungee, sans-serif", fontSize: 18, marginBottom: 4 }}>🛠️ Panneau Admin</div>
      <div style={{ display: "flex", gap: 6, overflowX: "auto", padding: "12px 0 16px" }}>
        {sections.map((s) => (
          <button key={s.id} onClick={() => setSection(s.id)} style={{ all: "unset", cursor: "pointer", whiteSpace: "nowrap", padding: "7px 13px", borderRadius: 20, fontSize: 12, fontWeight: 700, border: `1.5px solid ${section === s.id ? "#F0A93A" : "#2a2933"}`, color: section === s.id ? "#F0A93A" : "#8a8998", background: section === s.id ? "#1c1b24" : "transparent" }}>{s.label}</button>
        ))}
      </div>

      {section === "events" && <AdminEvents game={game} reload={reload} showToast={showToast} deleteRow={deleteRow} />}
      {section === "comments" && <AdminComments game={game} showToast={showToast} />}
      {section === "characters" && (<>
        <NewButton onClick={() => setEditing({ type: "characters", row: null })} label="+ Nouveau personnage" />
        <AdminList rows={game.characters} table="characters" deleteRow={deleteRow} onEdit={(r) => setEditing({ type: "characters", row: r })} renderRow={(c) => `${c.name} · ${RARITIES[c.rarity]?.label} · PTD ${c.ptd}`} />
      </>)}
      {section === "items" && (<>
        <NewButton onClick={() => setEditing({ type: "items", row: null })} label="+ Nouvel objet" />
        <AdminList rows={game.items} table="game_items" deleteRow={deleteRow} onEdit={(r) => setEditing({ type: "items", row: r })} renderRow={(i) => `${i.name} · ${RARITIES[i.rarity]?.label}`} />
      </>)}
      {section === "boxes" && (<>
        <NewButton onClick={() => setEditing({ type: "boxes", row: null })} label="+ Nouvelle boîte" />
        <AdminList rows={game.boxes} table="loot_boxes" deleteRow={deleteRow} onEdit={(r) => setEditing({ type: "boxes", row: r })} renderRow={(b) => `${b.name} · ${b.is_free ? "Gratuit" : b.price + " ⭐"} · ${b.is_active ? "active" : "inactive"}`} />
      </>)}
    </div>
  );
}

function NewButton({ onClick, label }) {
  return <button onClick={onClick} style={{ all: "unset", cursor: "pointer", display: "block", width: "100%", textAlign: "center", padding: "11px 0", borderRadius: 10, background: "linear-gradient(90deg,#F0A93A,#EC4899)", color: "#141119", fontWeight: 800, fontSize: 13, marginBottom: 14 }}>{label}</button>;
}

function AdminList({ rows, renderRow, deleteRow, onEdit, table }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {rows.map((r) => (
        <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#17161f", border: "1px solid #24232d", borderRadius: 10, padding: "10px 12px" }}>
          <div style={{ fontSize: 12.5 }}>{renderRow(r)}</div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => onEdit(r)} style={{ all: "unset", cursor: "pointer", fontSize: 14 }}>✏️</button>
            <button onClick={() => deleteRow(table, r.id)} style={{ all: "unset", cursor: "pointer", fontSize: 14 }}>🗑️</button>
          </div>
        </div>
      ))}
      {rows.length === 0 && <div style={{ fontSize: 12.5, color: "#5c5b68" }}>Aucun élément.</div>}
    </div>
  );
}

function FormShell({ title, onCancel, onSubmit, busy, children }) {
  return (
    <div>
      <div style={{ fontFamily: "Bungee, sans-serif", fontSize: 16, marginBottom: 14 }}>{title}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>{children}</div>
      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <button onClick={onCancel} style={{ all: "unset", cursor: "pointer", flex: 1, textAlign: "center", padding: "12px 0", borderRadius: 10, background: "#232230", color: "#c2c1cc", fontWeight: 700, fontSize: 13 }}>Annuler</button>
        <button disabled={busy} onClick={onSubmit} style={{ all: "unset", cursor: "pointer", flex: 2, textAlign: "center", padding: "12px 0", borderRadius: 10, background: "linear-gradient(90deg,#F0A93A,#EC4899)", color: "#141119", fontWeight: 800, fontSize: 13, opacity: busy ? 0.6 : 1 }}>{busy ? "…" : "Enregistrer"}</button>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (<div style={{ marginBottom: 4 }}><div style={{ fontSize: 10.5, color: "#77768a", fontWeight: 700, marginBottom: 4, textTransform: "uppercase" }}>{label}</div>{children}</div>);
}

function MoveFields({ label, move, onChange }) {
  const m = move || EMPTY_MOVE;
  const set = (patch) => onChange({ ...m, ...patch });
  return (
    <div style={{ background: "#17161f", border: "1px solid #24232d", borderRadius: 10, padding: 10, marginBottom: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: "#F0A93A", marginBottom: 8 }}>{label}</div>
      <input placeholder="Nom" value={m.name || ""} onChange={(e) => set({ name: e.target.value })} style={inputStyle} />
      <div style={{ display: "flex", gap: 8 }}>
        <input type="number" placeholder="Dégâts" value={m.dmg || 0} onChange={(e) => set({ dmg: parseInt(e.target.value) || 0 })} style={{ ...inputStyle, flex: 1 }} />
        <input type="number" placeholder="Soin" value={m.heal || 0} onChange={(e) => set({ heal: parseInt(e.target.value) || 0 })} style={{ ...inputStyle, flex: 1 }} />
      </div>
      <textarea placeholder="Description" value={m.desc || ""} onChange={(e) => set({ desc: e.target.value })} rows={2} style={{ ...inputStyle, resize: "vertical", fontFamily: "'Work Sans', sans-serif" }} />
    </div>
  );
}

function CharacterForm({ row, onDone, onCancel, showToast }) {
  const [f, setF] = useState(row || { name: "", rarity: "rare", habitat: "", description: "", image_url: "", hp: 100, speed: 5, ptd: 30, attack1: EMPTY_MOVE, attack2: EMPTY_MOVE, super: EMPTY_MOVE });
  const [busy, setBusy] = useState(false);
  const set = (patch) => setF((v) => ({ ...v, ...patch }));
  const submit = async () => {
    if (!f.name.trim()) { showToast("Le nom est requis."); return; }
    setBusy(true);
    const payload = { ...f, id: f.id || slug(f.name) };
    const { error } = await supabase.from("characters").upsert(payload);
    setBusy(false);
    if (error) showToast("Erreur : " + error.message); else { showToast("Personnage enregistré."); onDone(); }
  };
  return (
    <FormShell title={row ? "Modifier le personnage" : "Nouveau personnage"} onCancel={onCancel} onSubmit={submit} busy={busy}>
      <Field label="Nom"><input value={f.name} onChange={(e) => set({ name: e.target.value })} style={inputStyle} /></Field>
      <Field label="Rareté"><select value={f.rarity} onChange={(e) => set({ rarity: e.target.value })} style={selectStyle}>{RARITY_ORDER.map((r) => <option key={r} value={r}>{RARITIES[r].label}</option>)}</select></Field>
      <Field label="Habitat"><input value={f.habitat || ""} onChange={(e) => set({ habitat: e.target.value })} style={inputStyle} /></Field>
      <Field label="Image (URL)"><input value={f.image_url || ""} onChange={(e) => set({ image_url: e.target.value })} style={inputStyle} /></Field>
      <Field label="Description"><textarea value={f.description || ""} onChange={(e) => set({ description: e.target.value })} rows={3} style={{ ...inputStyle, resize: "vertical", fontFamily: "'Work Sans', sans-serif" }} /></Field>
      <div style={{ display: "flex", gap: 8 }}>
        <Field label="PV"><input type="number" value={f.hp} onChange={(e) => set({ hp: parseInt(e.target.value) || 0 })} style={inputStyle} /></Field>
        <Field label="Vitesse"><input type="number" value={f.speed} onChange={(e) => set({ speed: parseInt(e.target.value) || 0 })} style={inputStyle} /></Field>
        <Field label="PTD"><input type="number" value={f.ptd} onChange={(e) => set({ ptd: parseInt(e.target.value) || 0 })} style={inputStyle} /></Field>
      </div>
      <MoveFields label="Attaque 1" move={f.attack1} onChange={(m) => set({ attack1: m })} />
      <MoveFields label="Attaque 2" move={f.attack2} onChange={(m) => set({ attack2: m })} />
      <MoveFields label="Super" move={f.super} onChange={(m) => set({ super: m })} />
    </FormShell>
  );
}

function ItemForm({ row, onDone, onCancel, showToast }) {
  const [f, setF] = useState(row || { name: "", rarity: "rare", description: "", effect: "", image_url: "", atk_bonus: 10 });
  const [busy, setBusy] = useState(false);
  const set = (patch) => setF((v) => ({ ...v, ...patch }));
  const submit = async () => {
    if (!f.name.trim()) { showToast("Le nom est requis."); return; }
    setBusy(true);
    const payload = { ...f, id: f.id || slug(f.name) };
    const { error } = await supabase.from("game_items").upsert(payload);
    setBusy(false);
    if (error) showToast("Erreur : " + error.message); else { showToast("Objet enregistré."); onDone(); }
  };
  return (
    <FormShell title={row ? "Modifier l'objet" : "Nouvel objet"} onCancel={onCancel} onSubmit={submit} busy={busy}>
      <Field label="Nom"><input value={f.name} onChange={(e) => set({ name: e.target.value })} style={inputStyle} /></Field>
      <Field label="Rareté"><select value={f.rarity} onChange={(e) => set({ rarity: e.target.value })} style={selectStyle}>{RARITY_ORDER.map((r) => <option key={r} value={r}>{RARITIES[r].label}</option>)}</select></Field>
      <Field label="Image (URL)"><input value={f.image_url || ""} onChange={(e) => set({ image_url: e.target.value })} style={inputStyle} /></Field>
      <Field label="Effet (texte affiché)"><input value={f.effect || ""} onChange={(e) => set({ effect: e.target.value })} style={inputStyle} /></Field>
      <Field label="Bonus d'attaque en combat (%)"><input type="number" value={f.atk_bonus} onChange={(e) => set({ atk_bonus: parseInt(e.target.value) || 0 })} style={inputStyle} /></Field>
      <Field label="Description"><textarea value={f.description || ""} onChange={(e) => set({ description: e.target.value })} rows={3} style={{ ...inputStyle, resize: "vertical", fontFamily: "'Work Sans', sans-serif" }} /></Field>
    </FormShell>
  );
}

function BoxForm({ row, game, onDone, onCancel, showToast }) {
  const [f, setF] = useState(row || { name: "", price: 100, is_free: false, description: "", image_url: "", rewards_count: 2, is_active: true, coin_entries: [], character_entries: [], item_entries: [] });
  const [busy, setBusy] = useState(false);
  const [charPick, setCharPick] = useState("");
  const [itemPick, setItemPick] = useState("");
  const set = (patch) => setF((v) => ({ ...v, ...patch }));

  const addCoinEntry = () => set({ coin_entries: [...(f.coin_entries || []), { amount: 50, probability: 10 }] });
  const updateCoinEntry = (i, patch) => set({ coin_entries: f.coin_entries.map((e, idx) => idx === i ? { ...e, ...patch } : e) });
  const removeCoinEntry = (i) => set({ coin_entries: f.coin_entries.filter((_, idx) => idx !== i) });

  const addCharEntry = () => { if (!charPick) return; set({ character_entries: [...(f.character_entries || []), { character_id: charPick, probability: 10 }] }); };
  const removeCharEntry = (i) => set({ character_entries: f.character_entries.filter((_, idx) => idx !== i) });

  const addItemEntry = () => { if (!itemPick) return; set({ item_entries: [...(f.item_entries || []), { item_id: itemPick, probability: 10 }] }); };
  const removeItemEntry = (i) => set({ item_entries: f.item_entries.filter((_, idx) => idx !== i) });

  const submit = async () => {
    if (!f.name.trim()) { showToast("Le nom est requis."); return; }
    setBusy(true);
    const payload = { ...f, id: f.id || slug(f.name) };
    const { error } = await supabase.from("loot_boxes").upsert(payload);
    setBusy(false);
    if (error) showToast("Erreur : " + error.message); else { showToast("Boîte enregistrée."); onDone(); }
  };

  return (
    <FormShell title={row ? "Modifier la boîte" : "Nouvelle boîte"} onCancel={onCancel} onSubmit={submit} busy={busy}>
      <Field label="Nom"><input value={f.name} onChange={(e) => set({ name: e.target.value })} style={inputStyle} /></Field>
      <Field label="Image (URL)"><input value={f.image_url || ""} onChange={(e) => set({ image_url: e.target.value })} style={inputStyle} /></Field>
      <Field label="Description"><input value={f.description || ""} onChange={(e) => set({ description: e.target.value })} style={inputStyle} /></Field>
      <div style={{ display: "flex", gap: 8 }}>
        <Field label="Prix"><input type="number" value={f.price} onChange={(e) => set({ price: parseInt(e.target.value) || 0 })} style={inputStyle} /></Field>
        <Field label="Nb récompenses"><input type="number" value={f.rewards_count} onChange={(e) => set({ rewards_count: parseInt(e.target.value) || 1 })} style={inputStyle} /></Field>
      </div>
      <div style={{ display: "flex", gap: 16, marginBottom: 10 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5 }}><input type="checkbox" checked={f.is_free} onChange={(e) => set({ is_free: e.target.checked })} /> Gratuite / jour</label>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5 }}><input type="checkbox" checked={f.is_active} onChange={(e) => set({ is_active: e.target.checked })} /> Active</label>
      </div>

      <Field label="Pièces possibles">
        {(f.coin_entries || []).map((e, i) => (
          <div key={i} style={{ display: "flex", gap: 6, marginBottom: 6 }}>
            <input type="number" value={e.amount} onChange={(ev) => updateCoinEntry(i, { amount: parseInt(ev.target.value) || 0 })} placeholder="Montant" style={{ ...inputStyle, marginBottom: 0, flex: 1 }} />
            <input type="number" value={e.probability} onChange={(ev) => updateCoinEntry(i, { probability: parseInt(ev.target.value) || 0 })} placeholder="Poids" style={{ ...inputStyle, marginBottom: 0, flex: 1 }} />
            <button onClick={() => removeCoinEntry(i)} style={{ all: "unset", cursor: "pointer", padding: "0 8px" }}>🗑️</button>
          </div>
        ))}
        <button onClick={addCoinEntry} style={{ all: "unset", cursor: "pointer", fontSize: 11.5, color: "#F0A93A", fontWeight: 700 }}>+ Ajouter des pièces</button>
      </Field>

      <Field label="Cartes personnages">
        {(f.character_entries || []).map((e, i) => { const c = game.characters.find((c) => c.id === e.character_id); return (
          <div key={i} style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6, fontSize: 12 }}>
            <span style={{ flex: 1 }}>{c?.name || e.character_id}</span>
            <span style={{ color: "#8a8998" }}>poids {e.probability}</span>
            <button onClick={() => removeCharEntry(i)} style={{ all: "unset", cursor: "pointer", padding: "0 8px" }}>🗑️</button>
          </div>
        ); })}
        <div style={{ display: "flex", gap: 6 }}>
          <select value={charPick} onChange={(e) => setCharPick(e.target.value)} style={{ ...selectStyle, marginBottom: 0, flex: 1 }}>
            <option value="">Ajouter une carte…</option>
            {game.characters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button onClick={addCharEntry} style={{ all: "unset", cursor: "pointer", padding: "0 10px", color: "#F0A93A", fontWeight: 700 }}>+</button>
        </div>
      </Field>

      <Field label="Objets">
        {(f.item_entries || []).map((e, i) => { const it = game.items.find((it) => it.id === e.item_id); return (
          <div key={i} style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6, fontSize: 12 }}>
            <span style={{ flex: 1 }}>{it?.name || e.item_id}</span>
            <span style={{ color: "#8a8998" }}>poids {e.probability}</span>
            <button onClick={() => removeItemEntry(i)} style={{ all: "unset", cursor: "pointer", padding: "0 8px" }}>🗑️</button>
          </div>
        ); })}
        <div style={{ display: "flex", gap: 6 }}>
          <select value={itemPick} onChange={(e) => setItemPick(e.target.value)} style={{ ...selectStyle, marginBottom: 0, flex: 1 }}>
            <option value="">Ajouter un objet…</option>
            {game.items.map((it) => <option key={it.id} value={it.id}>{it.name}</option>)}
          </select>
          <button onClick={addItemEntry} style={{ all: "unset", cursor: "pointer", padding: "0 10px", color: "#F0A93A", fontWeight: 700 }}>+</button>
        </div>
      </Field>
    </FormShell>
  );
}

function AdminEvents({ game, reload, showToast, deleteRow }) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [pinned, setPinned] = useState(false);
  const [busy, setBusy] = useState(false);
  const create = async () => {
    if (!title.trim() || !content.trim()) return;
    setBusy(true);
    const { error } = await supabase.from("game_events").insert({ title, content, pinned, published_at: todayStr() });
    setBusy(false);
    if (error) showToast("Erreur : " + error.message); else { setTitle(""); setContent(""); setPinned(false); showToast("Actu publiée."); reload(); }
  };
  return (
    <div>
      <div style={{ background: "#17161f", border: "1px solid #F0A93A55", borderRadius: 14, padding: 14, marginBottom: 16 }}>
        <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 10 }}>+ Publier une actu</div>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Titre" style={inputStyle} />
        <textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="Contenu" rows={4} style={{ ...inputStyle, resize: "vertical", fontFamily: "'Work Sans', sans-serif" }} />
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "#c2c1cc", marginBottom: 12 }}><input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} /> Épingler</label>
        <button disabled={busy} onClick={create} style={{ all: "unset", cursor: "pointer", display: "block", width: "100%", textAlign: "center", padding: "11px 0", borderRadius: 10, background: "linear-gradient(90deg,#F0A93A,#EC4899)", color: "#141119", fontWeight: 800, fontSize: 13 }}>Publier</button>
      </div>
      <AdminList rows={game.events} table="game_events" deleteRow={deleteRow} onEdit={() => {}} renderRow={(n) => `${n.pinned ? "📌 " : ""}${n.title} (${n.published_at})`} />
    </div>
  );
}

function AdminComments({ game, showToast }) {
  const [comments, setComments] = useState(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from("event_comments").select("*").order("created_at", { ascending: false });
    setComments(data || []);
  }, []);

  useEffect(() => { load(); }, [load]);

  const eventTitle = (id) => game.events.find((e) => e.id === id)?.title || "?";

  const approve = async (c) => { await supabase.from("event_comments").update({ approved: true }).eq("id", c.id); load(); };
  const unapprove = async (c) => { await supabase.from("event_comments").update({ approved: false }).eq("id", c.id); load(); };
  const remove = async (c) => { await supabase.from("event_comments").delete().eq("id", c.id); showToast("Commentaire supprimé."); load(); };

  if (comments === null) return <div style={{ fontSize: 12.5, color: "#5c5b68" }}>Chargement…</div>;
  if (comments.length === 0) return <div style={{ fontSize: 12.5, color: "#5c5b68" }}>Aucun commentaire pour le moment.</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {comments.map((c) => (
        <div key={c.id} style={{ background: "#17161f", border: `1px solid ${c.approved ? "#7cd99244" : "#F0A93A44"}`, borderRadius: 10, padding: "10px 12px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: "#5B8DEF" }}>{c.username}</span>
            <span style={{ fontSize: 9.5, color: "#5c5b68" }}>sur « {eventTitle(c.event_id)} »</span>
          </div>
          <div style={{ fontSize: 12.5, color: "#c2c1cc", marginBottom: 8 }}>{c.content}</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {c.approved ? (
              <button onClick={() => unapprove(c)} style={{ all: "unset", cursor: "pointer", fontSize: 11, fontWeight: 700, color: "#F0A93A", padding: "5px 9px", borderRadius: 8, border: "1px solid #F0A93A55" }}>Masquer</button>
            ) : (
              <button onClick={() => approve(c)} style={{ all: "unset", cursor: "pointer", fontSize: 11, fontWeight: 700, color: "#7cd992", padding: "5px 9px", borderRadius: 8, border: "1px solid #7cd99255" }}>Approuver</button>
            )}
            <button onClick={() => remove(c)} style={{ all: "unset", cursor: "pointer", fontSize: 11, fontWeight: 700, color: "#ef6a6a", padding: "5px 9px", borderRadius: 8, border: "1px solid #ef6a6a55" }}>Supprimer</button>
            {!c.approved && <span style={{ fontSize: 9.5, color: "#F0A93A", marginLeft: "auto" }}>en attente</span>}
          </div>
        </div>
      ))}
    </div>
  );
}
