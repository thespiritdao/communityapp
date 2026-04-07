# Flow 08 — Events

## Who This Is For
Community members attending events, and event managers creating/running them.

---

## Attendee Journey

```
USER TAPS "Events" or navigates from Home
                │
                ▼
┌─────────────────────────────────────────────────────────────────┐
│                        EVENTS                                   │
│                                                                 │
│  [ Upcoming ]  [ My Events ]  [ Past ]         [ 📅 Calendar ]  │
│                                                                 │
│  📊 Stats:  3 upcoming · 127 total participants · 15 completed  │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  🌿 Spring Equinox Gathering                             │  │
│  │  📅 Mar 20, 2026  📍 Portland, OR                       │  │
│  │  👥 24 / 50 spots remaining                             │  │
│  │  [ View Details ]                                        │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  🎨 Community Art Workshop                               │  │
│  │  📅 Mar 25, 2026  📍 Virtual                            │  │
│  │  👥 8 / 20 spots remaining                              │  │
│  │  [ View Details ]                                        │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Event Detail & Registration

```
USER TAPS [ View Details ]
                │
                ▼
┌─────────────────────────────────────────────────────────────────┐
│  🌿 Spring Equinox Gathering             [ ← Back ]             │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  📅 March 20, 2026  ·  2:00 PM – 6:00 PM                        │
│  📍 Portland, OR  ·  [Map link]                                 │
│  👥 24 of 50 spots filled                                       │
│                                                                 │
│  About this event:                                              │
│  "Join us for our annual spring gathering — connecting          │
│   with nature, community, and Temporal Naturalism..."           │
│                                                                 │
│  Hosted by: @alex (Nature Pod)                                  │
│                                                                 │
│  Who's coming:                                                  │
│  👤 @sam  👤 @jordan  👤 @riley  + 21 others                    │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│  [ ✅ Register for This Event ]                                 │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                   USER TAPS [ Register ]
                            │
                            ▼
              ┌─────────────────────────────┐
              │  ✅ You're registered!       │
              │  Added to "My Events"        │
              │  You'll get a reminder soon  │
              └─────────────────────────────┘
```

---

## Day-of Check-In

```
ON EVENT DAY — User navigates to event page
                │
                ▼
┌─────────────────────────────────────────────────────────────────┐
│  🌿 Spring Equinox Gathering                                    │
│                                                                 │
│  🟢 Event is LIVE today!                                        │
│                                                                 │
│  [ ✅ Check In Now ]                                            │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
                    Identity verified
                    Attendance recorded
                            │
                            ▼
              ┌─────────────────────────────┐
              │  ✅ Checked in!              │
              │  Your attendance is logged   │
              └─────────────────────────────┘
```

---

## Calendar View

```
USER TAPS [ 📅 Calendar ]
                │
                ▼
┌─────────────────────────────────────────────────────────────────┐
│                      MARCH 2026                                 │
│  ─────────────────────────────────────────────────────────────  │
│  Mon  Tue  Wed  Thu  Fri  Sat  Sun                              │
│                                   1                             │
│   2    3    4    5    6    7    8                                │
│   9   10   11   12   13   14   15                               │
│  16   17   18   19  [20]  21   22  ← 🌿 Spring Gathering        │
│  23   24  [25]  26   27   28   29  ← 🎨 Art Workshop            │
│  30   31                                                        │
│  ─────────────────────────────────────────────────────────────  │
│  TAP any highlighted date → see event details                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Event Manager Journey

```
USER has Event Manager permission → navigates to /events/manage
                │
                ▼
┌─────────────────────────────────────────────────────────────────┐
│  MY EVENTS                                 [ + Create Event ]   │
│                                                                 │
│  📊 Total: 5 events  ·  127 attendees  ·  3 upcoming            │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  🌿 Spring Equinox Gathering                             │  │
│  │  Mar 20 · 24 registered                                  │  │
│  │  [ Manage ]  [ Check-In Mode ]  [ Edit ]                 │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                │
        USER TAPS [ + Create Event ]
                │
                ▼
┌─────────────────────────────────────────────────────────────────┐
│  CREATE EVENT                                                   │
│                                                                 │
│  Title:          [ _________________________ ]                  │
│  Date & Time:    [ 📅 Pick date ] [ ⏰ Pick time ]              │
│  Location:       [ _________________________ ]                  │
│  Description:    [ _________________________ ]                  │
│  Max Attendees:  [ ___ ]                                        │
│  Hosted by pod:  [ Select pod ▼ ]                              │
│                                                                 │
│  [ Create Event ]  (on-chain transaction, gasless)              │
└─────────────────────────────────────────────────────────────────┘
                │
                ▼
        Event goes LIVE — visible to all members
```

---

## Check-In Mode (Day of Event)

```
EVENT MANAGER TAPS [ Check-In Mode ]
                │
                ▼
┌─────────────────────────────────────────────────────────────────┐
│  CHECK-IN: Spring Equinox                  [ Exit Check-In ]    │
│                                                                 │
│  Attendees: 24 registered  ·  12 checked in  ·  12 remaining    │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  👤 @sam        ✅ Checked in  11:02 AM                         │
│  👤 @jordan     ✅ Checked in  11:14 AM                         │
│  👤 @riley      ⏳ Not yet                                      │
│  👤 @alex       ⏳ Not yet                                      │
│                                                                 │
│  [ 🔍 Search attendee ]    [ Mark attendance manually ]         │
└─────────────────────────────────────────────────────────────────┘
```

---

## Demo Highlights

- **Full lifecycle** — create → register → check-in → history
- **Calendar view** — visual overview of all upcoming community activity
- **On-chain events** — event creation is transparent and permanent
- **Real-time check-in** — event managers can track attendance live
- **Tied to pods** — events are associated with pod communities
