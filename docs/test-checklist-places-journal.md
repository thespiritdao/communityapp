# Test checklist: Places, Journal mode, Location opt-in

*Last updated: 2026-09-10. Covers commit `0617b431`. Migrations `20260910000001..3` are applied.*

Three actors are needed. Use two browsers (or one normal + one private
window) so sessions do not collide:

| Actor | Who | Needs |
|---|---|---|
| **L** Leader | you, on a pod you lead (TN or a test pod) | Exec/leader session |
| **M** Member | a second member of the same pod, no `placesManage` | member session |
| **O** Outsider | a member of a *different* pod only | any session |

Record results as pass / fail with the step number. Expected outcomes are the
only acceptance criteria; anything else is a bug.

---

## A. Module and permission wiring

| # | Step (actor) | Expected |
|---|---|---|
| A1 | L: pod → Manage → Modules → Add-Ons | "Places" card present, off, description mentions `placesManage` |
| A2 | L: toggle Places on | Toggle persists after reload |
| A3 | L: Manage → Members & Roles → open the leader role | A "Places" group with **Places Manage** checked |
| A4 | L: open the member role | Places Manage **unchecked** |
| A5 | L: grant Places Manage to the member role, save | Persists after reload |
| A6 | L: toggle Places **off** | Places group disappears from role editor; both roles have `placesManage=false` (verify with SQL below) |
| A7 | L: toggle Places on again | Leader role regains Places Manage; member role stays unchecked (A5 grant is intentionally reset by the sync) |

SQL for A6/A7:
```sql
select role_name, permissions->>'placesManage' as places_manage
from pod_role_permissions where pod_id = '<POD_ID>';
select places_enabled, places_config from pod_modules where pod_id = '<POD_ID>';
```

## B. Pod page: the Places section

| # | Step | Expected |
|---|---|---|
| B1 | L: open the pod page | "Places" section appears between the surveys banner and the meeting section; count badge 0; empty-state text mentions adding the first pin; **Add place** button visible |
| B2 | M: open the same pod page | Section visible; **no** Add place, no pencil next to heading |
| B3 | O: open the pod page | **No** Places section at all |
| B4 | L: toggle module off, reload | Section gone for everyone |
| B5 | L: tap the pencil next to "Places", enter `Territory`, save | Heading reads "Territory" for L and M; 21+ characters is rejected |

## C. Adding and editing pins (L)

| # | Step | Expected |
|---|---|---|
| C1 | Add place → name only → Add | Pin saved; appears under "Not on the map yet"; Pulse (/explorer, Places tab) shows "New place on the map: …" |
| C2 | Add place → name, kind Asset, search an address, pick a result → Add | Pin on the map, coloured green, map fits to it; detail card shows address |
| C3 | Add place → tap the mini map to drop a pin → Add | Coordinates filled from the tap; pin lands where tapped |
| C4 | Add place → status **Proposed**, kind Vision | Pin drawn with dashed outline, orange |
| C5 | Add place → precision **Approximate** | Shaded circle around the pin |
| C6 | Add a JPEG cover (≤5 MB) | Cover shows in the detail card and list card; image URL is a `…/object/sign/place-images/…` link |
| C7 | Add a 6 MB image or a GIF | Editor shows the size / type error; pin still saves without it |
| C8 | Edit C2: connect to a journal entry, a member with role "steward", and C3 with relationship "supplies" | Detail card lists three connections; a dashed line joins C2 and C3 on the map |
| C9 | Edit C2: change kind to Partner | Pin recolours; Pulse shows "Place updated" |
| C10 | Remove C1 | Confirm dialog; pin gone; Pulse shows "Place removed" |
| C11 | Enter a title of 121+ chars or lat 95 | Server rejects with a clear message |

## D. Viewing (M)

| # | Step | Expected |
|---|---|---|
| D1 | Map view: tap a pin | Detail card opens; no Edit/Remove buttons |
| D2 | Tap the "supplies" link in C2's card | Selection moves to C3 |
| D3 | List view | Cards with kind badge; proposed shows a "Proposed" badge |
| D4 | Kind filter chips + status select | Filters apply to both views; "Retired" shows only retired pins |
| D5 | Set a pin to Retired (as L), reload as M | Hidden by default; visible under status "Retired" or "Everything" |
| D6 | M with Places Manage granted (A5) | Add / Edit / Remove appear for M; M can add a pin |
| D7 | Realtime: L adds a pin while M has the page open | M's map updates within ~1 s without reload |

