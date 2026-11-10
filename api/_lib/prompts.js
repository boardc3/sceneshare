import { DESIGN_STYLES, SIGNATURE_PROMPT } from './styles.js'

// Prompt assembly follows the Renderer prompting playbook (02):
// Rule 0 hyper-detailed, Rule 1 fixed skeleton, Rule 3 always forbid text and
// people, and Template G — restyling a REAL photograph: STRUCTURE AND VIEWS ARE
// ALWAYS EXACT. The locks below are prepended AND appended so they bracket the
// style direction; the model weighs the first and last instructions most.

export const STYLES = [{ key: 'signature', prompt: SIGNATURE_PROMPT }, ...DESIGN_STYLES.map(({ key, prompt }) => ({ key, prompt }))]
export const STYLE_KEYS = STYLES.map((s) => s.key)
export const LIGHT_KEYS = ['daylight', 'golden', 'twilight', 'original']

const SHOT = `EDIT THE ATTACHED PHOTOGRAPH IN PLACE. The output must align pixel for pixel with the input: the same camera position, the same field of view, the same crop on all four edges. Do not step back, do not zoom in or out, do not re-centre.
100% PHOTOREALISTIC ARCHITECTURAL PHOTOGRAPH — RESTYLE OF A REAL PHOTOGRAPH OF A REAL HOME.
The attached image is a real photograph of this exact home, taken for a property listing. It is ground truth for the building, the room, the camera and the view. You are not creating a new space. You are re-finishing, re-furnishing and re-lighting THIS space, photographed from THIS exact spot.
First, identify silently what the photograph shows: an interior room (which room type), an exterior (front, rear, side, aerial, yard, pool), or a detail. Then list to yourself every wall, window, door, opening and built-in, and where each one sits in the frame. Apply the matching rules below.`

const LOCKS = `STRUCTURE AND VIEWS ARE ALWAYS EXACT. THIS IS NON-NEGOTIABLE AND OVERRIDES EVERY STYLE INSTRUCTION.

CAMERA LOCK
- Identical framing, crop, camera position, camera height, lens focal length, perspective and vanishing points. Do not zoom, pan, tilt, rotate, re-crop, widen or straighten the view.
- The output must overlay the source photograph line for line: every wall edge, ceiling line, floor line, roofline and opening edge lands on the same pixels.

ROOM DIMENSIONS LOCK
- Same room width, depth and ceiling height. Same wall positions and wall count. Same ceiling form (flat, vaulted, sloped, beamed) and the same ceiling height everywhere.
- CEILING LOCK: a flat ceiling stays flat. Do NOT add trays, coffers, beams, vaults, coves, soffits, recesses or raised panels, whatever the design direction below suggests. Only the ceiling's finish (smooth plaster, paint) and its light fixtures may change, in the same positions.
- Same floor plan: no walls added, removed, moved, thickened or opened up. No new soffits, niches, columns, bulkheads, islands, steps, platforms or built-ins that change the footprint.
- Furniture is scaled to the real room. A sofa that would not fit the real wall is not allowed.
- FOOTPRINT RULE: replace each existing piece of furniture with a new piece of about the same footprint in the same place (a sofa where the sofa was, a chair where the chair was). Built-ins, fireplaces, counters and islands keep their exact outline and position; only their finishes change.

OPENINGS LOCK — enumerate them to yourself one by one before restyling, then keep every one:
- Every window: same width, same height, same sill height, same head height, same position on its wall, same count of panes and same number of windows. The frame finish may change; the hole may not.
- Every door and doorway: stays a door or doorway of the same size in the same place. Do not convert a window to a door or a door to a window.
- Every skylight, archway, pass-through, stair opening and fireplace opening stays exactly as photographed.
- Do NOT extend glazing to the floor. Do NOT widen, add, remove, merge, split or move any window or door.

VIEW LOCK
- Everything seen through glass is IDENTICAL to the source photograph: same sky, same trees, same neighbouring buildings, same ocean, hills, street and terrain, in the same positions.
- For exteriors: everything beyond the property line (neighbours, street, sky, terrain, distant views) is IDENTICAL. Do not add water, mountains, ocean, city skylines or open views that are not in the source.

BUILDING LOCK (exteriors)
- Same massing, same number of storeys, same roof form and pitch, same ridges, eaves and overhangs. No hips, dormers, cross-gables, parapets or new ridges.
- Same footprint, same garage doors in the same places, same balconies, decks, railings positions and stairs.
- May change: exterior finishes and colours, window and door frame finishes, lighting fixtures, landscaping and hardscape inside the property, outdoor furniture, pool finishes (never the pool's shape or size).

SITE LOCK (exteriors and outdoor spaces)
- The ground keeps its real shape: slopes stay sloped, steps stay steps, level changes and retaining walls stay where they are. Do not flatten, regrade or terrace anything.
- Driveways, paths, parking pads, gates and fences keep their position and outline. Do NOT add a driveway, path, gate, pool, deck or structure that is not in the photograph; resurface the ones that exist.
- Mature trees and established hedges stay, in the same places and at the same size. Planting may be refreshed and added in existing beds only.

FUNCTION LOCK
- A kitchen stays a kitchen, a bedroom stays a bedroom, a bathroom keeps its fixtures in the same positions (toilet, tub, shower, vanity stay where they are). Do not change what the room is for.`

