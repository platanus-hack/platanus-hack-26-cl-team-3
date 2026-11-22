import rows from "./parts.json";

// The original unscoped records belong to the Outback manual used by chat.
export const outbackParts = rows.filter(row => !row.vehicles || row.vehicles.includes("outback"));
