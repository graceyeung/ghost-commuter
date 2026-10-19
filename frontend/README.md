# Ghost Commuter: frontend

Next.js 15 (App Router) + TypeScript (strict) + Tailwind. Pairs London students on the same line
and departure time for **walk-home pairs** and **train-carriage study groups**. Talks to the FastAPI
backend in the parent folder, or runs fully offline on mock data.

## Run it

### Offline demo (mock mode, the default)

```bash
cd frontend
cp .env.example .env.local     # NEXT_PUBLIC_USE_MOCKS=true
npm install
npm run dev                    # http://localhost:3000
```

Everything (students, matches, acceptances) is fictional and kept in your browser's localStorage.
A banner at the top says "Demo mode" whenever mocks are on.

### Against the real backend

```bash
# in the repo root
docker compose up -d
docker compose exec api python seed_demo.py

# in frontend/.env.local
NEXT_PUBLIC_USE_MOCKS=false
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
npm run dev                    # restart after changing env vars
```

No code changes are needed. The backend already allows CORS from `http://localhost:3000`
(`CORS_ORIGINS` in its config). To try a seeded student, open **Matches** and use
"Demo: continue as a seeded student" with an ID printed by `seed_demo.py` (for example Lunar Hare on
Thursday).

Mutual acceptance against the real backend needs every member to accept. Accept a match in the app,
then **Sign in** as the other student (add them by ID on the Sign in page): the match shows under
**Matches → Your matches → Invitations for you**. Accept it there and the chat opens for both. The
first profile's screen checks again automatically every 8 s while waiting (or press "Check again").

## Checks

```bash
npm run typecheck              # tsc --noEmit, strict, noUncheckedIndexedAccess
npm test                       # Vitest + Testing Library
LIVE_BACKEND=1 npx vitest run tests/live.backend.test.ts   # optional: contract check against a running backend
npm run build
```

## How it fits together

```
app/                      routes: / · /join · /signin · /matches · /chats · /chats/[matchId] · /safety · /profile
components/ui/            Button, Card, Badge, Input, Textarea, Field, Switch, Dialog, Toast
components/layout/        header, mobile bottom nav, footer, theme toggle, ghost backdrop, demo banner
components/onboarding/    JoinWizard (3 steps, React Hook Form + Zod), ScheduleSummary, ClarificationCard
components/matches/       MatchesDashboard, MyMatchesSection, PipelineLoader, MatchCard, MatchDrawer,
                          PlatformPlan, ResponsePanel, ReportDialog, BlockDialog, DaySelector
components/chat/          ChatList, ChatRoom, ChatComposer
components/account/       SignInView (saved profiles on this device)
components/shared/        StationCombobox, TagInput, LinePill, PiiWarning, CopyButton, RouteError
lib/api/contract.ts       THE contract: Zod schemas + types + GhostApi interface (one-file edit)
lib/api/client.ts         fetch client: timeouts, Zod validation, normalised ApiError
lib/api/mock.ts           same interface, fixtures, 600-1200 ms latency, localStorage state
lib/stations.ts           generated from the backend's station topology (178 stations)
lib/lineColours.ts        approximate line colours (no logos)
lib/pii.ts                postcode / house number / email / phone detection
hooks/useSession.ts       saved profiles (useProfiles) + the signed-in one (useSession), in localStorage
hooks/useMatchResponse.ts accept / decline / check again
hooks/useMyMatches.ts     invitations, waiting and confirmed matches for the signed-in profile
hooks/useChat.ts          messages, polling (5 s while visible, backs off on 429), optimistic send
```

Data flow: page → `useApi()` (mock or HTTP, chosen by `NEXT_PUBLIC_USE_MOCKS`) → Zod-validated
response → component state. Any response that fails validation becomes a friendly "unexpected
reply" error, never a crash.

### Mock-mode scripted cases

| You do | You get |
|---|---|
| Commute text containing "sometime" with no time | A clarification question; answer "around 10pm" to continue |
| Search **Sun** | Empty results with notes and a suggestion to widen times |
| Search any other night | One walk-home pair + one study group, personalised to your line, stations, time and interest |
| Accept | "Waiting for …", then the others accept about 2.5 s later → mutual accept with contact handles |
| Block someone | They disappear from future searches |
| Open a chat after mutual accept | Your buddy says hello; every message gets a reply 2-4 s later |
| Type an address or phone number in chat | The composer blocks it; anything that slips through is shown as `[redacted]` |

### Proposed endpoints (not yet in backend)

`POST /api/commuter/matches/{id}/report`, `POST /api/commuter/block`,
`PATCH /api/commuter/users/{id}` (preferences, `is_active`), `DELETE /api/commuter/users/{id}`.
They're defined in `contract.ts`. In mock mode they're simulated. Against the real backend the
client tries them; on a missing-route 404 it records the action on the device and the UI says so
("saved on this device").

## Sign in and chat

- **Sign in** (`/signin`) lists every profile created on this device with what you entered (university,
  journey, line, nights). Signing out keeps a profile; "Remove" forgets it on this device only;
  Profile → "Delete my data" deletes it.
- **Chat** (`/chats`) opens when everyone in a match accepts. Messages live on the backend
  (`match_messages` table), so two students on different devices, or two profiles on one device,
  can talk. Addresses and phone numbers are blocked in the composer and redacted by the server.
  Report and Block are in the chat header. External contact handles are no longer collected.

## Hackathon simplifications

- **No real auth.** Profiles are saved in localStorage and "signing in" picks one; there's no
  password. Anyone with a profile's `user_id` could act as that student. A real build needs proper
  sign-in, and the chat endpoints would then take identity from the session instead of `user_id`.
- **Chat uses polling** (every 5 s while the tab is visible), not WebSockets.
- **University email verification is mocked** (labelled in the UI). The email is never stored or sent.
- **Editing a parsed schedule** re-submits a corrected description via
  `POST /users/{id}/schedule`, which *adds* a schedule in the current backend rather than replacing it.
- Transit facts and safety notes are **MOCK data**, not verified TfL information.

## 3-minute pitch demo (mock mode)

1. **Landing (20 s).** "Never commute home alone." Scroll to *What we never share*: no real names,
   station-level only, mutual yes before contact.
2. **Join (60 s).** Tap **UCL** (fills the campus station), verify email with `246810`. Step 2:
   tap the King's Cross → Acton Town example chip (fills the home station too). Type `12 Elm Road`
   to show the address warning, then delete it. Step 3: leave well-lit on and add *statistics*.
   Submit → **"Here's what we understood"**: stations, Piccadilly line pill, Tue/Thu, 21:15-21:45.
3. **Matches (40 s).** Pick **Thu**, press *Find my commute buddies* and narrate the three pipeline
   steps. Open the pair's **platform plan**: meeting point, carriage, the last stretch, the copyable
   icebreaker and safety notes.
4. **Mutual accept + chat (40 s).** Accept → "Waiting for <partner>" → "It's a plan. Everyone said
   yes." → **Open chat**. Your buddy says hello; tap the "Running 5 min late" quick reply, then try
   typing a phone number to show it's blocked. Then open **Sign in** to show saved profiles.
5. **Safety (30 s).** Tap **Report** on the other card to show the two-tap path, then open the Safety
   Centre: what's stored, what's never shared, "Text 61016 for non-emergency, 999 in an emergency".
   (Bonus: search **Sun** for the empty state, or type "sometime" for the clarification question.)
