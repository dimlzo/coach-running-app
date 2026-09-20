import { useState, useRef, useEffect } from "react";
import { Home, CalendarDays, Activity, Trophy, MessageCircle, ArrowLeft, Sparkles, ChevronRight } from "lucide-react";

// ============================================================
//  MON COACH RUNNING — V2 · direction sobre & premium (Whoop/Oura)
//  - palette resserrée : un seul accent violet raffiné
//  - home plus dense : résumé de la semaine + mini-graph
//  - tab bar : icônes + libellés, état actif discret
// ============================================================

const N8N = { chat: "", data: "https://lfp-digital.app.n8n.cloud/webhook/coach-data" }; // ← ex: https://.../webhook/coach-data

const SYSTEM_PROMPT = `Tu es le coach running personnel de Dim, qui prépare un semi-marathon en novembre.
Réponds en français, brièvement et avec justesse.`;

// --- Palette sobre : presque monochrome + 1 accent ---
const C = {
  bg: "#0A0910",
  surface: "#141219",
  surfaceHi: "#1A1822",
  line: "rgba(255,255,255,0.07)",
  text: "#F4F3F7",
  sub: "#9E9BAA",
  faint: "#68656F",
  accent: "#8E86FF",
  accentSoft: "rgba(142,134,255,0.14)",
};

// ⚠️ Démo — remplacé par ton n8n/Strava en mode connecté.
const SEANCES_DEMO = [
  { date: "14 août", type: "Endurance", distance: 8.2, duree: "45 min", allure: "5:29", ressenti: "facile" },
  { date: "12 août", type: "Fractionné", distance: 6.0, duree: "38 min", allure: "6:20", ressenti: "dur" },
  { date: "10 août", type: "Sortie longue", distance: 14.5, duree: "1h22", allure: "5:39", ressenti: "moyen" },
  { date: "8 août", type: "Récupération", distance: 5.0, duree: "31 min", allure: "6:12", ressenti: "facile" },
];
const PROGRAMME_DEMO = [
  { jour: "Aujourd'hui", type: "Fractionné", detail: "6 × 400m · récup 1 min", cible: "4:45" },
  { jour: "Jeudi", type: "Endurance", detail: "50 min en aisance", cible: "5:30" },
  { jour: "Samedi", type: "Sortie longue", detail: "16 km", cible: "5:40" },
  { jour: "Dimanche", type: "Repos", detail: "récup active ou off", cible: "—" },
];
const RECORDS_DEMO = [
  { label: "1 km", valeur: "4:12" }, { label: "5 km", valeur: "22:30" },
  { label: "10 km", valeur: "47:10" }, { label: "Semi", valeur: "—" },
  { label: "Km / mois", valeur: "128" }, { label: "Sorties", valeur: "17" },
];
// km par jour de la semaine (démo)
const SEMAINE = [
  { j: "L", km: 0 }, { j: "M", km: 8.2 }, { j: "M", km: 0 },
  { j: "J", km: 6 }, { j: "V", km: 5, today: true }, { j: "S", km: 14.5 }, { j: "D", km: 0 },
];

// petit libellé "premium" (majuscules espacées)
function Micro({ children, style }) {
  return <div style={{ fontSize: 10.5, letterSpacing: "1.4px", textTransform: "uppercase", color: C.faint, fontWeight: 600, ...style }}>{children}</div>;
}

