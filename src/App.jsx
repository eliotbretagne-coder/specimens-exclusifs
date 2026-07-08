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

function todayStr() { return new Date().toISOString().slice(0, 10); }

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
  for (let i = 0; i < (box.rewards_count || 1); i++) {
    const r = weightedPick(pool);
    if (r) results.push(r);
  }
  return results;
}

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

function StatPill({ label, value, color }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 46 }}>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 15, color: color || "#eee" }}>{value}</div>
      <div style={{ fontSize: 9, color: "#8a8a99", letterSpacing: 0.5, textTransform: "uppercase" }}>{label}</div>
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
            <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30 }}>
              {locked ? "🔒" : "🃏"}
            </div>
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
      padding: "10px 18px", fontSize: 13.5, fontWeight: 600, zIndex: 200,
      boxShadow: "0 8px 24px rgba(0,0,0,0.4)", maxWidth: "90%", textAlign: "center",
    }}>{text}</div>
  );
}

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
        const { error: err } = await supabase.auth.signUp({
          email, password, options: { data: { username: username || email.split("@")[0] } },
        });
        if (err) throw err;
        onToast("Compte créé ! Si la confirmation par email est activée, vérifie ta boîte mail.");
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) throw err;
      }
    } catch (e) {
      setError(e.message === "Invalid login credentials" ? "Email ou mot de passe incorrect." : e.message);
    } finally {
      setBusy(false);
    }
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

        {mode === "signup" && (
          <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Ton pseudo" maxLength={18}
            style={inputStyle} />
        )}
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" type="email" style={inputStyle} />
        <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mot de passe" type="password" style={inputStyle} />

        {error && <div style={{ color: "#ef6a6a", fontSize: 12.5, marginBottom: 10 }}>{error}</div>}

        <button disabled={busy || !email || !password} onClick={submit} style={{
          width: "100%", padding: "14px 0", borderRadius: 12, border: "none", cursor: "pointer",
          background: "linear-gradient(90deg,#F0A93A,#EC4899)", color: "#141119", fontWeight: 800, fontSize: 14.5,
          opacity: busy ? 0.6 : 1,
        }}>{busy ? "…" : mode === "login" ? "Se connecter" : "Créer mon compte"}</button>
      </div>
    </div>
  );
}

const inputStyle = {
  width: "100%", boxSizing: "border-box", background: "#17161f", border: "1.5px solid #2a2933",
  borderRadius: 12, padding: "13px 15px", color: "#f4f2ec", fontSize: 15, outline: "none", marginBottom: 10,
  fontFamily: "'Work Sans', sans-serif",
};

export default function App() {
  const [session, setSession] = useState(undefined);
  const [profile, setProfile] = useState(null);
  const [game, setGame] = useState(null);
  const [tab, setTab] = useState("specimens");
  const [detailChar, setDetailChar] = useState(null);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

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
    if (error || !data) {
      await new Promise((r) => setTimeout(r, 1200));
      ({ data, error } = await supabase.from("profiles").select("*").eq("id", uid).single());
    }
    setProfile(data || null);
  }, []);

  const loadGame = useCallback(async () => {
    const [c, i, b, n] = await Promise.all([
      supabase.from("characters").select("*"),
      supabase.from("game_items").select("*"),
      supabase.from("loot_boxes").select("*").eq("is_active", true),
      supabase.from("game_events").select("*").order("published_at", { ascending: false }),
    ]);
    setGame({
      characters: c.data || [],
      items: i.data || [],
      boxes: b.data || [],
      events: n.data || [],
    });
  }, []);

  useEffect(() => {
    if (session) { loadProfile(session.user.id); loadGame(); }
    else { setProfile(null); }
  }, [session, loadProfile, loadGame]);

  const persistProfile = useCallback(async (patch) => {
    if (!profile) return;
    const next = { ...profile, ...patch };
    setProfile(next);
    await supabase.from("profiles").update(patch).eq("id", profile.id);
  }, [profile]);

  if (session === undefined) {
    return <div style={{ minHeight: "100vh", background: "#0e0e13", display: "flex", alignItems: "center", justifyContent: "center", color: "#666", fontFamily: "'Work Sans', sans-serif" }}>Chargement…</div>;
  }
  if (!session) return <AuthScreen onToast={showToast} />;
  if (!profile || !game) {
    return <div style={{ minHeight: "100vh", background: "#0e0e13", display: "flex", alignItems: "center", justifyContent: "center", color: "#666", fontFamily: "'Work Sans', sans-serif" }}>Chargement de ton profil…</div>;
  }

  const isAdmin = profile.is_admin === true;

  return (
    <div style={{ minHeight: "100vh", background: "#0e0e13", color: "#f4f2ec", fontFamily: "'Work Sans', sans-serif", paddingBottom: 78 }}>
      <TopBar profile={profile} onLogout={() => supabase.auth.signOut()} />
      <div style={{ maxWidth: 480, margin: "0 auto", padding: "14px 14px 24px" }}>
        {tab === "specimens" && <SpecimensTab profile={profile} game={game} onOpen={setDetailChar} />}
        {tab === "shop" && <ShopTab profile={profile} game={game} persistProfile={persistProfile} showToast={showToast} />}
        {tab === "battle" && <BattleTab profile={profile} game={game} persistProfile={persistProfile} />}
        {tab === "news" && <NewsTab game={game} />}
        {tab === "profile" && <ProfileTab profile={profile} game={game} persistProfile={persistProfile} showToast={showToast} />}
        {tab === "admin" && isAdmin && <AdminTab game={game} reload={loadGame} showToast={showToast} />}
      </div>
      <BottomNav tab={tab} setTab={setTab} isAdmin={isAdmin} />
      {detailChar && <CharModal character={detailChar} owned={profile.unlocked_character_ids?.includes(detailChar.id)} onClose={() => setDetailChar(null)} />}
      {toast && <Toast text={toast} />}
    </div>
  );
}