// What a restyle is for: owners asked for "more drastic changes in material colors
// and finishes" when a take played it safe, and for rooms that match each other.
const AMBITION = `HOW FAR TO GO
- The geometry is frozen; the design is not. Within the locks above, the change must be obvious at a glance when the two images are compared: every dated finish, fixture and furnishing is replaced, not lightly retouched. A timid result that mostly repaints the same room is a failure.
- Flooring, cabinetry fronts, counters, tile, wall finish, hardware, light fixtures, window treatments, furniture, rugs, bedding, art and styling all change to the design direction. Their positions, outlines and sizes stay.
- Keep any object the owner's direction names to keep, exactly as photographed.

ONE HOME, ONE PALETTE
- This photograph is one of a set of the same home being restyled in the same direction. Use the direction's primary choices so the rooms match one another: one wood tone, one stone, one metal finish, one wall colour, one flooring material throughout. Do not pick a different alternative for each photo.`

const LIGHT = {
  daylight: `LIGHT — BRIGHT, CLEAN DAYLIGHT
- Neutral white balance (about 5200K): whites read white. No sepia, yellow, orange or amber cast over the image; warmth comes only from the lamps themselves.
- Soft, bright natural daylight as from a clear late morning. Interiors: daylight from the existing windows only, balanced with warm 2700–3000K practical lights switched on at low level. Exteriors: clear blue sky as already photographed, soft directional sun, gentle shadows.
- Physically consistent: shadows fall from the real window and sun positions; reflections in glass, stone and metal match the light.`,
  golden: `LIGHT — GOLDEN HOUR
- Warm, not sepia: sunlit surfaces glow warm while shadows and white surfaces stay clean and neutral. No overall orange or brown wash.
- Warm low sun, roughly one hour before sunset, raking softly across surfaces. Long gentle shadows, warm highlights on stone, wood and plaster.
- Interiors: warm sun through the EXISTING windows only, interior lamps glowing softly at 2700K. Exteriors: warm light on the facade, landscape lighting just beginning to glow.
- The sky seen through windows and above the property keeps its real content (same clouds, same horizon, same objects); only its colour warms.`,
  twilight: `LIGHT — TWILIGHT (BLUE HOUR) PROPERTY PHOTOGRAPH
- Ten to twenty minutes after sunset: deep blue ambient sky, every interior light on and glowing warm 2700K, so the home reads warm and inviting against the cool dusk.
- Exteriors: windows glow from within, landscape uplights, path lights and pool light on, facade evenly lit, no harsh hotspots.
- Interiors: layered warm interior lighting, windows show the same view as the source in blue-hour tone.
- Keep the scene well exposed and clean: no murky shadows, no noise.`,
  original: `LIGHT — KEEP THE PHOTOGRAPH'S OWN LIGHT
- Keep the time of day, sun direction and light sources of the source photograph. Improve only balance and exposure as described under photo finish.`,
}