## E. Location opt-in (Identity)

| # | Step | Expected |
|---|---|---|
| E1 | M: Identity → Location | Section present, checkbox off, nothing saved |
| E2 | M: tick share, search "Asheville NC", pick, keep Approximate, Save | Status line shows label + "approximate"; DB row has lat/lng with **2 decimals** |
| E3 | L: open the pod page map | M appears as a round avatar/initials marker with a 1 km shaded circle |
| E4 | O: open O's own pod page | M **not** shown there (no shared pod) |
| E5 | M: untick share, Save | M disappears from L's map; row remains with `share_with_pods=false` |
| E6 | M: choose Exact, Save | Coordinates stored with full precision; circle gone on the map |
| E7 | M: Remove | Row deleted; section back to E1 state |

SQL for E2/E6:
```sql
select wallet, lat, lng, precision, share_with_pods, address from member_locations;
```

## F. Journal mode (forum)

| # | Step | Expected |
|---|---|---|
| F1 | L: Manage → Forum → create category "Envisioning Journal", Presentation **Journal** | Category listed with a "Journal" badge; `display_mode='journal'` in SQL |
| F2 | L: create two entries, one with an image attached at thread level | Category page: "Journal" badge in heading, no sort controls, entries newest first under a month header, cover shows on the image entry, ~220-char excerpt |
| F3 | M: open an entry, reply | Reply composer is the **formatting** editor (toolbar), not the plain textarea |
| F4 | Open a Discussion category and reply | Plain textarea with @mention autocomplete (unchanged) |
| F5 | L: switch the journal category back to Discussion | Classic thread list returns |
| F6 | L: Manage → Modules → Custom Appearance → rename Forum button to "Journal"; M wears the face | Home button and the `/forum` page heading both read "Journal" for M; unchanged for a member not wearing the face |

## G. Security (do these; they are the point)

| # | Step | Expected |
|---|---|---|
| G1 | `curl /api/pods/<POD>/places` with no header | 401 |
| G2 | O's session token on `GET /api/pods/<L's POD>/places` | 403 "Members only" (unless O wears the Exec Leader hat) |
| G3 | M's token (no placesManage) on `POST /api/pods/<POD>/places` | 403 |
| G4 | M's token on `PATCH …/places` `{ "label": "x" }` | 403 |
| G5 | Open a cover image URL in a private window after 1 h | Signed URL expired (403/400 from storage) |
| G6 | Direct storage URL `…/object/public/place-images/…` | 400/404 — bucket is private |
| G7 | `select * from pod_places` via the anon client from O's session (browser console `supabase.from('pod_places').select('*')`) | Empty result (RLS) |
| G8 | Same for `member_locations` from O | Only O's own row, if any |
| G9 | `GET /api/geocode?q=x` with no header | 401 |
| G10 | `PUT /api/account/location` with a body `wallet` field of someone else | Row written for the **session** wallet only |

## H. Regression spot-checks

| # | Step | Expected |
|---|---|---|
| H1 | Pod page for a pod with Places off | Layout identical to before this release |
| H2 | Surveys, Password Vault, Custom Appearance toggles | Still sync their permissions as before |
| H3 | Role editor Add-Ons group | Only enabled modules show groups |
| H4 | /explorer Places tab | Lists only place events; other tabs unchanged |
| H5 | Mobile viewport (375 px) | Map is usable; editor opens as a bottom sheet; tap-to-pin works |

---

## Cleanup after testing

```sql
delete from pod_places where pod_id = '<TEST_POD_ID>';         -- cascades links
delete from member_locations where wallet = '<TEST_WALLET>';
update pod_modules set places_config = '{}' where pod_id = '<TEST_POD_ID>';
```
Storage: remove test objects under `place-images/<TEST_POD_ID>/` in the dashboard.
