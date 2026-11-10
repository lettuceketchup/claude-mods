# Templates

## Cost scenarios (step 2)
| Scenario | Transport | Stay | Food and local | Per person | Group total |
|---|---|---|---|---|---|
One line under the table: what the estimates assume (class, nights, room sharing) and that they are rough.

## Go/no-go (step 3)
| Check | Verdict | Why | Source (date checked) |
|---|---|---|---|
| Tickets / Cost / Open and safe / Time / Season / Anything else | pass, risky or fail | | |
End with one line: **Go**, **Go with care** (what to watch), or **No-go** (and offer alternatives).

## Route options (step 5)
| Option | Door-to-door time | Cost per person | Booking difficulty | Fatigue / risk | Best for |
|---|---|---|---|---|---|

## Plan page data (step 6)
Copy `assets/plan-page.html` with a file copy or shell command; never retype it (it holds about 100 KB of built-in map data). Then replace the JSON inside `<script id="trip" type="application/json">` and set the first-line `<title>` to the trip name (it names the published page). Leave the rest of the file alone. Strings must not contain `</script`. Omit any section you have nothing for; the page hides empty sections.

```json
{
  "title": "Vaishno Devi",
  "subtitle": "Shivpuri → Katra · 12–16 Dec 2026 · 4 people",
  "updated": "2026-11-10",
  "verdict": { "status": "go | care | nogo", "text": "One sentence: the decision and the main risk." },
  "facts": [ { "label": "Cost per person", "value": "₹9,500" } ],
  "checks": [ { "name": "Tickets", "status": "pass | risky | fail", "note": "", "url": "" } ],
  "bookings": [ { "date": "2026-10-13", "what": "Return train 12920", "where": "IRCTC", "url": "", "status": "open now | to book | waitlisted | confirmed" } ],
  "days": [ { "label": "Day 1 · Sat 12 Dec", "title": "Travel to Gwalior, overnight train",
              "items": [ { "time": "06:00", "text": "Taxi to Gwalior (115 km, about 2.5 h)", "links": [ { "label": "Directions", "url": "" } ] } ] } ],
  "legs": [ { "from": "Gwalior", "to": "Katra",
              "options": [ { "mode": "Train", "name": "12919 Malwa Express", "train": "12919", "dep": "Sat 13:10", "arr": "Sun 14:30",
                             "duration": "25 h", "cost": "₹1,100 (3A)", "note": "GNWL 12 when checked", "recommended": true, "links": [] } ] } ],
  "maps": [ { "title": "Getting there",
              "points": [ { "name": "Gwalior Jn", "q": "Gwalior Junction railway station", "lat": 26.215, "lon": 78.182, "kind": "station", "note": "" } ],
              "routes": [ { "name": "Direct train from Gwalior", "note": "about 25 h door to door · ₹1,500 per person", "recommended": true,
                            "legs": [ { "from": "Shivpuri", "to": "Gwalior Jn", "by": "road", "name": "Taxi", "time": "2.5 h", "km": 115, "note": "" } ] } ] } ],
  "budget": { "rows": [ { "item": "Transport", "pp": 3000, "total": 12000 } ], "buffer": 15 },
  "checklist": [ "Photo ID for every traveller" ],
  "whatsapp": "Same text as the WhatsApp brief",
  "links": [ { "label": "Shrine board (official)", "url": "" } ],
  "sources": [ { "label": "", "url": "", "checked": "2026-11-10" } ]
}
```

Page rules:
- **Maps**: the page draws them to scale on a built-in map of India (state borders, major cities), with zoom, numbered pins and a Google Maps link per place. Nothing to fetch.
  - One map per scale: "Getting there" across India, and "Around <place>" for the town and the walk or trek. A place a few km from another belongs on the local map, not the route map.
  - At most 8 points per map: stations, airports, stay, the main sights, and help (hospital, police, help desk). `kind` is one of `station`, `stay`, `sight`, `help`, `stop`. `q` is the Google Maps search text, which beats coordinates for accuracy. Take coordinates from a map search; they place the pins.
  - `routes`: one per option you compared (up to 4), each a chain of `legs` whose `from` and `to` are point names. Each route gets its own colour and button; mark the one you recommend. `by` is `train`, `road`, `bus`, `flight`, `trek`, `walk` or `boat` and sets the line style. `name` (train number and name, Taxi, Bus), `time` and `km` make the leg's label. Use real figures you found, rounded.
  - A local map usually has a single route (the day's walk or trek). A map with no `routes` shows pins only.
- **Train options**: set `train` to the number, and the page adds running-status and schedule links.
- **Links**: give every stay, sight and booking its official link where one exists. The page adds Google Maps links for each map point, so family can keep researching from any line.

## WhatsApp brief
Plain text, under about 15 lines, WhatsApp formatting (`*bold*`, `_italic_`), no tables. Order:
```
*Vaishno Devi trip · 12–16 Dec*
Who: 4 (Mummy, Papa, …)
Go: Sat 12 Dec, taxi to Gwalior 6 AM → 12919 Malwa Exp 13:10, coach B2 (3A)
Back: Wed 16 Dec, 12920 from Katra 13:45 → Gwalior Thu 15:00
Stay: <hotel>, Katra, 2 nights
Cost: about ₹9,500 per person (₹38,000 total)
Bring: photo ID (original), warm jacket, walking shoes, medicines
To do: <who> books the return on 17 Oct, 8 AM
Full plan: <page link>
```
Refer to travellers the way the user does (relations or first names). If the user hasn't named them, write `<name>`; never invent names. Mark anything unconfirmed as _(not booked yet)_.

## Itinerary rules
- Each day: theme and place, then times, travel (mode, number, departure and arrival, buffer), stay and meals, and what to book, charge or pack tonight.
- Booking calendar: every booking with its opening date worked back from departure, the platform and the status. Return leg first.
- Budget: transport, stay, food, local transport and entry, offerings and shopping, emergency; per person and total; a 10–20% buffer.
- Checklist: photo ID for every traveller (rail checks it), offline copies of tickets, medicines and a prescription copy, cash, power bank, permits or registrations, and clothes for the season and the walk.
- Pre-trip timeline: 60 days, train opening; 30 days, stay, permits and registration; 7 days, re-check weather, closures and running status; 1 day, confirm everything and pack.