const FINISH = `PHOTO FINISH — EDITORIAL REAL ESTATE PHOTOGRAPHY
- Balanced HDR-style exposure: no blown highlights, no crushed shadows, interior and exterior both readable; window views exposed correctly but unchanged in content.
- Neutral, colour-accurate whites; no colour casts from mixed light; true-to-life material colour and texture (wood grain, stone veining, fabric weave, metal reflections).
- Crisp, high-resolution detail; clean surfaces; no noise, no haze, no smudges, no lens dirt.
- Indistinguishable from a professional architectural photograph shot on a full-frame camera at f/8, ISO 100 — not a 3D render, not a painting, no plastic or CGI look.`

const NEGATIVES = `ABSOLUTE CONSTRAINTS — NEGATIVE LIST
NO text, NO labels, NO captions, NO watermark, NO logo, NO signage, NO dimension lines.
NO people, NO pets, NO cars added, NO clutter.
NO change to the camera, the room's dimensions, the walls, the ceiling height, the windows, the doors, the roof form, or the view through any glass.
NO invented views, NO added water features, NO added fireplaces, NO added skylights, NO extra windows.
Return exactly one image: the same photograph of the same space from the same spot, restyled.`

const POLISH = `TASK — POLISH ONLY (RELIGHT + PHOTO FINISH)
Keep EVERYTHING in the photograph as it is: the same furniture, the same finishes, the same objects in the same places, the same colours of every material. Do not restyle, re-furnish or redecorate.
Only: correct exposure and white balance, relight as specified below, tidy obvious clutter (loose cables, small mess), straighten nothing that would move the camera, and give it a professional editorial photo finish.`

// "Make it professional" — for brokers shooting on a phone. A separate prompt from
// the restyle modes: the model acts as a top real-estate photographer and retoucher,
// keeps the room, its furniture and its view, and fixes everything a snapshot gets
// wrong (tilt, converging verticals, exposure, colour casts, blur, clutter, light).
const PRO_ROLE = `PROFESSIONAL REAL ESTATE PHOTOGRAPH FROM A SNAPSHOT.
The attached image is a quick, imperfect photo of a real home taken on a phone by a busy agent: it may be tilted, shot from a slightly wrong height, dark or blown out, colour-cast by mixed light, noisy, soft or blurred, with windows burned out and clutter in view.
Produce the photograph a high-end architectural real estate photographer would have delivered of THIS SAME SPACE from THIS SAME SPOT — the image that would run on a luxury brokerage's listing — after a full professional shoot and retouch.
First, identify silently what the photograph shows: an interior room (which room type), an exterior (front, rear, side, yard, pool), or a detail. Then list to yourself every wall, window, door, built-in and piece of furniture, and where it sits.`

const PRO_KEEP = `KEEP — THIS IS THE SAME HOME, NOT A REDESIGN
- Same room, same size, same walls, ceiling, floor, windows, doors, openings, built-ins, fixtures and finishes, with the same materials and colours.
- Same furniture and decor pieces that belong in the room, in the same places. Do NOT restyle, re-furnish, re-paint, re-floor, add furniture or add decor. No virtual staging.
- Same view through every window and beyond the property: same trees, buildings, terrain and horizon.
- Same viewpoint: the photographer stands where the phone was. Do not move into another room or reveal space that is not in the photo.`

