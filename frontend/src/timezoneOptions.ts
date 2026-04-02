/** Curated IANA zones for the compact header control; any valid IANA name is accepted by the API. */
export const PRESET_TIMEZONES: { value: string; label: string }[] = [
  { value: "UTC", label: "UTC" },
  { value: "America/Los_Angeles", label: "Los Angeles" },
  { value: "America/Denver", label: "Denver" },
  { value: "America/Chicago", label: "Chicago" },
  { value: "America/New_York", label: "New York" },
  { value: "America/Toronto", label: "Toronto" },
  { value: "Europe/London", label: "London" },
  { value: "Europe/Paris", label: "Paris" },
  { value: "Asia/Dubai", label: "Dubai" },
  { value: "Asia/Tehran", label: "Tehran" },
  { value: "Australia/Sydney", label: "Sydney" },
];
