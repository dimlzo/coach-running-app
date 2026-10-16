# CLAUDE.md — Mon Coach Running

> Fichier de contexte pour Claude Code. Lis-le en entier avant d'agir.
> Projet personnel de **Dim** : un coach running IA pour préparer un
> **semi-marathon le 8 novembre 2026**.

---

## 1. Comment travailler avec moi (instructions — à respecter)

- **Je ne suis pas développeur.** Explique simplement, sans jargon, et
  guide-moi pas à pas. Quand tu me fais faire une manip, donne les étapes
  concrètes (où cliquer, quoi coller), pas juste le concept.
- **Une brique à la fois.** On construit et on **teste chaque couche avant**
  de passer à la suivante. Ne branche jamais deux nouveautés d'un coup : si
  ça casse, on ne saurait pas laquelle est en cause.
- **Langue : français.**
- **Contraintes matérielles** (importantes pour les choix techniques) :
  - Téléphone **Android**.
  - **Mac du travail sans droits admin** → impossible d'installer des
    logiciels (`.pkg`), Node, Android Studio, etc. sur la machine.
  - Je préfère les **outils 100 % navigateur** : GitHub (web), GitHub
    Codespaces, Expo Snack, Hoppscotch, Vercel. Les builds se font **dans le
    cloud** (EAS) via Codespaces.
  - **Le terminal me ralentit** : minimise les commandes, donne-les une par
    une, et préviens-moi de ce qui va s'afficher.
- **Honnêteté technique** : si tu n'es pas sûr d'une version ou d'un
  comportement, dis-le, et prévois une étape qui corrige automatiquement
  (ex. `npx expo install --fix`) plutôt que d'affirmer au hasard.
- **Pour déboguer** : on regarde toujours les **logs réels** (console, logs
  de build, canvas n8n) plutôt que de deviner.

---

## 2. Vue d'ensemble

Un coach running qui analyse mes **vraies données Strava**, me parle en chat
(Telegram **et** app mobile), retient le fil de nos échanges, et me génère un
**programme hebdomadaire** que je peux corriger à la main.

**Règle d'or absolue (conformité Strava) :**
> **n8n ne doit JAMAIS appeler l'API Strava directement.**
> Tout accès à Strava passe par **ma fonction Vercel** (intégration directe,
> avec mon propre Client ID). Strava a désactivé l'app par le passé parce
> qu'elle passait par une « plateforme intermédiaire » (n8n). On est
> aujourd'hui conformes — il faut le rester.

---

## 3. Architecture

```
            ┌────────────┐      ┌─────────────────────┐      ┌────────────┐
  Strava ◄──┤  Fonction  │◄─────┤        n8n          │◄─────┤  Telegram  │
   API      │   Vercel   │      │  (le "cerveau")     │      └────────────┘
            │ (intégra-  │      │  Claude + Sheets +  │      ┌────────────┐
            │ tion       │      │  météo + /programme │◄─────┤  App (RN)  │
            │ directe)   │      └─────────┬───────────┘      └────────────┘
            └────────────┘                │
                                   ┌──────▼───────┐
                                   │ Google Sheet │  mémoire conversation
                                   │ "Running App"│  + onglet "Programme"
                                   └──────────────┘
```

- **Faits** (activités, allures) = ré-injectés **frais** depuis Strava à
  chaque message. **Ne jamais les figer dans la mémoire Sheets.**
- **Mémoire Sheets** = uniquement la **continuité de conversation**.
  (Un bug « dernière sortie fausse » venait d'anciennes réponses stockées qui
  se renforçaient toutes seules → mémoire nettoyée, et prompt recalé sur les
  données fraîches.)

---

## 4. Composants

### 4.1 Fonction Vercel — intégration Strava directe
- Projet Vercel : **`strava-proxy-one`** (URL `https://strava-proxy-one.vercel.app`).
- Fichier : `api/strava.js` (fonction serverless).
- Endpoints :
  - `GET /api/strava?key=<API_KEY>&per_page=100` → liste des activités (brut Strava).
  - `GET /api/strava?id=<id>&key=<API_KEY>` → détail d'une activité (laps).
- Rafraîchit l'access token via le refresh token, protège l'accès par `key`.
- **Variables d'env (dans Vercel, PAS dans le repo)** : `STRAVA_CLIENT_ID`
  (= 225649), `STRAVA_CLIENT_SECRET`, `STRAVA_REFRESH_TOKEN`, `API_KEY`.

