export type PickupLocation = { id?: string; name: string; active?: boolean };

export const defaultPickupLocations: PickupLocation[] = [
  { name: "E-Block", active: true },
  { name: "MSB Site Office", active: true },
];
