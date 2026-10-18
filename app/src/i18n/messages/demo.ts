// Messages for the Demo module: crossdock 2D, 3D product view and 3D crossdock race.
// Rich text in impact lines: **bold** segments are rendered as <b>.
import { defineMessages } from '../core';

export const demo = defineMessages({
  nl: {
    // Page
    title: 'Demo',
    subtitle: 'Crossdock-visualisatie en de Mek-Rider in 3D, voor bij de klant.',
    tabsLabel: 'Weergave',
    tab2d: 'Crossdock 2D',
    tabProduct: '3D product',
    tabRace: '3D crossdock race',
    leadLabel: 'Koppel aan lead',
    leadNone: '— Geen lead —',
    leadNotFound: 'Deze lead is niet gevonden. De demo gebruikt de standaardwaarden.',
    hallOf: (bedrijf: string) => `Hal van ${bedrijf}`,
    noHallYet: (bedrijf: string) => `${bedrijf} heeft nog geen halgegevens: standaardwaarden ingevuld.`,
    openRoi: 'Open ROI met deze hal',
    saveToLead: 'Opslaan bij lead',
    saving: 'Opslaan…',
    saved: 'Halgegevens opgeslagen bij de lead.',

    // Server action errors
    errForbidden: 'Je hebt geen rechten om halgegevens op te slaan.',
    errInvalidLead: 'Ongeldige lead.',
    errInvalidHall: 'Ongeldige halgegevens.',
    errRange: (label: string, min: string, max: string) => `${label}: kies een waarde tussen ${min} en ${max}.`,
    errSave: (msg: string) => `Opslaan mislukt: ${msg}`,
    errNotFound: 'Lead niet gevonden of geen rechten.',
    activityText: (summary: string) => `Halgegevens opgeslagen: ${summary}.`,
    activitySummary: (len: string, wid: string, gap: string, spd: string, load: string, vol: string) =>
      `afstand inbound → outbound ${len} m, zijwaarts ${wid} m, A → B ${gap} m, ${spd} km/u, ${load} sec laden/lossen per pallet, ${vol} pallets per dag`,

    // 2D: lanes
    intro:
      'Van inkomende trailer naar uitgaande trailer, zonder opslag ertussen. Zie hoe de Mek-Rider met uitschuifbare lepels twee pallets achter elkaar meeneemt en ze in één rit op twee losplekken afzet, en wat dat per dag scheelt ten opzichte van een standaard EPT.',
    stdName: 'Standaard EPT',
    stdSub: '1 pallet per rit, rijdt afwisselend naar losplek A en B',
    mekSub: '2 pallets per rit, lost op losplek A én B',
    moved: (n: number) => (n === 1 ? 'pallet verplaatst' : 'pallets verplaatst'),
    planLabelStd: 'Plattegrond crossdock met standaard EPT',
    planLabelMek: 'Plattegrond crossdock met Mek-Rider',
    inboundTrailer: 'Inkomende trailer',
    spot: (dock: string) => `Losplek ${dock}`,
    buffer: 'Buffer / sorteerbanen',
    trailersUnloaded: (n: number) => `Trailers gelost: ${n}`,
    trailersLeft: (n: number) => `Trailers vertrokken: ${n}`,
    phPick: 'Lossen uit inkomende trailer',
    phDriveTo: (dock: string) => `Rijden naar losplek ${dock}`,
    phDrop: (dock: string) => `Pallet afzetten bij losplek ${dock}`,
    phBack: 'Leeg terug naar inbound dock',
    phMekToA: 'Met 2 pallets naar losplek A',
    phMekToB: 'Met 1 pallet door naar losplek B',
    phaseLine: (label: string, ride: number) => `${label}, rit ${ride}`,
    ready: 'Klaar om te starten',

    // 2D: controls
    pause: 'Pauzeer',
    start: 'Start',
    reset: 'Opnieuw',
    tempoLabel: 'Simulatietempo',
    clock: 'Verstreken tijd in de hal:',
    leadStart: 'De Mek-Rider start gelijk met de standaard EPT.',
    leadAhead: (min: number, sec: number, n: number) =>
      `Na ${min} min ${sec} sec heeft de Mek-Rider **${n} pallet${n === 1 ? '' : 's'} meer** over losplek A en B verdeeld.`,
    leadBusy: 'Beide trucks zijn bezig met hun eerste ritten.',

    // 2D: process steps
    stepsTitle: 'Het crossdock proces, stap voor stap',
    mekAdvantage: 'Mek-voordeel',
    step1Title: 'Aankomst trailer',
    step1Text:
      'De inkomende trailer meldt zich aan en wordt aan een inbound dock gezet. Vrachtbrief en planning bepalen naar welke uitgaande docks de pallets gaan.',
    step1Impact: 'Geen verschil tussen de trucks: dit is planning en dockbezetting. Wel kan de trailer korter aan het dock staan, zie stap 2.',
    step2Title: 'Lossen uit de trailer',
    step2Text:
      'De truck rijdt de trailer in en haalt de pallets eruit. Met uitgeschoven lepels pakt de Mek-Rider twee pallets achter elkaar in één inrijbeurt, ook als ze naar verschillende bestemmingen gaan.',
    step2Impact:
      'Minder inrijbeurten: de Mek-Rider haalt per inrijbeurt **twee pallets** uit de trailer, een standaard EPT één. De inbound dock kan daardoor eerder vrij zijn voor de volgende trailer.',
    step2Note:
      'De calculator hieronder rekent dit voordeel bewust niet mee: daar telt elke pallet de volledige laad-/lostijd. De uitkomst is dus conservatief.',
    step3Title: 'Scannen en sorteren',
    step3Text:
      'Pallets worden gescand en per bestemming toegewezen. De Mek-Rider combineert in één rit twee pallets voor twee uitgaande docks: de voorste pallet voor losplek A, de achterste voor B.',
    step3Impact: 'Minder ritten betekent minder drukte in de sorteerbanen en minder kruisend verkeer tussen trucks en orderpickers.',
    step4Title: 'Transport naar outbound',
    step4Text:
      'Het langste deel van de cyclus. De standaard EPT rijdt voor elke pallet heen en terug. De Mek-Rider rijdt één lus: inbound, losplek A, losplek B, en leeg terug.',
    step4Impact: (tripsMek: string, tripsStd: string, km: string, vol: string) =>
      `Per dag **${tripsMek} ritten** in plaats van ${tripsStd}. Dat is **${km} km** minder rijden per dag bij ${vol} pallets.`,
    step5Title: 'Lossen op 2 losplekken',
    step5Text:
      'De Mek-Rider zet de voorste pallet af bij losplek A, rijdt door naar losplek B en zet daar de tweede pallet af. Daarna rijdt hij leeg terug naar de inbound dock.',
    step5Impact: (gap: string, stdTrip: string, ppMek: string, ppStd: string) =>
      `Tussen A en B rijdt de Mek-Rider **${gap} m** extra, in plaats van een complete retour van ${stdTrip} m die de standaard EPT voor de tweede pallet maakt. Per pallet kost de cyclus **${ppMek}** in plaats van ${ppStd}.`,

    // 2D: calculator
    calcTitle: 'Uw hal, uw volume',
    fields: {
      inboundToOutboundM: 'Afstand inbound → outbound dock',
      sidewaysM: 'Zijwaartse verplaatsing tussen docks',
      gapM: 'Afstand tussen losplek A en B',
      speedKmh: 'Rijsnelheid',
      loadSecondsPerPallet: 'Laad-/lostijd per pallet',
      palletsPerDay: 'Pallets door het crossdock per dag',
    },
    units: { m: 'm', kmh: 'km/u', sec: 'sec', pallets: '' },
    rowSpots: 'Losplekken per rit',
    rowCycle: 'Cyclustijd per rit',
    rowPerPallet: 'Tijd per pallet',
    rowTrips: 'Ritten per dag',
    rowKm: 'Rijafstand per dag',
    rowHours: 'Uren per dag',
    hours: (h: string) => `${h} uur`,
    gain: (p: string) => `${p} efficiënter`,
    gainSub: (hours: string, fte: string, shift: string) =>
      `${hours} uur minder truckinzet per dag, dat is ${fte} FTE bij een dienst van ${shift} uur.`,
    calcNote:
      'Rekent met de formule van de terugverdientijd calculator (rechthoekig traject, inclusief retour), uitgebreid met de rit tussen losplek A en B. De standaard EPT rijdt afwisselend naar A en B; de Mek-Rider rijdt inbound → A → B → inbound. Zet de afstand tussen A en B op 0 m en de uitkomst is gelijk aan de calculator.',
    footer: 'Indicatieve visualisatie. De plattegrond is schematisch; tijden en aantallen volgen uw invoer.',

    // 3D: shared
    loading3d: 'De 3D-weergave wordt geladen…',
    webglError: 'De 3D-weergave kon niet worden geladen. Probeer een andere browser of zet hardwareversnelling aan.',
    canvasLabel: '3D-weergave van de Mek-Rider',
    recMode: 'Opnamemodus',
    recTitle: 'Verbergt knoppen en panelen, zodat je een strakke schermopname kunt maken. Esc sluit af.',
    recExit: 'Opnamemodus uit',

    // 3D: product
    forkLength: 'Lepellengte',
    extend: 'Lepels uitschuiven',
    retract: 'Lepels inschuiven',
    loadLabel: 'Lading',
    loadEmpty: 'Leeg',
    load1: '1 pallet',
    load2: '2 pallets',
    rotate: (on: boolean) => `Draaien: ${on ? 'aan' : 'uit'}`,
    orbitHint: 'Sleep om rond te kijken, scroll of knijp om te zoomen.',
    chipPallets: (n: number) => `1 of ${n} pallets per rit`,
    chipKg: (kg: string) => `${kg} kg`,
    chipExtend: (s: string) => `Uitschuiven in ${s} sec`,
    chipWidth: (mm: string) => `${mm} mm breed`,

    // 3D: race
    hudTrips: 'Ritten',
    hudTime: 'Tijd',
    hudDist: 'Afstand',
    pause3d: 'Pauze',
    resume: 'Verder',
    speedLabel: 'Snelheid',
    taskNote: (empty: string, loaded: string) =>
      `Opdracht: 2 pallets van het inkomende dock naar losplek A en B. Rijsnelheid ${empty} km/u leeg, ${loaded} km/u met last.`,
    resultTitle: 'Zelfde klus, minder ritten',
    rides: (n: number) => (n === 1 ? '1 rit' : `${n} ritten`),
    resultText: (dist: number, time: number) =>
      `Voor deze klus rijdt de Mek-Rider ${dist}% minder meters en is hij ${time}% sneller klaar. Hoe groter de afstand tussen de docks, hoe groter het verschil.`,
    again: 'Nog een keer',
    dockOut: 'UITGAAND DOCK',
    dockIn: 'INKOMEND DOCK',
    sExtend: 'Lepels uitschuiven',
    cExtend: (from: string, to: string, s: string) => `Lepels uit: ${from} → ${to} mm in ${s} sec`,
    sToInbound: 'Naar het inkomende dock',
    sPickTwo: 'Twee pallets oppakken',
    cPickTwo: 'Twee pallets in één rit',
    sToA: 'Naar losplek A',
    sDropA: 'Pallet afzetten op A',
    cDropA: 'Losplek A',
    sRetract: 'Lepels inschuiven',
    sOnToB: 'Door naar losplek B',
    sDropB: 'Pallet afzetten op B',
    cDropBMek: 'Losplek B: klaar in één rit',
    sPickFirst: 'Eerste pallet oppakken',
    sBackEmpty: 'Leeg terug voor de tweede pallet',
    sPickSecond: 'Tweede pallet oppakken',
    sToBAround: 'Naar losplek B, om pallet A heen',
    sDone: (rides: string) => `Klaar: ${rides}`,
    cFinal: '1 rit in plaats van 2',
  },
  en: {
    title: 'Demo',
    subtitle: 'Crossdock visualisation and the Mek-Rider in 3D, for use with the customer.',
    tabsLabel: 'View',
    tab2d: 'Crossdock 2D',
    tabProduct: '3D product',
    tabRace: '3D crossdock race',
    leadLabel: 'Link to lead',
    leadNone: '— No lead —',
    leadNotFound: 'This lead was not found. The demo uses the default values.',
    hallOf: (bedrijf: string) => `Hall of ${bedrijf}`,
    noHallYet: (bedrijf: string) => `${bedrijf} has no hall data yet: default values filled in.`,
    openRoi: 'Open ROI with this hall',
    saveToLead: 'Save to lead',
    saving: 'Saving…',
    saved: 'Hall data saved to the lead.',

    errForbidden: 'You are not allowed to save hall data.',
    errInvalidLead: 'Invalid lead.',
    errInvalidHall: 'Invalid hall data.',
    errRange: (label: string, min: string, max: string) => `${label}: choose a value between ${min} and ${max}.`,
    errSave: (msg: string) => `Saving failed: ${msg}`,
    errNotFound: 'Lead not found or no permission.',
    activityText: (summary: string) => `Hall data saved: ${summary}.`,
    activitySummary: (len: string, wid: string, gap: string, spd: string, load: string, vol: string) =>
      `distance inbound → outbound ${len} m, sideways ${wid} m, A → B ${gap} m, ${spd} km/h, ${load} sec loading/unloading per pallet, ${vol} pallets per day`,

    intro:
      'From inbound trailer to outbound trailer, with no storage in between. See how the Mek-Rider, with its extendable forks, carries two pallets one behind the other and drops them at two unloading spots in a single trip, and what that saves per day compared with a standard EPT.',
    stdName: 'Standard EPT',
    stdSub: '1 pallet per trip, alternates between spot A and B',
    mekSub: '2 pallets per trip, unloads at spot A and B',
    moved: (n: number) => (n === 1 ? 'pallet moved' : 'pallets moved'),
    planLabelStd: 'Crossdock floor plan with a standard EPT',
    planLabelMek: 'Crossdock floor plan with the Mek-Rider',
    inboundTrailer: 'Inbound trailer',
    spot: (dock: string) => `Spot ${dock}`,
    buffer: 'Buffer / sorting lanes',
    trailersUnloaded: (n: number) => `Trailers unloaded: ${n}`,
    trailersLeft: (n: number) => `Trailers departed: ${n}`,
    phPick: 'Unloading the inbound trailer',
    phDriveTo: (dock: string) => `Driving to spot ${dock}`,
    phDrop: (dock: string) => `Dropping pallet at spot ${dock}`,
    phBack: 'Driving back empty to the inbound dock',
    phMekToA: 'Carrying 2 pallets to spot A',
    phMekToB: 'Carrying 1 pallet on to spot B',
    phaseLine: (label: string, ride: number) => `${label}, trip ${ride}`,
    ready: 'Ready to start',

    pause: 'Pause',
    start: 'Start',
    reset: 'Restart',
    tempoLabel: 'Simulation speed',
    clock: 'Time elapsed in the hall:',
    leadStart: 'The Mek-Rider starts level with the standard EPT.',
    leadAhead: (min: number, sec: number, n: number) =>
      `After ${min} min ${sec} sec the Mek-Rider has distributed **${n} more pallet${n === 1 ? '' : 's'}** over spots A and B.`,
    leadBusy: 'Both trucks are busy with their first trips.',

    stepsTitle: 'The crossdock process, step by step',
    mekAdvantage: 'Mek advantage',
    step1Title: 'Trailer arrival',
    step1Text:
      'The inbound trailer checks in and is assigned to an inbound dock. The consignment note and planning decide which outbound docks the pallets go to.',
    step1Impact: 'No difference between the trucks: this is planning and dock occupancy. The trailer can spend less time at the dock though, see step 2.',
    step2Title: 'Unloading the trailer',
    step2Text:
      'The truck drives into the trailer and takes the pallets out. With its forks extended, the Mek-Rider picks up two pallets one behind the other per entry, even when they go to different destinations.',
    step2Impact:
      'Fewer entries: the Mek-Rider takes **two pallets** out of the trailer per entry, a standard EPT one. The inbound dock can therefore be free sooner for the next trailer.',
    step2Note:
      'The calculator below deliberately does not credit this advantage: every pallet counts the full loading/unloading time. The result is therefore conservative.',
    step3Title: 'Scanning and sorting',
    step3Text:
      'Pallets are scanned and assigned per destination. In one trip the Mek-Rider combines two pallets for two outbound docks: the front pallet for spot A, the rear one for B.',
    step3Impact: 'Fewer trips means less congestion in the sorting lanes and less crossing traffic between trucks and order pickers.',
    step4Title: 'Transport to outbound',
    step4Text:
      'The longest part of the cycle. The standard EPT drives there and back for every pallet. The Mek-Rider drives one loop: inbound, spot A, spot B, and back empty.',
    step4Impact: (tripsMek: string, tripsStd: string, km: string, vol: string) =>
      `**${tripsMek} trips** per day instead of ${tripsStd}. That is **${km} km** less driving per day at ${vol} pallets.`,
    step5Title: 'Unloading at 2 spots',
    step5Text:
      'The Mek-Rider drops the front pallet at spot A, drives on to spot B and drops the second pallet there. It then drives back empty to the inbound dock.',
    step5Impact: (gap: string, stdTrip: string, ppMek: string, ppStd: string) =>
      `Between A and B the Mek-Rider drives **${gap} m** extra, instead of the complete ${stdTrip} m round trip the standard EPT makes for the second pallet. The cycle costs **${ppMek}** per pallet instead of ${ppStd}.`,

    calcTitle: 'Your hall, your volume',
    fields: {
      inboundToOutboundM: 'Distance inbound → outbound dock',
      sidewaysM: 'Sideways travel between docks',
      gapM: 'Distance between spot A and B',
      speedKmh: 'Driving speed',
      loadSecondsPerPallet: 'Loading/unloading time per pallet',
      palletsPerDay: 'Pallets through the crossdock per day',
    },
    units: { m: 'm', kmh: 'km/h', sec: 'sec', pallets: '' },
    rowSpots: 'Unloading spots per trip',
    rowCycle: 'Cycle time per trip',
    rowPerPallet: 'Time per pallet',
    rowTrips: 'Trips per day',
    rowKm: 'Distance per day',
    rowHours: 'Hours per day',
    hours: (h: string) => `${h} h`,
    gain: (p: string) => `${p} more efficient`,
    gainSub: (hours: string, fte: string, shift: string) =>
      `${hours} h less truck time per day, that is ${fte} FTE on a ${shift}-hour shift.`,
    calcNote:
      'Uses the payback calculator formula (rectangular route, including return), extended with the trip between spot A and B. The standard EPT alternates between A and B; the Mek-Rider drives inbound → A → B → inbound. Set the distance between A and B to 0 m and the result equals the calculator.',
    footer: 'Indicative visualisation. The floor plan is schematic; times and numbers follow your input.',

    loading3d: 'Loading the 3D view…',
    webglError: 'The 3D view could not be loaded. Try another browser or turn on hardware acceleration.',
    canvasLabel: '3D view of the Mek-Rider',
    recMode: 'Recording mode',
    recTitle: 'Hides buttons and panels so you can make a clean screen recording. Esc exits.',
    recExit: 'Exit recording mode',

    forkLength: 'Fork length',
    extend: 'Extend forks',
    retract: 'Retract forks',
    loadLabel: 'Load',
    loadEmpty: 'Empty',
    load1: '1 pallet',
    load2: '2 pallets',
    rotate: (on: boolean) => `Rotate: ${on ? 'on' : 'off'}`,
    orbitHint: 'Drag to look around, scroll or pinch to zoom.',
    chipPallets: (n: number) => `1 or ${n} pallets per trip`,
    chipKg: (kg: string) => `${kg} kg`,
    chipExtend: (s: string) => `Extends in ${s} sec`,
    chipWidth: (mm: string) => `${mm} mm wide`,

    hudTrips: 'Trips',
    hudTime: 'Time',
    hudDist: 'Distance',
    pause3d: 'Pause',
    resume: 'Resume',
    speedLabel: 'Speed',
    taskNote: (empty: string, loaded: string) =>
      `Task: 2 pallets from the inbound dock to spots A and B. Driving speed ${empty} km/h empty, ${loaded} km/h loaded.`,
    resultTitle: 'Same job, fewer trips',
    rides: (n: number) => (n === 1 ? '1 trip' : `${n} trips`),
    resultText: (dist: number, time: number) =>
      `For this job the Mek-Rider drives ${dist}% fewer metres and finishes ${time}% faster. The greater the distance between the docks, the greater the difference.`,
    again: 'Once more',
    dockOut: 'OUTBOUND DOCK',
    dockIn: 'INBOUND DOCK',
    sExtend: 'Extending forks',
    cExtend: (from: string, to: string, s: string) => `Forks out: ${from} → ${to} mm in ${s} sec`,
    sToInbound: 'To the inbound dock',
    sPickTwo: 'Picking up two pallets',
    cPickTwo: 'Two pallets in one trip',
    sToA: 'To spot A',
    sDropA: 'Dropping pallet at A',
    cDropA: 'Spot A',
    sRetract: 'Retracting forks',
    sOnToB: 'On to spot B',
    sDropB: 'Dropping pallet at B',
    cDropBMek: 'Spot B: done in one trip',
    sPickFirst: 'Picking up the first pallet',
    sBackEmpty: 'Back empty for the second pallet',
    sPickSecond: 'Picking up the second pallet',
    sToBAround: 'To spot B, around pallet A',
    sDone: (rides: string) => `Done: ${rides}`,
    cFinal: '1 trip instead of 2',
  },
});

export type DemoMessages = (typeof demo)['en'];