### 4.2 n8n Cloud — le cerveau
Instance : `lfp-digital.app.n8n.cloud`. Trois workflows :

1. **Telegram coach** : Telegram Trigger → Sheets (historique) → activités via
   **fonction Vercel** → météo (Open-Meteo) → Claude → réponse Telegram → sauvegarde Sheets.
2. **Coach — chat (app)** : `POST /webhook/coach-chat`.
   - Un **Switch** sur le message :
     - `=== "/programme"` → branche **génération** : activités (Vercel) →
       Claude génère le programme en **JSON strict** → **Clear** la feuille
       Programme → écrit les nouvelles lignes (Append auto-map) → Respond.
       (Clear placé **en tête de branche** pour ne pas couper le fil de données.)
     - sinon → chat normal (même cerveau que Telegram) → `{ "reply": "..." }`.
   - CORS : `Allowed Origins = *`. Respond With = **First Incoming Item**.
3. **Coach — données** : `GET /webhook/coach-data`.
   - Webhook → HTTP Request (**fonction Vercel**) → Google Sheets lecture de
     l'onglet **Programme** (⚠️ option **Execute Once** activée) → nœud **Code**
     de mise en forme → Respond (First Incoming Item).

> Modèle Claude utilisé dans n8n : `claude-sonnet-5`.
> ⚠️ La `key=` de la fonction Vercel est en clair dans les URL des nœuds n8n —
> **à ranger dans une variable n8n** (TODO).

### 4.3 Google Sheet « Running App »
- Feuille principale : mémoire conversation (colonnes `Date / Role / Content`).
- Onglet **`Programme`** (en-tête : `jour | type | detail | cible`) — source de
  vérité du programme : le coach y écrit, je peux corriger à la main, l'app le lit.

### 4.4 Frontends
- **Web** (repo `coach-running-app`) : React + Vite, déployé sur **Vercel**.
  Historique mais **version de référence = l'app native** maintenant.
- **Native** (repo `coach-running-native`) : **React Native / Expo**, SDK 55.
  C'est la version active, qu'on transforme en **vraie app (APK via EAS)**.
  Entrée : `App.js` (le code de référence vient de mes dernières modifs Snack).

---

## 5. Contrats de données (front ↔ back)

**`GET /webhook/coach-data`** renvoie :
```json
{
  "seances":   [{ "date": "19 sept.", "date_iso": "2026-09-19", "type": "...",
                  "distance": 9, "duree": "1h00", "allure": "6:37", "ressenti": "Bien" }],
  "records":   [{ "label": "5 km", "valeur": "22:30" }],
  "programme": [{ "jour": "...", "type": "...", "detail": "...", "cible": "..." }]
}
```
**`POST /webhook/coach-chat`** : body `{ "message": "...", "userId": "dim" }`
→ réponse `{ "reply": "..." }`.

