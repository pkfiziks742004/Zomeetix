import supabase from "./supabase.js";

const DEFAULT_POLICY_ROW = {
  singleton_key: "global",
  allow_guest_join: true,
  enforce_waiting_room: false,
  max_meeting_duration_minutes: 120,
  require_strong_meeting_password: true,
};

const selectPolicyColumns =
  "singleton_key,allow_guest_join,enforce_waiting_room,max_meeting_duration_minutes,require_strong_meeting_password,recording_retention_days,updated_by_user_id,updated_by_email,created_at,updated_at";

const ensureAdminPolicy = async () => {
  const { rows } = await supabase.select("admin_policies", {
    select: selectPolicyColumns,
    filters: [{ column: "singleton_key", operator: "eq", value: "global" }],
    limit: 1,
  });

  if (rows[0]) {
    return rows[0];
  }

  const inserted = await supabase.upsert("admin_policies", DEFAULT_POLICY_ROW, {
    onConflict: "singleton_key",
  });
  return inserted[0] || { ...DEFAULT_POLICY_ROW };
};

export { ensureAdminPolicy, DEFAULT_POLICY_ROW, selectPolicyColumns };

