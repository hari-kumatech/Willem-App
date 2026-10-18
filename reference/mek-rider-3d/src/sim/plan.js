import { FORK_EXT, PAL_L, EXT_TIME, RET_TIME, LIFT_H } from '../config/dimensions.js';
import { OFFSET, PICK, SPOT_A, SPOT_B } from './layout.js';

// Draaiboek per truck: een lijst stappen die de simulatie één voor één uitvoert.
//  say   statusregel (+ optioneel grote titel)   move  rijden naar x (en eventueel z)
//  ext   lepels uit/in schuiven                   lift  heffen/dalen
//  pick  pallets op de lepels                     drop  pallet neerzetten
//  ride  ritteller +1                             end   klaar
export function buildPlan(lane) {
  const a = [], P = lane.pallets;
  const say = (s, cap) => a.push({ k: 'say', s, cap });
  const move = (x, z = null) => a.push({ k: 'move', x, z });
  const lift = h => a.push({ k: 'lift', h });
  const zc = lane.z, zo = lane.z + (lane.z > 0 ? OFFSET : -OFFSET);

  if (lane.mek) {
    say('Lepels uitschuiven', 'Lepels uit: 1.198 → 1.998 mm in 4 sec');
    a.push({ k: 'ext', to: FORK_EXT, dur: EXT_TIME });
    say('Naar het inkomende dock'); move(PICK);
    say('Twee pallets oppakken', 'Twee pallets in één rit');
    a.push({ k: 'pick', p: [P[0], P[1]] }); lift(LIFT_H); a.push({ k: 'ride' });
    say('Naar losplek A'); move(SPOT_A + 2 * PAL_L);
    say('Pallet afzetten op A', 'Losplek A'); lift(0); a.push({ k: 'drop', p: P[1] });
    say('Lepels inschuiven'); a.push({ k: 'ext', to: 0, dur: RET_TIME });
    lift(LIFT_H); say('Door naar losplek B'); move(SPOT_B + PAL_L);
    say('Pallet afzetten op B', 'Losplek B: klaar in één rit'); lift(0); a.push({ k: 'drop', p: P[0] });
    move(SPOT_B + PAL_L + 1.2);
  } else {
    say('Naar het inkomende dock'); move(PICK);
    say('Eerste pallet oppakken'); a.push({ k: 'pick', p: [P[0]] }); lift(LIFT_H); a.push({ k: 'ride' });
    say('Naar losplek A'); move(SPOT_A + PAL_L);
    say('Pallet afzetten op A'); lift(0); a.push({ k: 'drop', p: P[0] }); move(SPOT_A + PAL_L + 1.35);
    say('Leeg terug voor de tweede pallet');
    move(SPOT_A + PAL_L + 3.6, zo); move(-6, zo); move(-9.2, zc); move(PICK - PAL_L);
    say('Tweede pallet oppakken'); a.push({ k: 'pick', p: [P[1]] }); lift(LIFT_H); a.push({ k: 'ride' });
    say('Naar losplek B, om pallet A heen');
    move(1.2); move(4.5, zo); move(8.3); move(11.2, zc); move(SPOT_B + PAL_L);
    say('Pallet afzetten op B'); lift(0); a.push({ k: 'drop', p: P[1] }); move(SPOT_B + PAL_L + 1.2);
  }
  a.push({ k: 'end' });
  return a;
}
