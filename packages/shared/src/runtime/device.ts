export const DEVICE_CLASSES = ["mobile", "tablet", "desktop"] as const;
export type DeviceClass = (typeof DEVICE_CLASSES)[number];

export const DEVICE_BREAKPOINTS = { mobileMax: 767, tabletMax: 1023 } as const;

export function deviceClassFor(viewportWidth: number): DeviceClass {
  if (viewportWidth <= DEVICE_BREAKPOINTS.mobileMax) return "mobile";
  if (viewportWidth <= DEVICE_BREAKPOINTS.tabletMax) return "tablet";
  return "desktop";
}