const PRO_FIX = `FIX — WHAT THE PROFESSIONAL DOES
1. CAMERA AND COMPOSITION
- Level the horizon and correct the tilt. Make every vertical line truly vertical (two-point perspective, as with a tilt-shift lens): door frames, wall corners, window frames and cabinets straight up and down, no converging or leaning verticals.
- Remove phone-lens distortion (bowed lines at the edges). Camera at a natural chest height (about 1.2–1.5 m) looking level.
- Re-centre the composition so the room reads as symmetrical as the real space allows: centre on the main wall, window, bed, fireplace or feature the photo is already facing, with even margins left and right. Do this by squaring up the camera, never by resizing, stretching or moving anything in the room: the room's dimensions and proportions stay accurate.
- Only the reframe these corrections need is allowed; keep the same subject, the same spot and the same aspect ratio. Never zoom out to invent unseen space.
2. LIGHT AND EXPOSURE (flambient / HDR blend, done well)
- Bright, airy, evenly lit room with natural depth: no dark corners, no blown highlights, no flash hotspots, no harsh flash shadows.
- Window pull: windows correctly exposed so the real view outside is clearly visible, never a white blown-out glow, never a fake view.
- Interior lights switched on and glowing softly. Neutral, clean whites on walls and ceilings; remove orange tungsten, green fluorescent and blue daylight casts; true-to-life material colours.
3. CLARITY
- Tack sharp throughout, as from a full-frame camera on a tripod at f/8, ISO 100: remove motion blur, softness, noise and grain; fine real texture in wood, stone, fabric and metal.
- Remove lens flare, glare, smudges and dust; remove reflections of the photographer or phone in mirrors, glass and appliances.
4. PRE-SHOOT TIDY (what the photographer would ask the agent to do)
- Remove clutter: items on counters, tables, floors and shelves; personal photos, papers, fridge magnets, toiletries, cleaning products, cords and cables, trash and bins, shoes, laundry, pet bowls and beds, cars in the driveway.
- Remove every sign of children: toys, play mats, high chairs, cribs' loose bedding and mobiles, strollers, car seats, children's drawings, school papers, stickers, growth charts, child locks and gates, bath toys, outdoor play equipment that is not built in.
- Tidy what stays: beds made with crisp linens, pillows plumped, cushions and throws straightened, rugs straight, chairs aligned, blinds and curtains evenly open, cabinet doors and drawers closed, toilet lid down, towels folded, TV and screens off and black, ceiling fans still.
- Fill every cleared area with the real surface behind it.
- Deep clean, as after a professional cleaning crew: carpets freshly cleaned and evenly vacuumed with no stains, spots or traffic marks; hard floors, counters, glass and mirrors spotless; scuffs, marks and patches on walls and ceilings removed. Same materials and the same colours, just clean.
5. EXTERIORS
- If the sky is grey, white or blown out, replace it with a natural clear blue sky with a few soft clouds; keep the horizon, trees and buildings exactly. Lawns tidy and evenly green, hoses and bins removed; landscaping itself unchanged.`

const PRO_LIGHT = {
  daylight: `LIGHT — BRIGHT, AIRY DAYLIGHT (THE LISTING STANDARD)
- Soft, bright late-morning daylight from the existing windows, balanced with warm 2700–3000K interior lights on at low level. Exteriors: soft directional sun from the real sun side, gentle shadows.`,
  golden: LIGHT.golden,
  twilight: LIGHT.twilight,
  original: `LIGHT — THE PHOTO'S OWN TIME OF DAY
- Keep the time of day and the direction of the light, but expose and balance it as a professional would: bright, even and clean.`,
}

const PRO_NEGATIVES = `ABSOLUTE CONSTRAINTS
NO text, NO labels, NO watermark, NO logo, NO people, NO pets.
NO new furniture, NO new decor, NO new finishes, NO restyling, NO virtual staging.
NO change to the room's size, walls, ceiling, windows, doors or the content of any view; NO invented views or rooms.
NOT a 3D render, NOT a painting, NOT over-processed HDR: no halos, no glowing edges, no oversaturation, no cartoon colours.
Return exactly one image: this same space, as a professional real estate photographer would have captured it.`

// Second try when a professional-photo take changed the room instead of the camera.
export const PRO_RETRY_PREFIX = `SECOND ATTEMPT. The previous attempt changed the room itself (walls, windows, furniture or the view moved, appeared or disappeared) or reframed it too far. Keep the same room and the same contents from the same spot; only straighten the camera, fix light and exposure, sharpen, and tidy clutter.

`

// Prefixed to a second attempt when the automatic overlay check fails.
export const RETRY_PREFIX = `SECOND ATTEMPT. The previous attempt changed the camera (it zoomed, re-centred or moved walls and openings). That is a failure. This time keep the frame EXACTLY: every wall edge, the ceiling line, the floor line and every window and door must sit on the same pixels as in the attached photograph. Change surfaces, furniture and light only.

`