function TopBar({ profile, onLogout }) {
  return (
    <div style={{
      position: "sticky", top: 0, zIndex: 50, background: "#0e0e13ee", backdropFilter: "blur(8px)",
      borderBottom: "1px solid #201f28", padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
        <div style={{ fontSize: 20 }}>🃏</div>
        <div style={{ fontFamily: "Bungee, sans-serif", fontSize: 13.5 }}>Spécimens Exclusifs</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, background: "#17161f", border: "1px solid #2a2933", borderRadius: 20, padding: "5px 12px 5px 8px" }}>
          <span style={{ fontSize: 15 }}>🪙</span>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 13.5, color: "#F0A93A" }}>{(profile.coins ?? 0).toLocaleString("fr-FR")}</span>
        </div>
        <button onClick={onLogout} style={{ all: "unset", cursor: "pointer", fontSize: 16, opacity: 0.7 }}>🚪</button>
      </div>
    </div>
  );
}

function BottomNav({ tab, setTab, isAdmin }) {
  const items = [
    { id: "specimens", icon: "🃏", label: "Spécimens" },
    { id: "shop", icon: "🎁", label: "Boutique" },
    { id: "battle", icon: "⚔️", label: "Combat" },
    { id: "news", icon: "📰", label: "Actus" },
    { id: "profile", icon: "👤", label: "Profil" },
    ...(isAdmin ? [{ id: "admin", icon: "🛠️", label: "Admin" }] : []),
  ];
  return (
    <div style={{
      position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 100,
      background: "#141319ee", backdropFilter: "blur(10px)", borderTop: "1px solid #201f28",
      display: "flex", justifyContent: "space-around", padding: "8px 4px calc(8px + env(safe-area-inset-bottom))", overflowX: "auto",
    }}>
      {items.map((it) => (
        <button key={it.id} onClick={() => setTab(it.id)} style={{
          all: "unset", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
          padding: "4px 9px", borderRadius: 10, minWidth: 50,
          background: tab === it.id ? "#22212c" : "transparent",
        }}>
          <span style={{ fontSize: 17, opacity: tab === it.id ? 1 : 0.55 }}>{it.icon}</span>
          <span style={{ fontSize: 9, fontWeight: 700, color: tab === it.id ? "#F0A93A" : "#6f6e7c", letterSpacing: 0.2 }}>{it.label}</span>
        </button>
      ))}
    </div>
  );
}

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
          <button key={r} onClick={() => setFilter(r)} style={{
            all: "unset", cursor: "pointer", whiteSpace: "nowrap", padding: "6px 12px", borderRadius: 20, fontSize: 11.5, fontWeight: 700,
            border: `1.5px solid ${filter === r ? (r === "all" ? "#F0A93A" : RARITIES[r].color) : "#2a2933"}`,
            color: filter === r ? (r === "all" ? "#F0A93A" : RARITIES[r].color) : "#8a8998",
            background: filter === r ? "#1c1b24" : "transparent",
          }}>{r === "all" ? "Tous" : RARITIES[r].label}</button>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
        {sorted.map((c) => (
          <CharCard key={c.id} character={c} locked={!profile.unlocked_character_ids?.includes(c.id)} onClick={() => onOpen(c)} />
        ))}
      </div>
    </div>
  );
}