export default function CoachRunning() {
  const [ecran, setEcran] = useState("home");
  const [messages, setMessages] = useState([{ role: "assistant", content: "Salut Dim. Comment tu te sens aujourd'hui ?" }]);
  const [promptEnAttente, setPromptEnAttente] = useState(null);
  const [seances, setSeances] = useState(SEANCES_DEMO);
  const [programme, setProgramme] = useState(PROGRAMME_DEMO);
  const [records, setRecords] = useState(RECORDS_DEMO);
  const [source, setSource] = useState(N8N.data ? "…" : "démo");

  useEffect(() => {
    if (!N8N.data) return;
    (async () => {
      try {
        const d = await (await fetch(N8N.data)).json();
        if (d.seances) setSeances(d.seances);
        if (d.programme) setProgramme(d.programme);
        if (d.records) setRecords(d.records);
        setSource("connecté");
      } catch { setSource("démo"); }
    })();
  }, []);

  const estChat = ecran === "chat";

  return (
    <div className="flex flex-col mx-auto" style={{ position: "relative", height: "100dvh", width: "100%", maxWidth: "480px", background: C.bg, color: C.text, overflow: "hidden", fontFamily: '"Inter", system-ui, sans-serif' }}>
      {ecran === "home" && (
        <EcranHome
          derniere={seances[0]} prochaine={programme[0]} source={source}
          onChat={() => setEcran("chat")} onProg={() => setEcran("programme")}
          onAnalyse={() => {
            const s = seances[0];
            setPromptEnAttente(`Analyse ma dernière séance : ${s.type}, ${s.distance} km en ${s.duree}, allure ${s.allure}/km, ressenti "${s.ressenti}". Retour bref.`);
            setEcran("chat");
          }}
        />
      )}
      {ecran === "programme" && <EcranProgramme programme={programme} />}
      {ecran === "seances" && <EcranSeances seances={seances} />}
      {ecran === "records" && <EcranRecords records={records} />}
      {ecran === "chat" && <EcranChat messages={messages} setMessages={setMessages} promptInitial={promptEnAttente} effacePrompt={() => setPromptEnAttente(null)} onRetour={() => setEcran("home")} />}
      {!estChat && <BulleCoach onClick={() => setEcran("chat")} />}
      {!estChat && <BarreOnglets ecran={ecran} setEcran={setEcran} />}
    </div>
  );
}

