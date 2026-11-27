# Pathfinder: 3-minute demo script

This script works without Azure keys.

## Before you present (10 minutes ahead)

1. In Terminal:
   ```bash
   cd ~/Downloads/pf-repo && node sync.mjs
   ```
   ```bash
   lsof -ti :4173 | xargs kill; DEMO_BROWSER_VOICE=true STAFF_CODE=demo node serve.mjs
   ```
   The log should say *"DEMO ONLY: browser speech recognition is on"* and give the staff inbox address.
2. In Chrome, open two tabs:
   - **Tab 1:** http://localhost:4173. Press Cmd+Shift+R and click **Start over**.
   - **Tab 2:** http://localhost:4173/staff?code=demo
3. Do one practice voice note so Chrome has already asked for microphone permission.
4. Have the slide and the GitHub repo open in other tabs, in case anything fails.

**For the joint four-prototype demo** (PathFinder as Phase 2): start the server with the SkillLens address too, then open **http://localhost:4173/?journey=demo** instead of Tab 1.
```bash
DEMO_BROWSER_VOICE=true STAFF_CODE=demo NEXT_PROTOTYPE_URL=<SkillLens address> node serve.mjs
```
Show the **"From Ziqi"** card (*A verified opportunity and the user's goal*), make the plan, save it, tap **Yes, activate it** for the Skills Backpack (the same question FunDoo asks), then show the **"Handing on to SkillLens"** card (*Plan step: complete a P2E course*) and click **Next: continue in SkillLens →**.

## Script

**0:00–0:20 · What it is**
> "Pathfinder turns a young Nigerian's goal into three steps: start, learn, apply, using real Yoma opportunities. This sprint we connected live data, added AI, and focused on young people in informal work with low data and basic phones."

*Point at the chips above the phone:*
> "Listings are live from the Yoma API, about five thousand, synced every day. The AI chip says off: the Azure connection is built and tested, and it switches on when we get our keys. Everything falls back to rules and says so on screen."

**0:20–1:20 · Informal work, by voice** *(Test as: Tunde)*
1. Tap **English** → **21** → **Yes, use my profile**.
2. At "Tell me about work you already do", tap **Record a voice note**.
   > "Most youth work in Nigeria is informal, so Pathfinder starts with what you already do."
3. Say: *"I sell provisions in the market and I fix phones for people in my area."* Tap the red mic to stop.
4. Point at **"I heard: …"** and the skill chips.
   > "It plays back what it heard, then turns it into skills: trading, serving customers, phone repair. For the demo, voice uses Chrome's speech recognition. In the pilot it uses Azure, and the app labels which one is running."
5. Tap **Yes, that's right**.

**1:20–2:00 · A real plan**
1. Tap **Get a job** → **Customer service & sales** → **Lagos** → **3–5 hours** → **Some** → **Bigger: 5 steps**.
   > "They choose how big the plan is: 3, 5 or 7 steps."
2. Point at the plan card:
   > "The Apply steps list several real Jobberman jobs in Lagos, not just one, because nobody gets every job they apply for. Step 1 is a real Passport to Earning course on Yoma. Anything still sample says '(sample)'. Every step explains why it was picked, and 'Show more openings' gives even more."
3. Point at **Behind the scenes → Live listings check**:
   > "It removes what this person can't act on: wrong state, closed deadlines, and listings that ask for money. Never pay to apply."

**2:00–2:35 · Safety reaches a person**
1. Type **I'm not safe** and press Enter.
   > "Words like this skip the bot: the 112 emergency number first, then a case number to quote."
2. Switch to **Tab 2 (staff inbox)** and reload.
   > "The case appears for facilitators, urgent cases first. We store no names, numbers or message text, just state, age group, language and the case code."

**2:35–3:00 · Close**
> "We tested it on all 5,171 real Yoma listings. That found and fixed problems the test data missed: jobs in Lagos treated as remote, false scam flags, and adult jobs shown to minors. There are 77 automated tests and 17 browser scenarios, and it runs from GitHub with one command. Still needed for the pilot: Azure keys, a native-speaker review of Hausa and Yoruba, vetted helplines, and Yoma partner access for real profiles. That's all in our pilot checklist."

## If something goes wrong

| Problem | Do this |
|---|---|
| Voice doesn't pick up | Say "let me type it instead", tap **Type it** and type the same sentence. It shows the same skills |
| Listings say "saved copy" or "sample" | Say "Yoma isn't reachable on this Wi-Fi, so it uses the last saved copy. That's the offline mode." |
| Anything else breaks | Show the slide and screenshots. The repo and test results back it up |

**Optional extras if you have time:**
- Switch **Phone → Basic phone** to show numbered SMS replies.
- Restart and pick **Hausa** to show the language switch.
