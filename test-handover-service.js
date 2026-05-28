const assert = require("assert");
const {
  addEffectiveRole,
  canActOnTicketByEffectiveRole,
} = require("./services/handoverService");

function run() {
  const plainTicket = {
    id: "t1",
    assigned_to_id: "u1",
    assigned_to_role: "attendee",
  };
  const enriched = addEffectiveRole(plainTicket);
  assert.strictEqual(enriched.effective_role, "attendee");
  assert.strictEqual(enriched.handover.active, false);

  const handoverTicket = {
    id: "t2",
    assigned_to_id: "u2",
    assigned_to_role: "agent",
    handover_id: "h1",
    handover_effective_role: "reviewer",
    handover_from_user_id: "u1",
  };
  const handoverEnriched = addEffectiveRole(handoverTicket);
  assert.strictEqual(handoverEnriched.effective_role, "reviewer");
  assert.strictEqual(handoverEnriched.handover.active, true);
  assert.strictEqual(
    canActOnTicketByEffectiveRole(["reviewer"], handoverTicket, "u2"),
    true
  );
  assert.strictEqual(
    canActOnTicketByEffectiveRole(["reviewer"], handoverTicket, "u9"),
    false
  );

  console.log("handover service tests passed");
}

if (require.main === module) {
  run();
}

module.exports = { run };
