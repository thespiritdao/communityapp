/**
 * Run: node scripts/test-batch-events.mjs
 * Dev server must be running on localhost:3000
 */

const events = [
  {
    title: "Test Event",
    description: "Test description",
    event_date: "2026-04-15T18:00:00Z",
    event_end_date: "2026-04-15T20:00:00Z",
    location: "Online",
    max_attendees: 50,
    price_amount: "0",
    price_self_amount: "0",
    blockchain_event_id: "event-test-001",
    manager_address: "0xcdf3cd4777286a5611b17869a509e8ecf1cc6f48", // replace this
  }
];

const res = await fetch("http://localhost:3000/api/events/batch-create-gasless", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ events }),
});

const data = await res.json();
console.log("Status:", res.status);
console.log(JSON.stringify(data, null, 2));
