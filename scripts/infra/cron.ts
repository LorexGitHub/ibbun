const DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

// Unix counts days 0-6 (7 is a second Sunday). EventBridge's names mean the same in either.
const dayName = (token: string): string => (/^\d+$/.test(token) ? DAYS[Number(token) % 7]! : token);

const dayOfWeek = (field: string): string =>
  field
    .split(",")
    .map((part) => part.split("-").map(dayName).join("-"))
    .join(",");

/**
 * A job's five-field Unix cron (UTC) as an EventBridge Scheduler expression. Scheduler wants a
 * year field, and exactly one of day-of-month and day-of-week as `?`.
 */
export const eventBridgeCron = (cron: string): string => {
  const fields = cron.trim().split(/\s+/);
  if (fields.length !== 5) throw new Error(`not a five-field cron: ${cron}`);
  const [minute, hour, dayOfMonth, month, weekday] = fields as [string, string, string, string, string];
  if (dayOfMonth !== "*" && weekday !== "*") throw new Error(`Scheduler cannot take both a day of month and a day of week: ${cron}`);
  const days = weekday === "*" ? [dayOfMonth, "?"] : ["?", dayOfWeek(weekday)];
  return `cron(${[minute, hour, days[0], month, days[1], "*"].join(" ")})`;
};