- `ressenti` : actuellement **déduit de la FC moyenne**, échelle 5 niveaux
  (`Plaisir / Bien / Normal / Dur / Horrible`). Le ressenti **cliquable** (saisi
  par moi dans l'app) n'est pas encore branché (TODO écriture).
- `records` : approximés par bande de distance (meilleur temps sur sorties ~ X km),
  pas les vrais « best efforts » Strava (TODO v2).

---

## 6. Design system (app)

Direction **sobre & premium** (type Whoop/Oura) : fond sombre, **un seul accent
violet**, typo à chiffres tabulaires, petits labels en majuscules espacées,
tab bar icônes + libellés, **bulle de chat flottante** présente partout.

```js
const C = {
  bg: "#0A0910", surface: "#141219", surfaceHi: "#1A1822",
  line: "rgba(255,255,255,0.08)", text: "#F4F3F7",
  sub: "#9E9BAA", faint: "#68656F", accent: "#8E86FF",
};
```
Écrans : Accueil (prochaine séance en dégradé + « cette semaine » stats +
mini-graph lundi→dimanche + dernière séance), Programme, Séances, Records, Chat.

---

## 7. Ce qui est FAIT ✅

- Intégration Strava **directe et conforme** (fonction Vercel) — plus de 429/ban.
- n8n rebranché sur la fonction Vercel ; **bot Telegram pleinement opérationnel**.
- Webhook **coach-data** (séances + records + programme).
- Webhook **coach-chat** avec commande **`/programme`** (génère + écrit la feuille).
- **App web déployée** (Vercel) avec vraies données + chat.
- **Portage Expo / React Native** : vraies données partout, semaine calendaire
  lundi→dimanche (fuseau local géré), **historique de chat persistant**
  (AsyncStorage), **input clavier corrigé** (KeyboardAvoidingView),
  **cache** (affichage instantané + badge « maj… »).
- Versions SDK alignées (Expo Go redescendu au SDK 55 de Snack).

---

## 8. Ce qui RESTE à faire (TODO)

### 🔴 EN COURS — le build EAS échoue (à reprendre ici)
Build Android (APK) via **EAS Build**, lancé depuis **Codespaces** (repo
`coach-running-native`) avec un **access token Expo** (`export EXPO_TOKEN=...`,
pas de login navigateur qui ne marche pas en Codespaces).

Erreur bloquante, reproduite 2×, phase « Run gradlew » :
```
Build file '.../android/app/build.gradle' line: 14
> Cannot invoke method getAbsolutePath() on null object
```
→ Gradle cherche un **fichier image attendu mais introuvable** (icône/splash).
Piste principale : `assets/icon.png` **mal uploadé** (sur GitHub web, une image
doit passer par **Add file → Upload files**, pas « Create new file »), ou
`app.json` référence une image qui n'existe pas.

**Prochaines actions de diag (dans Codespaces) :**
```
sed -n '1,30p' android/app/build.gradle   # voir ce que la ligne 14 lit
ls -l assets                              # icon.png présent ? taille ≠ 0 ?
cat app.json                              # références d'images cohérentes ?
```
Options : ré-uploader une vraie icône PNG **1024×1024** dans `assets/icon.png`
et pointer `app.json` dessus ; **ou** retirer temporairement toute référence
d'image d'`app.json` pour builder avec l'icône Expo par défaut, puis remettre
la mienne. (Je veux une icône perso à terme.)

### Ensuite
- **Ressenti cliquable** (brique « écriture ») : qualifier une séance en 1 tap
  dans l'app. Prévu : feuille « Ressentis » (`activity_id / ressenti`) + webhook
  `set-ressenti` + fusion avec les données Strava à l'affichage (le ressenti
  manuel remplace l'estimation FC).
- **Sécuriser la `key=`** de la fonction Vercel (variable n8n au lieu de l'URL en clair).
- **Records v2** : vrais best efforts Strava (via le détail d'activité).
- Finaliser **icône / splash**.
- Vérifier le libellé **« Cible »** (écran Programme + accueil).
- Plus tard : pull-to-refresh, notifications.

---

## 9. Secrets & environnement (NE PAS committer)

Rien de sensible ne doit finir dans le repo. Où vivent les secrets :
- **Vercel (env vars)** : `STRAVA_CLIENT_SECRET`, `STRAVA_REFRESH_TOKEN`,
  `API_KEY`, `STRAVA_CLIENT_ID` (225649, peu sensible).
- **n8n** : credentials Claude API, Google Sheets, (plus de credential Strava —
  volontairement supprimée pour la conformité).
- **Codespaces (session)** : `EXPO_TOKEN` (jeton d'accès Expo, régénérable sur
  expo.dev/settings/access-tokens ; à refaire après réouverture de Codespaces).
- Le `client_secret` et le `refresh_token` Strava ont déjà été **régénérés** une
  fois (après avoir été visibles en clair). Les valeurs vivantes ne sont que
  dans Vercel.

---

## 10. Repos & outils

- GitHub `dimlzo/coach-running-native` — app Expo/RN (cible du build EAS).
- GitHub `dimlzo/coach-running-app` — app web Vite (déployée Vercel).
- Vercel `strava-proxy-one` — la fonction d'intégration Strava.
- n8n Cloud `lfp-digital.app.n8n.cloud` — le cerveau (3 workflows).
- Outils navigateur : Codespaces (dev + build), Hoppscotch (tester les webhooks),
  Expo Go (tester l'app sur Android).

**Fichiers du repo natif :** `App.js` (tout le code), `index.js`,
`package.json`, `app.json`, `eas.json`, `assets/icon.png`.