export function buildRenderPrompt({ mode = 'redesign', style = 'signature', light = 'daylight', note = '' }) {
  const lightBlock = LIGHT[light] || LIGHT.daylight
  const extra = note ? `\nTHE OWNER'S OWN DIRECTION — this outranks the design direction above wherever the two differ, and is applied within every lock: ${note.slice(0, 600)}\n` : ''
  if (mode === 'cleanup') {
    const proExtra = note ? `\nADDITIONAL DIRECTION FROM THE AGENT (within everything above): ${note.slice(0, 600)}\n` : ''
    return [PRO_ROLE, PRO_KEEP, PRO_FIX, PRO_LIGHT[light] || PRO_LIGHT.daylight, proExtra, PRO_NEGATIVES, 'REMINDER: SAME HOME, SAME ROOM, SAME FURNITURE, SAME VIEW — SHOT AND RETOUCHED LIKE A HIGH-END LISTING PHOTOGRAPH.'].join('\n\n')
  }
  if (mode === 'polish') {
    return [SHOT, LOCKS, POLISH, lightBlock, FINISH, extra, NEGATIVES, 'REMINDER: STRUCTURE, OPENINGS, CAMERA AND VIEW ARE EXACT.'].join('\n\n')
  }
  const s = STYLES.find((x) => x.key === style) || STYLES[0]
  return [
    SHOT,
    LOCKS,
    `DESIGN DIRECTION (applies to finishes, fixtures, furniture, lighting design, landscape and styling ONLY — never to structure, openings, camera or view. Where anything in it disagrees with a lock above, the lock wins):\n${s.prompt}`,
    AMBITION,
    lightBlock,
    FINISH,
    extra,
    NEGATIVES,
    'REMINDER: STRUCTURE, ROOM DIMENSIONS, OPENINGS, CAMERA AND VIEW ARE EXACTLY AS IN THE SOURCE PHOTOGRAPH. ONLY THE DESIGN, LIGHT AND FINISH CHANGE.',
  ].join('\n\n')
}

// Feedback edit pass on the best take (runbook: "edit pass on the best take,
// change ONLY …"). Reference 1 = source photograph (geometry truth), reference 2 =
// the current proposal (design truth).
// "The door should say Floor B", "add the number 3C".
const wantsText = (s) => /\b(say|says|read|reads|letter|letters|number|numbered|text|sign|label|word|words)\b|[“"'][^”"']{1,24}[”"']/i.test(String(s || ''))

export function buildFeedbackPrompt({ feedback, light = 'original' }) {
  return [
    `EDIT PASS — CHANGE ONLY WHAT IS ASKED.
Reference 1 is the ORIGINAL PHOTOGRAPH of this exact space: it is ground truth for the camera, the room's dimensions, every wall, every window and door opening, the ceiling, and the view through the glass.
Reference 2 is the CURRENT PROPOSED DESIGN of the same space from the same camera.
Produce reference 2 again with ONLY this change, as requested by the owner:
"${String(feedback).slice(0, 800)}"
Everything the request does not mention stays exactly as in reference 2: same furniture, same finishes, same colours, same objects in the same places, same light.
Carry the request out fully and visibly. If it asks for a different material, colour, finish, style or level of quality, change every surface it applies to; do not return reference 2 almost unchanged.
The request may move, add or remove furniture, fixtures, planting and objects, and may rearrange fixtures inside the room (for example a larger shower, a longer vanity, a desk on another wall): do that, inside the same walls. The FOOTPRINT RULE and the fixture positions in the FUNCTION LOCK below give way to the request; every other lock holds.
If the request asks for specific words, letters or numbers on something (a door number, a sign), render exactly those characters, cleanly, and nothing else written.
If the request asks to keep or bring back something from the original photograph, copy it from reference 1.
If the request asks for anything that would change the structure, the room's dimensions, an opening, the camera or the view (for example "make the room bigger", "add a window", "raise the ceiling", "show the ocean"), do NOT do that part: keep the geometry of reference 1 and apply only the design part of the request.`,
    LOCKS,
    light !== 'original' ? LIGHT[light] : '',
    FINISH,
    wantsText(feedback) ? NEGATIVES.replace('NO text, NO labels, NO captions, NO watermark, NO logo, NO signage, NO dimension lines.', 'NO text other than the exact characters the request asks for. NO captions, NO watermark, NO logo, NO dimension lines.') : NEGATIVES,
    'REMINDER: GEOMETRY FROM REFERENCE 1, DESIGN FROM REFERENCE 2, PLUS THE REQUESTED CHANGE, CARRIED OUT IN FULL.',
  ]
    .filter(Boolean)
    .join('\n\n')
}