// ============================================================
//  HOME
// ============================================================
function EcranHome({ derniere, prochaine, source, onChat, onProg, onAnalyse }) {
  const totalKm = SEMAINE.reduce((s, d) => s + d.km, 0).toFixed(1);
  const nbSeances = SEMAINE.filter((d) => d.km > 0).length;
  const jSemi = Math.max(0, Math.ceil((new Date("2026-11-08") - new Date()) / 86400000));

  return (
    <div className="flex-1" style={{ overflowY: "auto", padding: "22px 18px 96px" }}>
      {/* en-tête */}
      <div className="flex" style={{ justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <Micro>Semi-marathon · 8 nov.</Micro>
          <div style={{ fontSize: 25, fontWeight: 800, letterSpacing: "-0.6px", marginTop: 3 }}>Salut Dim</div>
        </div>
        <span style={{ fontSize: 10.5, color: C.sub, border: `1px solid ${C.line}`, borderRadius: 999, padding: "3px 9px", marginTop: 4 }}>{source}</span>
      </div>

      {/* prochaine séance — carte signature discrète */}
      <Micro style={{ marginBottom: 8 }}>Prochaine séance</Micro>
      <button onClick={onProg} className="flex" style={{ width: "100%", textAlign: "left", alignItems: "center", gap: 12, cursor: "pointer", border: `1px solid ${C.line}`, borderRadius: 18, padding: "16px 18px", marginBottom: 22, background: "radial-gradient(120% 120% at 100% 0%, rgba(142,134,255,0.20), rgba(142,134,255,0) 58%), #17151F" }}>
        <div style={{ flex: 1 }}>
          <div className="flex" style={{ alignItems: "baseline", gap: 8 }}>
            <span style={{ fontSize: 19, fontWeight: 800, letterSpacing: "-0.3px" }}>{prochaine.type}</span>
            <span style={{ fontSize: 12.5, color: C.sub }}>· {prochaine.jour}</span>
          </div>
          <div style={{ fontSize: 13.5, color: C.sub, marginTop: 3 }}>{prochaine.detail}</div>
          <div style={{ fontSize: 12.5, color: C.accent, marginTop: 7, fontVariantNumeric: "tabular-nums" }}>cible {prochaine.cible}/km</div>
        </div>
        <ChevronRight size={20} color={C.faint} />
      </button>

      {/* cette semaine — stats + mini graph (comble le vide) */}
      <Micro style={{ marginBottom: 10 }}>Cette semaine</Micro>
      <div style={{ border: `1px solid ${C.line}`, borderRadius: 18, padding: "16px 18px", marginBottom: 22, background: C.surface }}>
        <div className="flex" style={{ marginBottom: 16 }}>
          <Stat val={`${totalKm}`} unit="km" />
          <Stat val={`${nbSeances}`} unit="séances" />
          <Stat val={`J-${jSemi}`} unit="objectif" />
        </div>
        <div className="flex" style={{ alignItems: "flex-end", gap: 7, height: 58 }}>
          {SEMAINE.map((d, i) => {
            const max = Math.max(...SEMAINE.map((x) => x.km), 1);
            const h = d.km > 0 ? Math.max(6, (d.km / max) * 48) : 3;
            return (
              <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                <div style={{ width: "100%", height: h, borderRadius: 3, background: d.km > 0 ? (d.today ? C.accent : "rgba(142,134,255,0.34)") : "rgba(255,255,255,0.06)" }} />
                <span style={{ fontSize: 10, color: d.today ? C.accent : C.faint }}>{d.j}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* dernière séance */}
      <Micro style={{ marginBottom: 8 }}>Dernière séance</Micro>
      <div style={{ border: `1px solid ${C.line}`, borderRadius: 18, padding: "15px 18px", marginBottom: 22, background: C.surface }}>
        <div className="flex" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
          <span style={{ fontSize: 15.5, fontWeight: 700 }}>{derniere.type}</span>
          <span style={{ fontSize: 12.5, color: C.faint }}>{derniere.date}</span>
        </div>
        <div className="flex" style={{ gap: 16, marginTop: 8, fontSize: 13.5, color: C.sub, fontVariantNumeric: "tabular-nums" }}>
          <span>{derniere.distance} km</span><span>{derniere.duree}</span><span>{derniere.allure}/km</span>
        </div>
        <button onClick={onAnalyse} className="flex" style={{ alignItems: "center", gap: 6, marginTop: 13, padding: 0, border: "none", background: "none", color: C.accent, fontWeight: 600, fontSize: 13.5, cursor: "pointer" }}>
          <Sparkles size={15} /> Analyse rapide
        </button>
      </div>
    </div>
  );
}

function Stat({ val, unit }) {
  return (
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.5px", fontVariantNumeric: "tabular-nums" }}>{val}</div>
      <div style={{ fontSize: 11, color: C.faint, marginTop: 1 }}>{unit}</div>
    </div>
  );
}

// ============================================================
//  PROGRAMME
// ============================================================
function EcranProgramme({ programme }) {
  return (
    <>
      <EnTete titre="Programme" sousTitre="Cette semaine" />
      <div className="flex-1" style={{ overflowY: "auto", padding: "4px 18px 96px" }}>
        {programme.map((p, i) => (
          <div key={i} className="flex" style={{ alignItems: "center", gap: 14, padding: "14px 2px", borderBottom: i < programme.length - 1 ? `1px solid ${C.line}` : "none" }}>
            <div style={{ width: 3, height: 34, borderRadius: 3, background: p.type === "Repos" ? C.line : C.accent }} />
            <div style={{ flex: 1 }}>
              <div className="flex" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ fontWeight: 700, fontSize: 15 }}>{p.type}</span>
                <span style={{ fontSize: 12.5, color: C.faint }}>{p.jour}</span>
              </div>
              <div style={{ fontSize: 13, color: C.sub, marginTop: 3 }}>{p.detail}{p.cible !== "—" ? ` · cible ${p.cible}/km` : ""}</div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

// ============================================================
//  SÉANCES
// ============================================================
function EcranSeances({ seances }) {
  const teinte = { facile: 0.45, moyen: 0.7, dur: 1 };
  return (
    <>
      <EnTete titre="Séances" sousTitre="Synchronisées avec Strava" />
      <div className="flex-1" style={{ overflowY: "auto", padding: "4px 18px 96px" }}>
        {seances.map((s, i) => (
          <div key={i} style={{ padding: "15px 2px", borderBottom: i < seances.length - 1 ? `1px solid ${C.line}` : "none" }}>
            <div className="flex" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ fontWeight: 700, fontSize: 15 }}>{s.type}</span>
              <span style={{ fontSize: 12.5, color: C.faint }}>{s.date}</span>
            </div>
            <div className="flex" style={{ gap: 16, marginTop: 8, fontSize: 13.5, color: C.sub, fontVariantNumeric: "tabular-nums" }}>
              <span>{s.distance} km</span><span>{s.duree}</span><span>{s.allure}/km</span>
            </div>
            <div className="flex" style={{ alignItems: "center", gap: 6, marginTop: 9 }}>
              <span style={{ width: 6, height: 6, borderRadius: 999, background: C.accent, opacity: teinte[s.ressenti] || 0.5 }} />
              <Micro style={{ color: C.sub }}>{s.ressenti}</Micro>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

// ============================================================
//  RECORDS
// ============================================================
function EcranRecords({ records }) {
  return (
    <>
      <EnTete titre="Records" sousTitre="Tes meilleures perfs" />
      <div className="flex-1" style={{ overflowY: "auto", padding: "4px 18px 96px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {records.map((r, i) => (
            <div key={i} style={{ border: `1px solid ${C.line}`, borderRadius: 16, padding: "15px 16px", background: C.surface }}>
              <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.8px", fontVariantNumeric: "tabular-nums" }}>{r.valeur}</div>
              <Micro style={{ marginTop: 5, color: C.sub }}>{r.label}</Micro>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

// ============================================================
//  CHAT
// ============================================================
function EcranChat({ messages, setMessages, promptInitial, effacePrompt, onRetour }) {
  const [saisie, setSaisie] = useState("");
  const [enCours, setEnCours] = useState(false);
  const bas = useRef(null);
  useEffect(() => { bas.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, enCours]);
  useEffect(() => { if (promptInitial) { envoyer(promptInitial); effacePrompt(); } /* eslint-disable-next-line */ }, []);

  async function envoyer(texteForce) {
    const texte = (texteForce || saisie).trim();
    if (!texte || enCours) return;
    const nouveaux = [...messages, { role: "user", content: texte }];
    setMessages(nouveaux); setSaisie(""); setEnCours(true);
    try {
      let reponse;
      if (N8N.chat) {
        const d = await (await fetch(N8N.chat, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: texte, userId: "dim" }) })).json();
        reponse = d.reply;
      } else {
        const d = await (await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 1000, system: SYSTEM_PROMPT, messages: nouveaux.map((m) => ({ role: m.role, content: m.content })) }) })).json();
        reponse = d.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
      }
      setMessages((p) => [...p, { role: "assistant", content: reponse }]);
    } catch { setMessages((p) => [...p, { role: "assistant", content: "Oups, réessaie." }]); }
    finally { setEnCours(false); }
  }

  return (
    <>
      <div className="flex" style={{ alignItems: "center", gap: 12, padding: "16px 16px", borderBottom: `1px solid ${C.line}` }}>
        <button onClick={onRetour} style={{ border: "none", background: "none", color: C.text, cursor: "pointer", display: "flex" }}><ArrowLeft size={22} /></button>
        <div><div style={{ fontWeight: 700, fontSize: 15.5 }}>Coach</div><Micro style={{ color: C.sub, marginTop: 1 }}>en ligne</Micro></div>
      </div>
      <div className="flex-1 space-y-3" style={{ overflowY: "auto", padding: "16px" }}>
        {messages.map((m, i) => {
          const moi = m.role === "user";
          return (
            <div key={i} className="flex" style={{ justifyContent: moi ? "flex-end" : "flex-start" }}>
              <div style={{ maxWidth: "82%", padding: "10px 14px", borderRadius: 15, fontSize: 14.5, lineHeight: 1.45, whiteSpace: "pre-wrap", background: moi ? C.accent : C.surfaceHi, color: moi ? "#0A0910" : C.text, border: moi ? "none" : `1px solid ${C.line}` }}>{m.content}</div>
            </div>
          );
        })}
        {enCours && <Micro style={{ color: C.sub }}>le coach réfléchit…</Micro>}
        <div ref={bas} />
      </div>
      <div className="flex gap-2" style={{ padding: 12, borderTop: `1px solid ${C.line}` }}>
        <input value={saisie} onChange={(e) => setSaisie(e.target.value)} onKeyDown={(e) => e.key === "Enter" && envoyer()} placeholder="Écris à ton coach…" className="flex-1" style={{ padding: "11px 14px", borderRadius: 12, border: `1px solid ${C.line}`, background: C.surface, color: C.text, fontSize: 14.5, outline: "none" }} />
        <button onClick={() => envoyer()} disabled={enCours} style={{ padding: "0 18px", borderRadius: 12, border: "none", background: C.accent, color: "#0A0910", fontWeight: 700, cursor: "pointer" }}>Go</button>
      </div>
    </>
  );
}

function EnTete({ titre, sousTitre }) {
  return (
    <div style={{ padding: "22px 18px 12px" }}>
      <div style={{ fontSize: 23, fontWeight: 800, letterSpacing: "-0.5px" }}>{titre}</div>
      <Micro style={{ color: C.sub, marginTop: 3 }}>{sousTitre}</Micro>
    </div>
  );
}

// Bulle flottante "coach" — présente sur tous les écrans (sauf le chat).
// Positionnée en bas à droite, au-dessus de la tab bar.
// Pour la mettre à gauche : remplace `right: 18` par `left: 18`.
function BulleCoach({ onClick }) {
  return (
    <button onClick={onClick} aria-label="Parler à mon coach" style={{
      position: "absolute", right: 18, bottom: 82, zIndex: 10,
      width: 56, height: 56, borderRadius: 999, border: "none", cursor: "pointer",
      background: C.accent, color: "#0A0910",
      display: "flex", alignItems: "center", justifyContent: "center",
      boxShadow: "0 10px 26px rgba(142,134,255,0.40)",
    }}>
      <MessageCircle size={24} strokeWidth={2.2} />
    </button>
  );
}

function BarreOnglets({ ecran, setEcran }) {
  const onglets = [
    { id: "home", Icone: Home, label: "Accueil" },
    { id: "programme", Icone: CalendarDays, label: "Prog" },
    { id: "seances", Icone: Activity, label: "Séances" },
    { id: "records", Icone: Trophy, label: "Records" },
  ];
  return (
    <div className="flex" style={{ borderTop: `1px solid ${C.line}`, background: C.bg, padding: "8px 0 calc(10px + env(safe-area-inset-bottom, 0px))" }}>
      {onglets.map(({ id, Icone, label }) => {
        const actif = ecran === id;
        return (
          <button key={id} onClick={() => setEcran(id)} className="flex-1" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, border: "none", background: "none", cursor: "pointer", color: actif ? C.accent : C.faint }}>
            <Icone size={21} strokeWidth={actif ? 2.2 : 1.75} />
            <span style={{ fontSize: 10.5, fontWeight: actif ? 600 : 500, letterSpacing: "0.2px" }}>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