function StatRow({ character }) {
  const r = RARITIES[character.rarity];
  return (
    <div style={{ display: "flex", justifyContent: "space-around", background: "#17161f", borderRadius: 12, padding: "12px 8px", margin: "14px 0" }}>
      <StatPill label="PV" value={character.hp} color="#7cd992" />
      <StatPill label="Vitesse" value={character.speed} color="#5B8DEF" />
      <StatPill label="PTD" value={character.ptd} color={r.color} />
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
      <div onClick={(e) => e.stopPropagation()} style={{
        width: "100%", maxWidth: 480, maxHeight: "88vh", overflowY: "auto",
        background: "#141319", borderRadius: "20px 20px 0 0", padding: "18px 18px 30px",
        border: `1px solid ${r.color}44`, borderBottom: "none",
      }}>
        <div style={{ width: 40, height: 4, background: "#2f2e39", borderRadius: 4, margin: "0 auto 14px" }} />
        <div style={{ display: "flex", gap: 14 }}>
          <div style={{ width: 100, height: 128, borderRadius: 12, overflow: "hidden", flexShrink: 0, background: "#0e0e13", border: `1.5px solid ${r.color}66` }}>
            {character.image_url && owned ? <img src={character.image_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> :
              <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32 }}>{owned ? "🃏" : "🔒"}</div>}
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
            <StatRow character={character} />
            <MoveRow label="Attaque 1" move={character.attack1} />
            <MoveRow label="Attaque 2" move={character.attack2} />
            <MoveRow label="Super" move={character.super} />
          </>
        ) : (
          <div style={{ marginTop: 18, padding: 16, background: "#17161f", borderRadius: 12, fontSize: 13, color: "#8a8998", textAlign: "center" }}>
            Spécimen non débloqué. Ouvre des boîtes dans la boutique pour tenter ta chance.
          </div>
        )}
        <button onClick={onClose} style={{
          all: "unset", cursor: "pointer", display: "block", width: "100%", textAlign: "center",
          marginTop: 18, padding: "12px 0", borderRadius: 12, background: "#1e1d27", color: "#c2c1cc", fontWeight: 700, fontSize: 13,
        }}>Fermer</button>
      </div>
    </div>
  );
}

