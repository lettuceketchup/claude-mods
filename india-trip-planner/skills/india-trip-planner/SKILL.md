---
name: india-trip-planner
description: Use when the user wants to plan, cost, compare or sanity-check a trip within India, or asks whether a destination is feasible for certain dates. Covers train-first journeys, IRCTC booking dates, Tatkal and waitlists, finding the right railhead from a small town, permits (Inner Line Permit, Ladakh, Sikkim), seasons and closures, pilgrimages (Vaishno Devi, Char Dham, Tirupati, Sabarimala, Ayodhya and similar), family or group itineraries, and sharing the plan with family, even if they never say "itinerary".
---

# India trip planner

Generic planners assume flights, hotels and a credit card. In India the real constraints are train seats that open 60 days out and sell out, last-mile transport from small towns, permits, seasonal closures and, for pilgrimages, registration and darshan logistics. Settle those first, then fill in comfort and sightseeing.

## Before starting
- **Home base:** use the origin town and its practical railheads from memory or the user's profile if known; otherwise ask, and offer to remember them.
- **Earlier research:** in Claude Code, look for `trips/*.md` in the working folder. Reuse the notes, but re-verify anything dated or volatile.

## Workflow

Ask before moving from one step to the next. The user decides whether the trip is worth more research.

1. **Intake.** Ask once, as a short numbered list, skipping anything already known: origin; travel window and flexibility; days available; group size, ages, mobility and any health issue that matters for altitude, cold, heat or a trek; budget per person or total, and whether it includes train fares; lowest train class they accept; priority (cheapest, fastest, most comfortable); for pilgrimages, darshan mode (walk, pony or palki, battery car, helicopter) and food rules.
2. **Cost scenarios.** A quick first round, before deep research: 2–4 scenarios (for example budget sleeper, comfortable 3A/2A, fastest flight plus road), each with per-person and group totals for transport, stay, food and local costs. Mark the numbers as estimates and say what they are based on.
3. **Go/no-go for the travel window.** Check each against the user's dates, not today. Verdict per row: pass, risky or fail, each with a source. Template: `references/templates.md`.
   - Tickets: practical trains both ways from the home railhead and nearby hubs. A long waitlist on the return is risky. If booking is already open, say so: it is "book now", not a future date. If the only good train runs a day outside the user's dates, offer the shifted dates instead of failing the row. If live availability cannot be seen (IRCTC needs a login), say so and give the exact train, class and date to check in the IRCTC app.
   - Cost: against the user's budget.
   - Open and safe: announced closures, registration rules, advisories or unrest for those dates. If departure is within about two weeks, also check current news.
   - Time: door-to-door plus the activity plus buffer, against days available.
   - Season: weather, crowds and festivals in that window. Read the region's row in `references/regions.md`, then confirm live.
   - Anything else that makes it a bad idea for this group, such as a trek too hard for an elder.
4. **Alternatives, if any row fails** (or the user asks; for risky rows, just offer). Suggest 3–5 destinations of the same kind that suit the same dates, origin and group. Ask which ones to check. Run a light pass (tickets, rough cost, season) only on the ones the user picks.
5. **Route options.** Find the real railhead: compare the home station with the 2–3 nearest junctions within about 150 km. Then compare 2–4 whole-journey options (direct train, train to a hub and onward, flight plus road, road only if short) in one table: door-to-door time, cost per person, booking difficulty, fatigue or risk, best for. Recommend one and say why.
6. **Full plan, after the user picks.** Produce all three:
   - **Plan page:** copy `assets/plan-page.html` and replace only the JSON inside `<script id="trip">`. The schema is in `references/templates.md`. Do not restyle the template. Publish it as an artifact. In Claude Code, also save a standalone copy as `trips/<yyyy-mm>-<place>.html`, starting with `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` so it opens in any browser.
   - **Family don't use Claude.** Tell the user the artifact is private until they turn on its public link in the page's Share menu. Anyone with that link can read it, so use first names or relations, not full names, phone numbers or ID details.
   - **WhatsApp brief:** in chat, ready to paste (format in `references/templates.md`).
   - **Trip notes:** in Claude Code, save `trips/<yyyy-mm>-<place>.md` with the dated facts and sources found, so the next session starts from them.
7. If a calendar tool is connected, offer to add the booking-opening dates and journey legs.

## Verify live facts
Train timings, days of run, fares, availability, permit and registration rules, helicopter fares, closures and shrine rules change often. Search, and cite the source with the date checked. Treat aggregator availability as indicative and IRCTC as authoritative. If a fact cannot be verified, say so; never fill the gap from memory. The reference files are starting points, not facts to quote.

## Principles
- Trains run late, badly so in North Indian fog from December to January. Leave several hours between a train arrival and anything fixed (a flight, a darshan slot, an onward train).
- Group activities by place, alternate hard and easy days, and never put a hard trek straight after an overnight journey with elders or children.
- Every plan has a plan B for the train leg: an alternate train, station, or a bus or flight.
- Budget in categories with a 10–20% buffer.
- Keep replies scannable on a phone.

## Reference files
- `references/rail-booking.md`: any trip with trains (booking window, Tatkal, waitlist, sources, link formats).
- `references/regions.md`: step 3 and step 4. Read only the destination's region row plus the national notes.
- `references/templates.md`: tables, the plan page's JSON schema and the WhatsApp brief.
