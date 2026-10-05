// Maten en prestaties uit de technische beschrijving MEK-Rider MRTF01.
// Alle lengtes in meter, tijden in seconden, snelheden in m/s.

// Lepels
export const FORK_IN = 1.198;   // lepellengte ingeschoven (la)
export const FORK_EXT = 0.800;  // uitschuiflengte (REACH), uitgeschoven 1.998 (lb)
export const FORK_SPAN = 0.547; // buitenmaat lepels (b5)
export const FORK_W = 0.177;    // lepelbreedte (e)
export const FORK_T = 0.057;    // lepeldikte (S)
export const FORK_LOW = 0.087;  // laagste lepelhoogte (h13)

// Chassis
export const CHASSIS = 0.830;   // lengte tot voorzijde lepels (l2)
export const WIDTH = 0.785;     // totale breedte (b1)

// Euro-pallet, in lengterichting
export const PAL_L = 1.2;
export const PAL_W = 0.8;

// Bewegingen
export const EXT_TIME = 4.0;    // uitschuiven (ca. 4 s)
export const RET_TIME = 2.0;    // inschuiven (400 mm/s)
export const LIFT_H = 0.06;     // getoonde hefhoogte bij rijden
export const LIFT_TIME = 1.2;
export const V_EMPTY = 12 / 3.6; // 12 km/u zonder last
export const V_LOAD = 10 / 3.6;  // 10 km/u met last
export const ACC = 1.1;          // m/s², afgeleid van 5,5 s over 10 m

// Huisstijl
export const NAVY = 0x0e2038;
export const RED = 0xd6483d;