function ShopTab({ profile, game, persistProfile, showToast }) {
  const [opening, setOpening] = useState(null);
  const [revealResults, setRevealResults] = useState(null);
  const [flipped, setFlipped] = useState(false);
  const charById = (id) => game.characters.find((c) => c.id === id);
  const itemById = (id) => game.items.find((i) => i.id === id);
  const freeClaimedToday = profile.last_free_box_claim === todayStr();

  const openBox = (box) => {
    if (box.is_free) { if (freeClaimedToday) { showToast("Boîte gratuite déjà réclamée aujourd'hui."); return; } }
    else if ((profile.coins || 0) < box.price) { showToast("Pas assez de pièces."); return; }
    setOpening(box); setFlipped(false); setRevealResults(null);
  };

  const doReveal = async () => {
    const box = opening;
    const results = rollBox(box);
    setRevealResults(results);
    setFlipped(true);

    const patch = {};
    let coins = profile.coins || 0;
    let unlockedC = [...(profile.unlocked_character_ids || [])];
    let unlockedI = [...(profile.unlocked_item_ids || [])];
    let stacks = { ...(profile.item_stacks || {}) };

    for (const res of results) {
      if (res.kind === "coin") coins += res.value;
      else if (res.kind === "char") { if (!unlockedC.includes(res.id)) unlockedC.push(res.id); }
      else if (res.kind === "item") { if (!unlockedI.includes(res.id)) unlockedI.push(res.id); stacks[res.id] = (stacks[res.id] || 0) + 1; }
    }
    patch.coins = coins;
    patch.unlocked_character_ids = unlockedC;
    patch.unlocked_item_ids = unlockedI;
    patch.item_stacks = stacks;
    patch.boxes_opened = (profile.boxes_opened || 0) + 1;
    if (box.is_free) patch.last_free_box_claim = todayStr();
    else patch.coins = coins - box.price;

    await persistProfile(patch);
  };

  return (
    <div>
      <div style={{ fontFamily: "Bungee, sans-serif", fontSize: 18, marginBottom: 14 }}>Boutique</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {game.boxes.map((box) => (
          <div key={box.id} style={{ display: "flex", gap: 12, background: "#17161f", border: "1px solid #24232d", borderRadius: 14, padding: 12, alignItems: "center" }}>
            <div style={{ width: 62, height: 62, borderRadius: 10, overflow: "hidden", background: "#0e0e13", flexShrink: 0 }}>
              {box.image_url ? <img src={box.image_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>🎁</div>}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 800, fontSize: 14 }}>{box.name}</div>
              <div style={{ fontSize: 11.5, color: "#8a8998" }}>{box.description} · {box.rewards_count} récompense{box.rewards_count > 1 ? "s" : ""}</div>
            </div>
            <button onClick={() => openBox(box)} style={{
              all: "unset", cursor: "pointer", padding: "9px 14px", borderRadius: 10, fontWeight: 800, fontSize: 12.5, flexShrink: 0,
              background: box.is_free ? (freeClaimedToday ? "#232230" : "linear-gradient(90deg,#2DD4BF,#5B8DEF)") : "#232230",
              color: box.is_free ? (freeClaimedToday ? "#5c5b68" : "#0e0e13") : "#F0A93A",
              border: box.is_free ? "none" : "1px solid #F0A93A55",
            }}>{box.is_free ? (freeClaimedToday ? "Réclamée" : "Gratuit") : `🪙 ${box.price}`}</button>
          </div>
        ))}
      </div>

      {opening && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(6,6,9,0.9)", zIndex: 300, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 }}>
          {!flipped ? (
            <>
              <div onClick={doReveal} style={{
                width: 160, height: 210, borderRadius: 16, cursor: "pointer",
                background: "linear-gradient(135deg,#22212c,#17161f)", border: "2px solid #F0A93A66",
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 54,
                boxShadow: "0 0 40px rgba(240,169,58,0.25)",
              }}>🃏</div>
              <div style={{ marginTop: 22, fontSize: 13, color: "#9a99a8" }}>Touche la carte pour l'ouvrir</div>
            </>
          ) : (
            <>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center", maxWidth: 420 }}>
                {revealResults.map((res, i) => <RewardCard key={i} res={res} charById={charById} itemById={itemById} />)}
              </div>
              <button onClick={() => setOpening(null)} style={{
                all: "unset", cursor: "pointer", marginTop: 26, padding: "13px 30px", borderRadius: 12,
                background: "linear-gradient(90deg,#F0A93A,#EC4899)", color: "#141119", fontWeight: 800, fontSize: 13.5,
              }}>Continuer</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function RewardCard({ res, charById, itemById }) {
  if (res.kind === "coin") {
    return (
      <div style={{ width: 130, height: 168, borderRadius: 14, background: "#17161f", border: "1.5px solid #F0A93A66", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6 }}>
        <div style={{ fontSize: 30 }}>🪙</div>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 800, fontSize: 17, color: "#F0A93A" }}>+{res.value}</div>
        <div style={{ fontSize: 10, color: "#8a8998" }}>pièces</div>
      </div>
    );
  }
  if (res.kind === "char") {
    const c = charById(res.id); if (!c) return null;
    const r = RARITIES[c.rarity];
    return (
      <div style={{ width: 130, height: 168, borderRadius: 14, overflow: "hidden", background: "#17161f", border: `1.5px solid ${r.color}` }}>
        <div style={{ height: 110, background: "#0e0e13" }}>
          {c.image_url ? <img src={c.image_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28 }}>🃏</div>}
        </div>
        <div style={{ padding: "7px 8px" }}>
          <div style={{ fontWeight: 800, fontSize: 11.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</div>
          <RarityTag rarity={c.rarity} />
        </div>
      </div>
    );
  }
  const it = itemById(res.id); if (!it) return null;
  return (
    <div style={{ width: 130, height: 168, borderRadius: 14, overflow: "hidden", background: "#17161f", border: "1.5px solid #A855F766" }}>
      <div style={{ height: 110, background: "#0e0e13" }}>
        {it.image_url ? <img src={it.image_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28 }}>🎒</div>}
      </div>
      <div style={{ padding: "7px 8px" }}>
        <div style={{ fontWeight: 800, fontSize: 11.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.name}</div>
        <RarityTag rarity={it.rarity} />
      </div>
    </div>
  );
}

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
      const log = [];
      let itemConsumedId = null;

      if (playerAction.type === "item") {
        pc.buff += playerAction.item.atk_bonus || 0;
        log.push(`🎒 Tu utilises ${playerAction.item.name} sur ${pc.name}.`);
        itemConsumedId = playerAction.item.id;
      }

      const botMoves = ["attack1", bc.attack2 && (bc.attack2.dmg || bc.attack2.heal) ? "attack2" : null, !bc.superUsed ? "super" : null].filter(Boolean);
      const botMoveKey = botMoves[Math.floor(Math.random() * botMoves.length)] || "attack1";
      const playerMoveKey = playerAction.type === "move" ? playerAction.moveKey : "attack1";

      const applyMove = (attacker, defender, moveKey, isSuper) => {
        const move = attacker[moveKey];
        if (!move) return [];
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

      const advance = (side) => {
        while (side.active < side.chars.length && side.chars[side.active].curHp <= 0) {
          log.push(`${side.chars[side.active].name} est K.O. !`);
          side.active += 1;
        }
      };
      advance(p); advance(b);

      let over = false, result = null;
      if (p.active >= p.chars.length) { over = true; result = "lose"; log.push("Défaite..."); }
      else if (b.active >= b.chars.length) { over = true; result = "win"; log.push("Victoire ! 🎉"); }

      state.log = [...state.log, ...log];
      state.over = over; state.result = result;

      if (over || itemConsumedId) {
        const patch = {};
        if (itemConsumedId) {
          const stacks = { ...(profile.item_stacks || {}) };
          stacks[itemConsumedId] = Math.max(0, (stacks[itemConsumedId] || 0) - 1);
          patch.item_stacks = stacks;
        }
        if (over) {
          const reward = result === "win" ? 40 + Math.floor(Math.random() * 60) : 15;
          patch.coins = (profile.coins || 0) + reward;
          state.reward = reward;
        }
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
        <div style={{ display: "flex", gap: 10 }}>
          <BattleSidePanel title="Toi" chars={p.chars} active={p.active} />
          <div style={{ display: "flex", alignItems: "center", fontSize: 20 }}>⚔️</div>
          <BattleSidePanel title="Adversaire" chars={b.chars} active={b.active} align="right" />
        </div>
        <div ref={logRef} style={{ background: "#111117", border: "1px solid #232230", borderRadius: 12, padding: 12, height: 150, overflowY: "auto", margin: "12px 0", fontSize: 12, lineHeight: 1.6, color: "#b9b8c4" }}>
          {fight.log.map((l, i) => <div key={i}>{l}</div>)}
        </div>
        {!fight.over ? (
          <>
            <div style={{ fontSize: 11, color: "#77768a", fontWeight: 700, marginBottom: 6, textTransform: "uppercase" }}>Actions de {pc.name}</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <ActionBtn label={pc.attack1?.name} sub={`-${pc.attack1?.dmg || 0}`} onClick={() => doTurn({ type: "move", moveKey: "attack1" })} />
              {pc.attack2 && (pc.attack2.dmg > 0 || pc.attack2.heal > 0) && <ActionBtn label={pc.attack2.name} sub={pc.attack2.dmg ? `-${pc.attack2.dmg}` : `+${pc.attack2.heal} PV`} onClick={() => doTurn({ type: "move", moveKey: "attack2" })} />}
              {pc.super && <ActionBtn label={pc.super.name} sub={`Super -${pc.super.dmg}`} disabled={pc.superUsed} gold onClick={() => doTurn({ type: "move", moveKey: "super" })} />}
            </div>
            {myItems.length > 0 && (
              <>
                <div style={{ fontSize: 11, color: "#77768a", fontWeight: 700, margin: "12px 0 6px", textTransform: "uppercase" }}>🎒 Objets actifs</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {myItems.map(([id, n]) => { const it = itemById(id); if (!it) return null;
                    return <ActionBtn key={id} label={`${it.name} ×${n}`} sub={it.effect} onClick={() => doTurn({ type: "item", item: it })} purple />;
                  })}
                </div>
              </>
            )}
          </>
        ) : (
          <div style={{ textAlign: "center", padding: "14px 0" }}>
            <div style={{ fontFamily: "Bungee, sans-serif", fontSize: 18, color: fight.result === "win" ? "#7cd992" : "#ef6a6a", marginBottom: 6 }}>
              {fight.result === "win" ? "Victoire !" : "Défaite"}
            </div>
            <div style={{ fontSize: 13, color: "#9a99a8", marginBottom: 16 }}>+{fight.reward} 🪙</div>
            <button onClick={() => { setFight(null); setTeam([]); }} style={{
              all: "unset", cursor: "pointer", padding: "12px 28px", borderRadius: 12,
              background: "linear-gradient(90deg,#F0A93A,#EC4899)", color: "#141119", fontWeight: 800, fontSize: 13.5,
            }}>Retour</button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <div style={{ fontFamily: "Bungee, sans-serif", fontSize: 18, marginBottom: 4 }}>Combat</div>
      <div style={{ fontSize: 12.5, color: "#8a8998", marginBottom: 14 }}>Choisis jusqu'à 3 spécimens et affronte un bot.</div>
      {owned.length === 0 ? (
        <div style={{ background: "#17161f", borderRadius: 12, padding: 20, textAlign: "center", fontSize: 13, color: "#8a8998" }}>Débloque des spécimens dans la boutique d'abord.</div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 16 }}>
            {owned.map((c) => (
              <div key={c.id} style={{ position: "relative" }}>
                <CharCard character={c} locked={false} onClick={() => toggleTeam(c.id)} />
                {team.includes(c.id) && (
                  <div style={{ position: "absolute", top: 6, right: 6, width: 22, height: 22, borderRadius: "50%", background: "#F0A93A", color: "#141119", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 12 }}>{team.indexOf(c.id) + 1}</div>
                )}
              </div>
            ))}
          </div>
          <button disabled={team.length === 0} onClick={startFight} style={{
            all: "unset", cursor: team.length ? "pointer" : "not-allowed", display: "block", width: "100%", textAlign: "center",
            padding: "14px 0", borderRadius: 12, fontWeight: 800, fontSize: 14,
            background: team.length ? "linear-gradient(90deg,#F0A93A,#EC4899)" : "#232230", color: team.length ? "#141119" : "#5c5b68",
          }}>Lancer le combat ({team.length}/3)</button>
        </>
      )}
    </div>
  );
}

function ActionBtn({ label, sub, onClick, disabled, gold, purple }) {
  return (
    <button disabled={disabled} onClick={onClick} style={{
      all: "unset", cursor: disabled ? "not-allowed" : "pointer", padding: "11px 12px", borderRadius: 11,
      background: disabled ? "#1a1922" : (gold ? "#2a2314" : purple ? "#231c2e" : "#17161f"),
      border: `1.5px solid ${disabled ? "#232230" : gold ? "#F0A93A66" : purple ? "#A855F766" : "#2a2933"}`,
      opacity: disabled ? 0.4 : 1,
    }}>
      <div style={{ fontWeight: 800, fontSize: 12.5, color: gold ? "#F0A93A" : "#f4f2ec", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 10.5, color: "#8a8998" }}>{sub}</div>
    </button>
  );
}

function BattleSidePanel({ title, chars, active, align }) {
  return (
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 10.5, color: "#77768a", fontWeight: 700, marginBottom: 6, textAlign: align === "right" ? "right" : "left" }}>{title}</div>
      {chars.map((c, i) => {
        const pct = Math.max(0, Math.round((c.curHp / c.hp) * 100));
        const isActive = i === active;
        return (
          <div key={i} style={{ opacity: c.curHp <= 0 ? 0.35 : 1, marginBottom: 6 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, marginBottom: 2, flexDirection: align === "right" ? "row-reverse" : "row" }}>
              <span style={{ fontWeight: isActive ? 800 : 500 }}>{c.name}{isActive && c.curHp > 0 ? " ▶" : ""}</span>
              <span style={{ color: "#8a8998", fontFamily: "'JetBrains Mono', monospace" }}>{c.curHp}/{c.hp}</span>
            </div>
            <div style={{ height: 5, background: "#232230", borderRadius: 4, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${pct}%`, background: pct > 50 ? "#7cd992" : pct > 20 ? "#F0A93A" : "#ef6a6a" }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function NewsTab({ game }) {
  const sorted = [...game.events].sort((a, b) => (b.pinned - a.pinned) || (b.published_at || "").localeCompare(a.published_at || ""));
  return (
    <div>
      <div style={{ fontFamily: "Bungee, sans-serif", fontSize: 18, marginBottom: 14 }}>Actualités</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {sorted.map((n) => (
          <div key={n.id} style={{ background: "#17161f", border: "1px solid #24232d", borderRadius: 14, padding: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              {n.pinned && <span style={{ fontSize: 12 }}>📌</span>}
              <div style={{ fontWeight: 800, fontSize: 14.5, flex: 1 }}>{n.title}</div>
              <div style={{ fontSize: 10.5, color: "#77768a", fontFamily: "'JetBrains Mono', monospace" }}>{n.published_at}</div>
            </div>
            <div style={{ fontSize: 12.5, color: "#b9b8c4", lineHeight: 1.6, whiteSpace: "pre-line" }}>{n.content}</div>
          </div>
        ))}
        {sorted.length === 0 && <div style={{ color: "#5c5b68", fontSize: 13 }}>Aucune actu pour le moment.</div>}
      </div>
    </div>
  );
}

function ProfileTab({ profile, game, persistProfile, showToast }) {
  const [confirmReset, setConfirmReset] = useState(false);
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
        {profile.is_admin && <div style={{ marginTop: 8 }}><RarityTag rarity="ultra_legendary" /> <span style={{ fontSize: 11, color: "#FFD54A", fontWeight: 700 }}>Admin</span></div>}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
        <MiniStat label="Pièces" value={(profile.coins ?? 0).toLocaleString("fr-FR")} icon="🪙" />
        <MiniStat label="Spécimens" value={`${(profile.unlocked_character_ids || []).length}/${game.characters.length}`} icon="🃏" />
        <MiniStat label="Boîtes ouvertes" value={profile.boxes_opened ?? 0} icon="🎁" />
        <MiniStat label="PTD total" value={ptdTotal} icon="📊" />
      </div>
      <div style={{ background: "#17161f", border: "1px solid #24232d", borderRadius: 14, padding: 14, marginBottom: 14 }}>
        <div style={{ fontSize: 11, color: "#77768a", fontWeight: 700, marginBottom: 10, textTransform: "uppercase" }}>Objets</div>
        {Object.entries(profile.item_stacks || {}).filter(([, n]) => n > 0).length === 0 ? (
          <div style={{ fontSize: 12.5, color: "#5c5b68" }}>Aucun objet pour le moment.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {Object.entries(profile.item_stacks || {}).filter(([, n]) => n > 0).map(([id, n]) => {
              const it = itemById(id); if (!it) return null;
              return (
                <div key={id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div><div style={{ fontWeight: 700, fontSize: 12.5 }}>{it.name}</div><div style={{ fontSize: 10.5, color: "#8a8998" }}>{it.effect}</div></div>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 800, color: "#A855F7" }}>×{n}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {!confirmReset ? (
        <button onClick={() => setConfirmReset(true)} style={{
          all: "unset", cursor: "pointer", display: "block", width: "100%", textAlign: "center",
          padding: "12px 0", borderRadius: 12, background: "#231a1a", border: "1px solid #ef6a6a55", color: "#ef6a6a", fontWeight: 700, fontSize: 12.5,
        }}>Réinitialiser ma progression</button>
      ) : (
        <div style={{ background: "#231a1a", border: "1px solid #ef6a6a55", borderRadius: 12, padding: 14, textAlign: "center" }}>
          <div style={{ fontSize: 12.5, color: "#f0b8b8", marginBottom: 10 }}>Ceci effacera ta collection, tes pièces et tes objets. Confirmer ?</div>
          <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
            <button onClick={() => setConfirmReset(false)} style={{ all: "unset", cursor: "pointer", padding: "9px 16px", borderRadius: 10, background: "#2a2933", color: "#c2c1cc", fontSize: 12, fontWeight: 700 }}>Annuler</button>
            <button onClick={async () => {
              await persistProfile({ coins: 300, unlocked_character_ids: [], unlocked_item_ids: [], item_stacks: {}, boxes_opened: 0, last_free_box_claim: null });
              setConfirmReset(false); showToast("Progression réinitialisée.");
            }} style={{ all: "unset", cursor: "pointer", padding: "9px 16px", borderRadius: 10, background: "#ef6a6a", color: "#141119", fontSize: 12, fontWeight: 800 }}>Confirmer</button>
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

function AdminTab({ game, reload, showToast }) {
  const [section, setSection] = useState("characters");
  const sections = [
    { id: "characters", label: "Personnages" },
    { id: "items", label: "Objets" },
    { id: "boxes", label: "Boîtes" },
    { id: "events", label: "Événements" },
  ];

  const deleteRow = async (table, id) => {
    const { error } = await supabase.from(table).delete().eq("id", id);
    if (error) showToast("Erreur : " + error.message);
    else { showToast("Supprimé."); reload(); }
  };

  return (
    <div>
      <div style={{ fontFamily: "Bungee, sans-serif", fontSize: 18, marginBottom: 4 }}>🛠️ Panneau Admin</div>
      <div style={{ display: "flex", gap: 6, overflowX: "auto", padding: "12px 0 16px" }}>
        {sections.map((s) => (
          <button key={s.id} onClick={() => setSection(s.id)} style={{
            all: "unset", cursor: "pointer", whiteSpace: "nowrap", padding: "7px 13px", borderRadius: 20, fontSize: 12, fontWeight: 700,
            border: `1.5px solid ${section === s.id ? "#F0A93A" : "#2a2933"}`, color: section === s.id ? "#F0A93A" : "#8a8998",
            background: section === s.id ? "#1c1b24" : "transparent",
          }}>{s.label}</button>
        ))}
      </div>

      {section === "events" && <AdminEvents game={game} reload={reload} showToast={showToast} deleteRow={deleteRow} />}
      {section === "characters" && <AdminList
        rows={game.characters} reload={reload} showToast={showToast} table="characters"
        renderRow={(c) => `${c.name} · ${RARITIES[c.rarity]?.label} · PTD ${c.ptd}`} deleteRow={deleteRow}
      />}
      {section === "items" && <AdminList
        rows={game.items} reload={reload} showToast={showToast} table="game_items"
        renderRow={(i) => `${i.name} · ${RARITIES[i.rarity]?.label}`} deleteRow={deleteRow}
      />}
      {section === "boxes" && <AdminList
        rows={game.boxes} reload={reload} showToast={showToast} table="loot_boxes"
        renderRow={(b) => `${b.name} · ${b.is_free ? "Gratuit" : b.price + " 🪙"} · ${b.is_active ? "active" : "inactive"}`} deleteRow={deleteRow}
      />}
    </div>
  );
}

function AdminList({ rows, renderRow, deleteRow, table }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontSize: 11.5, color: "#77768a", marginBottom: 4 }}>
        {rows.length} élément{rows.length > 1 ? "s" : ""}. Pour ajouter ou modifier du contenu, passe par le SQL Editor de Supabase — c'est le plus fiable pour ce type de données riches.
      </div>
      {rows.map((r) => (
        <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#17161f", border: "1px solid #24232d", borderRadius: 10, padding: "10px 12px" }}>
          <div style={{ fontSize: 12.5 }}>{renderRow(r)}</div>
          <button onClick={() => deleteRow(table, r.id)} style={{ all: "unset", cursor: "pointer", fontSize: 15, opacity: 0.7 }}>🗑️</button>
        </div>
      ))}
    </div>
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
    if (error) showToast("Erreur : " + error.message);
    else { setTitle(""); setContent(""); setPinned(false); showToast("Actu publiée."); reload(); }
  };

  return (
    <div>
      <div style={{ background: "#17161f", border: "1px solid #F0A93A55", borderRadius: 14, padding: 14, marginBottom: 16 }}>
        <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 10 }}>+ Publier une actu</div>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Titre" style={inputStyle} />
        <textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="Contenu" rows={4}
          style={{ ...inputStyle, resize: "vertical", fontFamily: "'Work Sans', sans-serif" }} />
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "#c2c1cc", marginBottom: 12 }}>
          <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} /> Épingler
        </label>
        <button disabled={busy} onClick={create} style={{
          all: "unset", cursor: "pointer", display: "block", width: "100%", textAlign: "center", padding: "11px 0", borderRadius: 10,
          background: "linear-gradient(90deg,#F0A93A,#EC4899)", color: "#141119", fontWeight: 800, fontSize: 13,
        }}>Publier</button>
      </div>
      <AdminList rows={game.events} table="game_events" deleteRow={deleteRow} renderRow={(n) => `${n.pinned ? "📌 " : ""}${n.title} (${n.published_at})`} />
    </div>
  );
}
