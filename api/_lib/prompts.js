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

FUNCTION LOCK
- A kitchen stays a kitchen, a bedroom stays a bedroom, a bathroom keeps its fixtures in the same positions (toilet, tub, shower, vanity stay where they are). Do not change what the room is for.`

const LIGHT = {
  daylight: `LIGHT — BRIGHT, CLEAN DAYLIGHT
- Soft, bright natural daylight as from a clear late morning. Interiors: daylight from the existing windows only, balanced with warm 2700–3000K practical lights switched on at low level. Exteriors: clear blue sky as already photographed, soft directional sun, gentle shadows.
- Physically consistent: shadows fall from the real window and sun positions; reflections in glass, stone and metal match the light.`,
  golden: `LIGHT — GOLDEN HOUR
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

// Prefixed to a second attempt when the automatic overlay check fails.
export const RETRY_PREFIX = `SECOND ATTEMPT. The previous attempt changed the camera (it zoomed, re-centred or moved walls and openings). That is a failure. This time keep the frame EXACTLY: every wall edge, the ceiling line, the floor line and every window and door must sit on the same pixels as in the attached photograph. Change surfaces, furniture and light only.

`

export function buildRenderPrompt({ mode = 'redesign', style = 'signature', light = 'daylight', note = '' }) {
  const lightBlock = LIGHT[light] || LIGHT.daylight
  const extra = note ? `\nADDITIONAL DIRECTION FROM THE OWNER (apply within every lock above): ${note.slice(0, 600)}\n` : ''
  if (mode === 'polish') {
    return [SHOT, LOCKS, POLISH, lightBlock, FINISH, extra, NEGATIVES, 'REMINDER: STRUCTURE, OPENINGS, CAMERA AND VIEW ARE EXACT.'].join('\n\n')
  }
  const s = STYLES.find((x) => x.key === style) || STYLES[0]
  return [
    SHOT,
    LOCKS,
    `DESIGN DIRECTION (applies to finishes, fixtures, furniture, lighting design, landscape and styling ONLY — never to structure, openings, camera or view):\n${s.prompt}`,
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
export function buildFeedbackPrompt({ feedback, light = 'original' }) {
  return [
    `EDIT PASS — CHANGE ONLY WHAT IS ASKED.
Reference 1 is the ORIGINAL PHOTOGRAPH of this exact space: it is ground truth for the camera, the room's dimensions, every wall, every window and door opening, the ceiling, and the view through the glass.
Reference 2 is the CURRENT PROPOSED DESIGN of the same space from the same camera.
Produce reference 2 again with ONLY this change, as requested by the owner:
"${String(feedback).slice(0, 800)}"
Everything the request does not mention stays exactly as in reference 2: same furniture, same finishes, same colours, same objects in the same places, same light.
If the request asks for anything that would change the structure, the room's dimensions, an opening, the camera or the view (for example "make the room bigger", "add a window", "raise the ceiling", "show the ocean"), do NOT do that part: keep the geometry of reference 1 and apply only the design part of the request.`,
    LOCKS,
    light !== 'original' ? LIGHT[light] : '',
    FINISH,
    NEGATIVES,
    'REMINDER: GEOMETRY FROM REFERENCE 1, DESIGN FROM REFERENCE 2, PLUS ONLY THE REQUESTED CHANGE.',
  ]
    .filter(Boolean)
    .join('\n\n')
}
