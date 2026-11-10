// Design-style prompts ported from boardc3/sceneit (src/lib/styles.ts and the
// MODERNIZE_PROMPT in src/app/api/enhance/route.ts). Edit the prompts here.

export const SIGNATURE_PROMPT = `
You are performing a top-tier luxury redesign of this real estate photo as if the project has been re-executed by a world-class, highest-end interior designer AND architect who specialize exclusively in $10M+ ultra-luxury residences (think: architectural digest-level work, private client, no budget constraints, museum-level detailing).

PRIMARY MISSION: Transform the space into the highest tier of modern luxury design while preserving the room's exact structure and photography conditions. The finished image MUST look significantly nicer, more expensive, more refined, and more professionally designed than the original—without looking artificial, over-styled, or generically "staged."

ABSOLUTE NON-NEGOTIABLE CONSTRAINTS (MUST NOT CHANGE):
- Keep the EXACT SAME image dimensions, framing, and resolution.
- Keep the EXACT SAME camera angle, lens perspective, and vantage point.
- Keep the EXACT SAME architecture, wall positions, openings, ceiling height, and structural layout.
- Keep the EXACT SAME spatial configuration (nothing moved that changes room geometry).
- Do NOT add new doors/windows, remove doors/windows, change room boundaries, or alter structural elements.
- The result must look like the same room photographed from the same spot—only redesigned to ultra-luxury.

DESIGN STANDARD: This must appear indistinguishable from a $10M+ home professionally designed by an elite architect/interior designer team and photographed for a luxury publication. Every surface, edge, junction, hardware selection, and lighting choice should feel intentional, bespoke, and cohesive.

CORE PRINCIPLE: Upgrade EVERYTHING—materials, finishes, fixtures, hardware, lighting, furnishings, styling—while maintaining impeccable restraint and taste. No "cheap luxury cues," no random glam. Quiet luxury. Architectural clarity. Cohesive palette. Perfect execution.

REDESIGN REQUIREMENTS (DO ALL OF THESE, CONSISTENTLY):

1) ARCHITECTURAL FINISH UPGRADE (WITHOUT CHANGING ARCHITECTURE)
- Walls: Upgrade to flawless high-end finishes (plaster, refined paint, designer wallcovering) appropriate to the room.
- Trim: refine the existing trim (baseboards, casings, reveals) with a premium profile and finish, in the same positions.
- Ceilings: keep the ceiling's exact shape and height; upgrade only its finish (smooth plaster, fresh paint) and its light fixtures.
- Transitions: Ensure all material transitions are clean, premium, and architecturally correct (no awkward seams).

2) FLOORS & STONEWORK
- Flooring must be upgraded to premium wide-plank hardwood, natural stone, or top-tier tile appropriate to the room's function.
- If stone is present anywhere (counters, surrounds, backsplashes), use book-matched marble/quartzite or equally premium natural materials with realistic veining and correct scale.

3) FIXTURES, HARDWARE, AND "SMALL DETAILS" (EVERY SINGLE ONE)
Upgrade every visible "touch point" to designer-grade:
- Door hardware: brushed brass / unlacquered brass / matte black (tastefully chosen and consistent).
- Cabinet hardware: designer pulls/knobs scaled properly; consistent finish family.
- Plumbing fixtures: Waterworks / Kallista / Dornbracht-level sophistication.
- Lighting: replace all basic fixtures with elegant statement pieces + architectural lighting strategy.
- Switches/outlets: premium, flush, or designer plates; no cheap plastic plates.
- Vents/registers/grilles: refined, minimal, and consistent with the luxury language.
- Hinges, rails, tracks: upgraded and harmonious (nothing builder-basic remains).

4) LIGHTING DESIGN (THIS IS CRITICAL)
The lighting must feel like an architect planned it:
- Layered lighting: ambient + accent + decorative.
- Warm, controlled color temperature; soft highlights; no harsh glare.
- Add subtle lighting where appropriate (picture lights, under-cabinet lighting, toe-kick and shelf lighting, slim recessed downlights) WITHOUT changing the ceiling's shape.
- Ensure all lighting appears physically plausible and consistent with shadows and reflections.

5) FURNITURE, SOFT GOODS, AND SCALE
Replace furnishings with contemporary, high-end pieces that fit the room proportionally:
- Sofas/chairs: refined silhouettes; premium upholstery; no bulky mass-market shapes.
- Tables: luxury materials (walnut, marble, stone, metal accents) with correct scale.
- Rugs: natural fiber or silk; appropriately sized; elevated texture; crisp edges.
- Window treatments: custom drapery / roman shades / designer blinds with perfect hang and believable fabric.
- Bedding (if applicable): hotel-grade linens, layered textures, tailored and pristine.

6) COLOR, PALETTE, AND MATERIAL HARMONY
- Curate a cohesive, restrained luxury palette: neutrals with depth, subtle contrast, intentional accents.
- Use material harmony: wood tone temperature, metal finishes, stone veining, textile textures must all coordinate.
- Avoid trendy, loud, or cheap-looking combinations.

7) ART, ACCESSORIES, AND STYLING (CURATED, NOT CLUTTERED)
- Wall art: properly scaled, high-end, positioned correctly; no generic prints.
- Decor objects: curated designer accessories (books, vessels, sculptural objects) with restraint.
- Greenery: mature, architectural plant choices in designer planters (not tiny or artificial-looking).
- Mirrors: statement mirror if appropriate; elegant frame; correct reflection behavior.
- Styling must feel "wealthy and intentional," not staged or busy.

FUNCTIONAL INTEGRITY (MUST MAINTAIN):
- A kitchen remains a kitchen; bedroom remains a bedroom; living room remains a living room.
- Do NOT convert room type or add features that change how the room is used.

QUALITY BAR: WHAT "MUST" BE TRUE IN THE FINAL IMAGE
- The redesign must look materially expensive and architecturally coherent.
- Everything should feel bespoke, intentional, and professionally executed.
- It must look cleaner, calmer, richer, and more elevated than the original.
- No visible cheap elements remain.
- The final result MUST look much nicer than the original—this is not optional.

POSITIVES (DO THESE)
- Do elevate the room into "quiet luxury" with exceptional material authenticity.
- Do ensure perfect proportions, scaling, and placement of furnishings and decor.
- Do ensure lighting feels designed, warm, and editorial.
- Do ensure finishes feel real (grain, veining, reflections, shadow behavior).
- Do ensure the space looks like it was redesigned by an architect + top interior designer team.

NEGATIVES (DO NOT DO THESE)
- Do NOT change the room layout, architecture, or camera angle.
- Do NOT distort geometry or alter the perceived dimensions.
- Do NOT use obvious AI artifacts, painterly textures, or unrealistic reflections.
- Do NOT over-style, over-clutter, or add random decorative noise.
- Do NOT use cheap "luxury signals" (gaudy chandeliers, tacky glam, random gold everywhere).
- Do NOT introduce mismatched finishes (mixed metals without intention).
- Do NOT create generic staging that looks like a furniture catalog.
- Do NOT add people, text, logos, watermarks, or signage.

FINAL INSTRUCTION: Return only the transformed image of the same room from the same viewpoint—now executed at the highest level of luxury design, as if completed by the most elite designer and architect in the world.
`


export const BASE_CONSTRAINTS = `
ABSOLUTE NON-NEGOTIABLE CONSTRAINTS (MUST NOT CHANGE):
- Keep the EXACT SAME image dimensions, framing, and resolution.
- Keep the EXACT SAME camera angle, lens perspective, and vantage point.
- Keep the EXACT SAME architecture, wall positions, openings, ceiling height, and structural layout.
- Keep the EXACT SAME spatial configuration (nothing moved that changes room geometry).
- Do NOT add new doors/windows, remove doors/windows, change room boundaries, or alter structural elements.
- The result must look like the same room photographed from the same spot—only redesigned.

FUNCTIONAL INTEGRITY:
- A kitchen remains a kitchen; bedroom remains a bedroom; living room remains a living room.
- Do NOT convert room type or add features that change how the room is used.

QUALITY BAR:
- The redesign must look materially expensive and architecturally coherent.
- Everything should feel bespoke, intentional, and professionally executed.
- It must look cleaner, calmer, richer, and more elevated than the original.
- No visible cheap elements remain.
- The final result MUST look much nicer than the original—this is not optional.
- No obvious AI artifacts, painterly textures, or unrealistic reflections.
- Do NOT add people, text, logos, watermarks, or signage.
- Return only the transformed image.
`;

export const DESIGN_STYLES = [
  {
    key: 'avant-garde',
    name: 'Avant-Garde',
    subtitle: 'Bold geometry meets artistic vision',
    description: 'Ultra-contemporary, museum-quality spaces. Think Zaha Hadid meets James Turrell. Sculptural furniture, dramatic lighting, unexpected material combinations. Art as architecture.',
    icon: '◆',
    accentColor: '#8b5cf6',
    prompt: `You are performing a radical avant-garde redesign of this space, as envisioned by a collaboration between Zaha Hadid Architects, James Turrell, and the most daring contemporary design minds working today. The result should feel like a museum-quality installation that happens to be livable — bold, sculptural, and intellectually provocative.

${BASE_CONSTRAINTS}

DESIGN DIRECTION — AVANT-GARDE:

1) SPATIAL PHILOSOPHY
- Every surface should feel intentional and sculptural. Think of the room as a composition, not just a container.
- Embrace bold geometric forms: organic curves meeting sharp angles, cantilevered elements, asymmetric balance.
- Negative space is as important as filled space. Let emptiness speak.
- The room should feel like walking into a gallery exhibition — each piece and surface earning its place.

2) MATERIAL PALETTE
- Primary: Polished concrete, raw plaster with intentional texture, blackened steel, cast bronze
- Secondary: Translucent resin, backlit onyx, oxidized copper, smoked glass, liquid metal finishes
- Accent: Neon or LED light as material (à la Turrell/Dan Flavin), matte lacquer in unexpected colors
- Floors: Poured terrazzo with bold aggregate, micro-cement, or oversized format stone in dramatic veining
- Avoid: Anything safe, expected, or conventionally "pretty"

3) COLOR DIRECTION
- Bold and uncompromising. Deep charcoal, electric violet, burnt sienna, midnight blue as primary tones.
- High contrast: dark grounds with moments of vivid, saturated color (a single wall, a furniture piece, a light installation).
- Monochromatic schemes punctuated by one shocking accent.
- Reference: The palettes of Luis Barragán, Ricardo Bofill, United Visual Artists.

4) FURNITURE & OBJECTS
- Sculptural, gallery-worthy furniture: think Wendell Castle, Zaha Hadid Design, Rick Owens furniture line.
- Each piece should look like it could be exhibited at Design Miami or Art Basel.
- Irregular forms, experimental materials, one-of-a-kind feeling.
- No conventional sofas or mass-market silhouettes. Everything should provoke a reaction.
- Coffee tables as sculpture, chairs as art objects, shelving as architectural statement.

5) LIGHTING (CRITICAL — THIS DEFINES THE STYLE)
- Light IS the design. Think James Turrell Skyspaces, Olafur Eliasson installations.
- Dramatic, theatrical lighting: deep shadows, sharp pools of light, gradient washes on walls.
- Hidden linear LEDs creating ethereal glows — architectural lighting as art.
- Statement fixtures: sculptural, oversized, or conceptual (not decorative — provocative).
- Color-temperature play: warm pools against cool ambient, or vice versa.
- Avoid even, flat lighting. Embrace drama and mystery.

6) ART & INSTALLATION
- Large-scale contemporary art: abstract, conceptual, or installation-based.
- Art should feel integrated into the architecture, not hung as afterthought.
- Consider: light installations, kinetic sculpture, large-format photography, video art screens.
- Fewer pieces, larger scale. One statement > many small works.

7) TEXTURE & DETAIL
- Raw and refined existing in tension: rough concrete beside polished bronze, raw wood beside glass.
- Visible material honesty — celebrate the nature of materials, don't disguise them.
- Hardware and fittings should be custom-looking: oversized, unusual profiles, blackened or burnished metals.
- Window treatments: minimal — motorized, hidden, or architectural (not decorative fabric).

8) OVERALL FEELING
- Walking into this room should feel like entering a private art collection or a cutting-edge architecture studio.
- Intellectually stimulating, emotionally evocative, unmistakably expensive.
- Not cold or inhospitable — but challenging and singular.
- Reference publications: Wallpaper*, Dezeen, Architectural Digest's most daring features.
- The antithesis of "safe luxury." This is luxury that makes a statement.`,
  },
  {
    key: 'timeless-estate',
    name: 'Timeless Estate',
    subtitle: 'Old-world elegance, reimagined',
    description: 'Neo-classical meets modern refinement. Think Ralph Lauren\'s Bedford estate. Rich millwork, coffered ceilings, library paneling, but with contemporary proportions. Heritage without heaviness.',
    icon: '♛',
    accentColor: '#d4a574',
    prompt: `You are performing a timeless estate redesign of this space, as if commissioned by the most discerning private client who appreciates old-world craftsmanship but demands modern comfort. Think Ralph Lauren's Bedford estate, the private apartments at Claridge's, or a Hamptons manor redesigned by Victoria Hagan. Heritage elevated to the highest level of contemporary refinement.

${BASE_CONSTRAINTS}

DESIGN DIRECTION — TIMELESS ESTATE:

1) ARCHITECTURAL ENRICHMENT
- Add richness through millwork: wainscoting, raised panel walls, library-style built-ins, elegant chair rails.
- Ceilings keep their existing shape (existing beams or coffers are refinished; none are added).
- Crown molding with classical profiles, but proportioned for modern sensibility (not overly ornate).
- Arched doorways or transoms if existing architecture supports it.
- Every transition (baseboard to wall, wall to ceiling, trim to surface) should be detailed and intentional.

2) MATERIAL PALETTE
- Primary: Rich walnut, mahogany, or dark-stained oak millwork; Calacatta or Statuario marble
- Secondary: Honed brass (unlacquered, developing natural patina), antique mirror, hand-glazed plaster
- Accent: Embossed leather, silk velvet, hand-knotted wool, heritage textiles
- Floors: Wide-plank European oak (dark walnut or natural), herringbone parquet, or honed marble
- Avoid: Anything that feels mass-produced, plastic, or trendy

3) COLOR DIRECTION
- A refined, warm neutral palette: warm whites, creamy ivories, soft taupes, deep charcoals.
- Accent colors drawn from traditional luxury: navy blue, hunter green, burgundy, cognac brown.
- Paint finishes with depth: not flat white — think Benjamin Moore's "White Dove" or Farrow & Ball "Pointing."
- Wallcoverings: subtle patterns — damask, grasscloth, linen texture — adding dimension without distraction.
- Reference: Traditional Home magazine, Veranda, the palette of Victoria Hagan or Thomas O'Brien.

4) FURNITURE & UPHOLSTERY
- Classic silhouettes with modern proportions: tufted sofas but lower-profile, wing chairs but with clean lines.
- Mix of periods: a Georgian desk beside a contemporary reading chair, an antique console under modern art.
- Upholstery in rich, tactile fabrics: mohair, Belgian linen, washed silk, cashmere blend.
- Case goods in fine wood with traditional joinery visible — dovetails, inlays, turned legs.
- Properly scaled: furniture that fills the space generously but not overcrowded. Rooms should breathe.

5) LIGHTING
- Layered and warm: picture lights over art, library lamps on desks, sconces flanking fireplaces.
- Statement chandeliers: crystal, hand-forged iron, or antiqued brass — elegant, not gaudy.
- Table lamps with quality bases (crystal, porcelain, turned wood) and proper silk or linen shades.
- Warm color temperature throughout (2700K-3000K). Nothing harsh or clinical.
- Architectural: subtle recessed lighting supplementing decorative fixtures, never as sole light source.

6) ART & ACCESSORIES
- Oil paintings (landscapes, portraits, or abstracts in classical frames), antique prints, collected objects.
- Books: real libraries with properly arranged volumes — leather-bound and cloth-covered.
- Accessories: silver picture frames, crystal decanters, antique boxes, fresh flowers in proper vases.
- Mirrors: large-scale with gilt or carved frames, placed to enhance light and space.
- Curated over time, not "decorated" — the room should feel like generations of collecting.

7) TEXTILES & SOFT GOODS
- Window treatments: full-length drapery in silk, linen, or wool, with proper headers and hardware (brass or wrought iron rods).
- Area rugs: antique Oushaks, Persian runners, or high-quality contemporary rugs in classic patterns.
- Throw pillows and blankets: cashmere, embroidered, or in heritage fabrics — not decorative pillows for decoration's sake.
- Bedding (if applicable): crisp white with layered throws, euro shams, and hotel-quality linens.

8) OVERALL FEELING
- Walking into this room should feel like entering a private estate that has been curated over decades.
- Warmth, intelligence, and quiet confidence. Nothing proves its luxury — it simply is luxurious.
- Comfortable enough to live in daily, impressive enough to photograph for Architectural Digest.
- The antithesis of trendy. This room will look perfect in 20 years.
- Reference: Ralph Lauren Home, Colefax & Fowler, Mark Hampton's legacy.`,
  },
  {
    key: 'pure-form',
    name: 'Pure Form',
    subtitle: 'The art of essential space',
    description: 'Japanese-inspired minimalism meets Scandinavian warmth. Think John Pawson, Tadao Ando. Every element earned its place. Negative space is the luxury. Natural materials, perfect light.',
    icon: '○',
    accentColor: '#84a98c',
    prompt: `You are performing a minimalist redesign of this space in the tradition of John Pawson, Tadao Ando, and the Japanese concept of Ma (間) — the beauty of emptiness. Every element must earn its place. Negative space is the luxury. This is architecture reduced to its purest, most essential expression, where natural light and honest materials create quiet transcendence.

${BASE_CONSTRAINTS}

DESIGN DIRECTION — PURE FORM:

1) SPATIAL PHILOSOPHY
- Radical reduction: remove visual noise until only the essential remains.
- The space itself — its volume, proportions, light — IS the design. Furnishings support, not dominate.
- Embrace Ma (間): the meaningful void. Empty space is not "unfurnished" — it is intentional.
- Every object, surface, and junction must be resolved to its simplest, most perfect expression.
- Think monastery, tea house, chapel — spaces that inspire contemplation through simplicity.

2) MATERIAL PALETTE
- Primary: Raw concrete (board-formed or smoothly finished), pale plaster, untreated solid wood (white oak, hinoki, ash)
- Secondary: Natural stone (limestone, pale travertine, honed sandstone), linen, washi paper textures
- Accent: Black iron, raw brass (minimal), matte ceramic, handmade pottery
- Floors: Wide-plank pale oak, polished concrete, or large-format natural stone with minimal grout lines
- Avoid: Anything glossy, ornate, patterned, or synthetic. No veneers — only solid materials.

3) COLOR DIRECTION
- An almost monochromatic palette drawn from nature: warm whites, pale greys, sand, stone, muted earth tones.
- No more than 3 tones in a room, plus one natural wood tone.
- Color comes from materials themselves: the warmth of oak, the cool grey of concrete, the cream of linen.
- Pure whites are cold — use warm whites with undertones (Japanese aesthetic: kinari 生成り — natural undyed white).
- Reference: The palette of Tadao Ando's Church of the Light, Pawson's monastery at Nový Dvůr.

4) FURNITURE
- Minimal, low-profile forms with exquisite proportions. Every piece a study in restraint.
- Reference designers: John Pawson, Jasper Morrison, Naoto Fukasawa, Keiji Ashizawa.
- Solid wood construction visible and celebrated. No upholstered excess — a single cushion suffices.
- Platform beds, solid wood dining tables, floor cushions or low chairs.
- Each piece should look handmade by a master craftsman — imperfect perfection (wabi-sabi).
- Maximum 3-4 furniture pieces per room. If something can be removed, it should be.

5) LIGHTING (ESSENTIAL — LIGHT IS THE PRIMARY MATERIAL)
- Natural light is sacred. Every window becomes a composition. Shoji-screen filtered light if appropriate.
- Artificial lighting: hidden, indirect, architectural. Cove lighting, slots in walls, recessed and invisible.
- No decorative light fixtures unless a single paper lantern (Akari by Noguchi) or a sculptural pendant.
- Warm, low color temperature (2400K-2700K). Light should feel like dawn or dusk.
- Shadows are as important as light — let them form patterns on walls and floors.
- Reference: The light quality in Tadao Ando buildings, Luis Barragán's light shafts.

6) ART & OBJECTS
- One piece of art per room maximum. It should be contemplative: a single ceramic vessel, a stone, a painting.
- Books arranged with intention — spines aligned, colors harmonious, or hidden in closed storage.
- A single branch of ikebana or a simple plant (a bonsai, a single stem in a stoneware vase).
- Objects should feel found in nature or made by hand: a river stone, a turned wooden bowl, rough pottery.
- Nothing decorative for decoration's sake. Every object has purpose or meaning.

7) DETAILS & CRAFT
- Joinery: visible and perfect — mortise and tenon, finger joints, dovetails in furniture and cabinetry.
- Hardware: hidden (push-touch doors), or minimal (simple iron pulls, leather loops).
- Edges: chamfered, eased, or knife-edge — all consistently detailed throughout.
- Storage: built-in, concealed, flush with walls. Nothing visible that doesn't need to be.
- Window coverings: linen blinds, shoji screens, or simply nothing — bare glass celebrating the view.

8) OVERALL FEELING
- Walking into this room should induce a deep exhale. Calm, clarity, presence.
- It should feel like a Japanese ryokan meets a Scandinavian woodland cabin — warm minimalism.
- Not austere or cold — WARM minimalism. The wood, the light, the linen create comfort without clutter.
- Time slows down in this space. There is nothing to distract, only beauty to notice.
- Reference: Kinfolk magazine, Cereal magazine, the homes of Axel Vervoordt.`,
  },
  {
    key: 'resort-living',
    name: 'Resort Living',
    subtitle: 'Permanent vacation, elevated',
    description: 'Four Seasons meets private villa. Indoor-outdoor flow, natural textures, warm neutrals, organic luxury. Think Aman Resorts or One&Only. Relaxed but unmistakably expensive.',
    icon: '☀',
    accentColor: '#e8927c',
    prompt: `You are performing a luxury resort redesign of this space, as if it were a private villa at Aman Tokyo, a suite at Four Seasons Bali, or an exclusive residence at One&Only Reethi Rah. The result should feel like permanent vacation — effortlessly relaxed yet unmistakably expensive. Indoor-outdoor living elevated to its highest expression.

${BASE_CONSTRAINTS}

DESIGN DIRECTION — RESORT LIVING:

1) SPATIAL PHILOSOPHY
- Rooms should feel open, airy, and connected to the outdoors (even if the actual view is urban).
- Create a sense of expansiveness through low furniture, open sight lines, and breathing room.
- The distinction between inside and outside should blur — natural materials flowing throughout.
- Every space should invite you to sit, recline, and exhale. Comfort is the ultimate luxury.
- Think: an Aman resort's combination of architectural rigor and sensory indulgence.

2) MATERIAL PALETTE
- Primary: Natural teak wood, rattan, woven seagrass, raw linen, travertine, coral stone
- Secondary: Terrazzo, hand-troweled plaster (lime wash), woven leather, raw silk, bamboo
- Accent: Burnished bronze, aged brass, hand-thrown ceramics, volcanic stone
- Floors: Wide-plank reclaimed teak, honed travertine, pale limestone, or polished concrete
- Avoid: Anything plastic, chrome, high-gloss, or visually cold. No synthetic fabrics.

3) COLOR DIRECTION
- An organic, sun-bleached palette: warm sand, driftwood grey, coconut cream, terracotta, sage green.
- All colors should look like they were extracted from nature — stone, shell, bark, dried grass.
- Accent through natural materials rather than paint: the coral of a clay vessel, the green of a tropical leaf.
- Whites are warm and slightly yellowed — like sun-bleached linen, not hospital white.
- Reference: The Aman palette, Kelly Wearstler's Malibu work, Bali's Potato Head Studios.

4) FURNITURE
- Low-slung, generously proportioned pieces that invite lounging and gathering.
- Teak and rattan statement pieces: daybeds, wide armchairs, low coffee tables.
- Outdoor-quality materials used indoors: weathered teak, woven rope, canvas cushions.
- Oversized cushions and bolsters — abundant but not cluttered. Every seat should feel like a nest.
- Reference: JANUS et Cie, Kettal, Paola Lenti, Dedon — resort furniture at the highest level.
- Dining: long communal tables in solid wood, woven chairs, pendant lighting creating intimacy.

5) LIGHTING
- Warm, golden-hour lighting throughout — the space should always feel like sunset.
- Lantern-style pendants, woven rattan shades, candle-like wall sconces.
- Hidden uplighting on plants and architectural features. Indirect glow, never harsh spots.
- Color temperature: 2400K-2700K exclusively. The warmth of candlelight.
- If there are windows, ensure the interior lighting complements natural light, not competes with it.
- Statement: oversized woven pendant lamps, paper lanterns, or organic-form fixtures.

6) NATURE & GREENERY (ESSENTIAL FOR THIS STYLE)
- Lush, tropical, or Mediterranean plants: fiddle-leaf figs, birds of paradise, olive trees, palms.
- Plants should be large-scale, mature, and abundant — not token. This is a garden that moved inside.
- Planters: terracotta, woven baskets, stone vessels — never plastic or cheap ceramic.
- Fresh flowers: tropical arrangements, orchids, or simple branches in sculptural vases.
- Natural elements: coral, driftwood, river stones used as decorative accents.

7) TEXTILES & COMFORT
- Linen everywhere: curtains, bedding, slipcovers, cushions — all in natural, undyed, or muted tones.
- Layered textures: woven throws, textured cushions, jute rugs, sisal carpets.
- Window treatments: flowing sheer linen curtains that billow, suggesting an ocean breeze.
- Bedding (if applicable): white linen sheets with raw-edge texture, layered with woven throws.
- Towels and bath textiles: spa-grade, chunky weave, warm cream or natural tones.

8) OVERALL FEELING
- Walking into this room should feel like checking into the world's most exclusive resort.
- Relaxation is mandatory — the space demands that you slow down and decompress.
- Sensory luxury: the texture of linen, the warmth of wood, the scent of tropical air implied.
- Not themed or kitschy — this is resort ELEVATED. No tiki, no coastal clichés.
- Reference: Condé Nast Traveller's Gold List properties, Monocle's hotel reviews.`,
  },
  {
    key: 'urban-penthouse',
    name: 'Urban Penthouse',
    subtitle: 'City living at its apex',
    description: 'Manhattan meets Milan. Sleek surfaces, city-view oriented, dramatic scale. Think Tom Ford\'s apartment or One57 model units. Dark sophistication, metallic accents, statement lighting.',
    icon: '▲',
    accentColor: '#64748b',
    prompt: `You are performing an urban penthouse redesign of this space, as if it occupied the top floor of a Manhattan or Milan high-rise — a residence for someone who demands uncompromising sophistication. Think Tom Ford's London apartment, the model residences at 432 Park Avenue, or a Boffi-designed Milan penthouse. Dark, sleek, powerful, and razor-precise.

${BASE_CONSTRAINTS}

DESIGN DIRECTION — URBAN PENTHOUSE:

1) SPATIAL PHILOSOPHY
- Dramatic scale and proportion: even modest spaces should feel expansive and cinematic.
- Strong horizontal and vertical lines: rooms should feel architecturally composed.
- Views (real or implied) are the focal point — everything orients toward the window or opens up to it.
- Masculine energy balanced with refinement: powerful but not aggressive, dark but not oppressive.
- Think: the apartment of someone who runs things — controlled, precise, and impeccable.

2) MATERIAL PALETTE
- Primary: Dark-stained oak or walnut, polished Nero Marquina marble, smoked glass, gunmetal steel
- Secondary: Brushed bronze, antiqued mirror, dark plaster (Venetian in charcoal), leather (black, cognac, or navy)
- Accent: Polished chrome (minimal), backlit panels, lacquered surfaces in deep colors
- Floors: Herringbone dark oak, large-format dark stone, or polished concrete (dark grey)
- Avoid: Light woods, bright colors, anything that reads "cozy" or "relaxed"

3) COLOR DIRECTION
- Dark, moody, sophisticated: charcoal, black, deep navy, dark olive, espresso, graphite.
- Contrast through material and sheen, not hue: matte black wall beside gloss black cabinet.
- Metallic accents — bronze, brass, and steel — provide warmth and light in the dark palette.
- If a lighter tone appears, it's stone (pale marble) or a neutral textile providing contrast.
- Reference: Tom Ford interiors, the palettes of Joseph Dirand, Rodolphe Parente.

4) FURNITURE
- Sleek, low-profile, and architecturally precise. Italian design sensibility.
- Reference: Minotti, B&B Italia, Poliform, Molteni&C — the best of Italian contemporary.
- Sofas: deep, modular, in dark leather or charcoal wool. Perfect proportions.
- Dining: dramatic table (dark stone or dark wood) with sculptural chairs.
- Case goods: lacquered, dark wood, or metal with precision engineering and minimal hardware.
- A statement piece: an iconic design chair (Le Corbusier LC4, Mies van der Rohe Barcelona) as accent.

5) LIGHTING (THEATRICAL — THIS SPACE PERFORMS)
- Dramatic and controlled: the space should feel like a stage set with perfect lighting design.
- Statement pendants and chandeliers: architectural, oversized, or sculptural (not decorative/ornate).
- Indirect lighting: LED strips in recesses, under floating credenzas, behind backlit onyx panels.
- Track lighting with precise spots on art — gallery-quality illumination.
- Color temperature: 2700K-3000K. Warm enough to be inviting, cool enough to feel urban.
- Reference: Flos, Moooi, Tom Dixon — sculptural lighting that commands attention.

6) ART & OBJECTS
- Large-scale contemporary art: oversized photographs, bold abstracts, or statement sculpture.
- Art is curated with gallery precision — properly lit, properly spaced, museum-quality framing.
- Accessories: few and significant — a bronze sculpture, a stack of oversized art books, a crystal decanter.
- Nothing small or fussy. Everything at scale. Confidence in every placement.
- Technology integrated and invisible: hidden screens, flush-mount speakers, automated systems implied.

7) DETAILS & CRAFT
- Precision is everything: perfectly mitered corners, seamless joints, invisible hardware.
- Cabinetry: handleless (push-to-open) or with minimal integrated pulls in brushed metal.
- Wall panels: dark wood or upholstered in leather/fabric for acoustic luxury.
- Window treatments: motorized roller blinds or floor-to-ceiling sheers in dark grey/charcoal.
- Bathroom fixtures (if visible): Boffi, CEA Design, or Fantini — architectural and minimal.

8) OVERALL FEELING
- Walking into this room should feel like entering a power player's private domain.
- Controlled, curated, and undeniably expensive. Every surface whispers authority.
- Not cold — the warmth comes from the richness of materials: leather, bronze, dark wood.
- Cinematic and editorial — every angle is a photograph.
- Reference: AD Italia, Elle Decor Italia, the residential work of Joseph Dirand and Vincent Van Duysen.`,
  },
  {
    key: 'coastal-modern',
    name: 'Coastal Modern',
    subtitle: 'Where land meets luxury',
    description: 'Malibu Colony meets Nobu. Light-filled, ocean-inspired palette, natural stone and weathered wood elevated to couture level. Think Kelly Wearstler\'s beach aesthetic.',
    icon: '◎',
    accentColor: '#5eadb0',
    prompt: `You are performing a coastal modern redesign of this space, as if it were a beachfront estate in Malibu Colony or a private villa overlooking the Aegean. This is NOT casual "beach house" — this is coastal luxury at its highest expression. Think Kelly Wearstler's oceanfront work, Nobu Hotel Malibu, or the private residences at Amanzoe Greece. Light, texture, and the eternal dialogue between land and sea.

${BASE_CONSTRAINTS}

DESIGN DIRECTION — COASTAL MODERN:

1) SPATIAL PHILOSOPHY
- Light is the protagonist: the space should feel sun-drenched and luminous at every hour.
- Open, flowing floor plans with strong indoor-outdoor connection (implied even if windows are limited).
- Organic forms and curved elements soften architectural rigidity — rounded furniture and curved decor (door and window openings keep their shape).
- The ocean isn't referenced literally (no seashells, no anchors) — it's evoked through light, color, and texture.
- Think: the architectural purity of a Greek island villa meeting California's relaxed luxury.

2) MATERIAL PALETTE
- Primary: Bleached or whitewashed oak, natural limestone, white plaster (lime wash), linen
- Secondary: Coquina shell stone, driftwood-finish wood, woven rope, blue stone, terrazzo (pale aggregate)
- Accent: Oxidized copper, verdigris bronze, sea glass tones in ceramic, mother of pearl
- Floors: Wide-plank bleached oak, pale limestone (honed), or whitewashed concrete
- Avoid: Dark colors, heavy materials, anything that blocks light or feels enclosed

3) COLOR DIRECTION
- An oceanic palette at sunrise: soft whites, warm sand, pale blue-grey, seafoam, washed denim blue.
- Dominant whites and creams — but never cold. These are sun-warmed whites.
- Blues enter as accents: a pillow, a ceramic, a piece of art — never overwhelming the neutrals.
- Earth tones ground the palette: warm tans, driftwood grey, bleached terracotta.
- Reference: Kelly Wearstler's Malibu work, Jeremiah Brent's beach houses, Greek island architecture.

4) FURNITURE
- Relaxed but refined: overscale proportions, deep seats, generous cushions.
- Natural materials: bleached oak frames, woven seats, linen slipcovers with lived-in elegance.
- Curved silhouettes: rounded sofas, oval tables, organic-form chairs.
- Outdoor-grade materials used indoors: teak, marine rope, Sunbrella in luxury applications.
- Reference: RH (Restoration Hardware) Beach House at its best, CB2's coastal line, custom pieces.
- Dining: whitewashed wood table, woven chairs, a sculptural pendant in organic materials.

5) LIGHTING
- Natural light maximized: sheer curtains only, no heavy drapes blocking windows.
- Warm, diffused artificial light: woven pendants, alabaster sconces, ceramic table lamps.
- Hidden LED strips under shelves, behind headboards and along toe-kicks — creating a soft ambient glow like reflected water light.
- Color temperature: 2700K-3000K. Golden and warm, like afternoon sun.
- Statement fixture: a large woven pendant or sculptural organic-form chandelier as centerpiece.
- Candle-like fixtures and lanterns adding to the relaxed, warm atmosphere.

6) ART & NATURE
- Ocean-inspired art: abstract seascapes, aerial beach photography, watercolor studies, ceramic sculpture.
- Scale: large pieces that evoke the vastness of the ocean and sky.
- Natural objects: large coral specimens, smooth stones, driftwood pieces — displayed as sculpture.
- Plants: Mediterranean or tropical — olive branches, eucalyptus, succulents, palm fronds.
- Planters: terracotta, hand-formed ceramic, woven baskets, stone vessels.

7) TEXTILES & TEXTURE
- Linen is king: curtains, upholstery, bedding, cushions — all in natural or washed linen.
- Layered textures: chunky knit throws, woven jute rugs, cotton gauze, raw silk accents.
- Rugs: natural fiber (jute, sisal) or pale wool in organic patterns.
- Bedding: all-white linen with textured layers — waffle weave, gauze, raw-edge finishing.
- Window treatments: flowing sheer linen, floor-to-ceiling, in white or the palest sand.

8) OVERALL FEELING
- Walking into this room should feel like a perfect beach morning — fresh, bright, and serene.
- Luxury without effort: nothing looks "decorated" — it looks like it simply belongs.
- Sensory richness through texture, not color or pattern.
- Healthy, clean, elemental — the space breathes and glows.
- Reference: Condé Nast Traveller's best coastal hotels, Cereal magazine, Kinfolk's summer editions.`,
  },
  {
    key: 'executive-modern',
    name: 'Executive Modern',
    subtitle: 'Command presence, refined taste',
    description: 'Corporate luxury meets residential warmth. Think WeWork meets Soho House, but for a private estate. Premium office-grade finishes, integrated tech, power meeting spaces that happen to be bedrooms and kitchens.',
    icon: '■',
    accentColor: '#9ca3af',
    prompt: `You are performing an executive modern redesign of this space, as if it were the private residence of a Fortune 500 CEO or tech founder who demands both professional gravitas and residential comfort. Think the members' floor at Soho House, the design language of Aesop retail, or a Bloomberg terminal room reimagined as a living space. Precision, efficiency, and quiet authority — where every material choice signals competence.

${BASE_CONSTRAINTS}

DESIGN DIRECTION — EXECUTIVE MODERN:

1) SPATIAL PHILOSOPHY
- Clean, organized, and purposeful. Every element has a reason for being there.
- Grid-based thinking: alignments, proportional spacing, visual order that calms the executive mind.
- Integration of work and living: spaces that transition seamlessly between professional and personal use.
- Technology is ever-present but invisible — built in, not bolted on.
- Think: the private office of someone whose taste is their calling card — understated and authoritative.

2) MATERIAL PALETTE
- Primary: Warm grey oak (quarter-sawn), brushed aluminum, honed basalt, woven wool
- Secondary: Leather (matte black, dark tan, or navy), brushed stainless steel, acoustic felt panels
- Accent: Blackened steel, concrete, polished chrome hardware, smoked glass
- Floors: Engineered wide-plank grey oak, large-format porcelain (stone look), or polished concrete
- Avoid: Anything fussy, decorative, or overtly luxurious. No crystal, no gilt, no excess.

3) COLOR DIRECTION
- A sophisticated grey-scale palette with warm undertones: warm greys, charcoal, taupe, black, warm white.
- Accent through material contrast: the warmth of tan leather against cool grey steel, warm oak against black metal.
- No bright colors. If color appears, it's through a single piece of art or a carefully chosen book collection.
- Reference: the palettes of Aesop stores, MUJI hotel rooms, the offices of Norm Architects.
- Everything should look like it could appear in Monocle magazine's workspace features.

4) FURNITURE
- Precision-engineered, architectural furniture with clean geometry.
- Desks and work surfaces: large, generous, beautifully detailed (solid wood with metal legs, or floating designs).
- Seating: supportive and refined — not plush lounging, but considered comfort. Think Vitra, Herman Miller, Fritz Hansen.
- Storage: abundant, built-in, organized. Credenzas, wall units, concealed wardrobes — everything has its place.
- Conference-dining tables that serve both purposes: long, authoritative, well-lit.
- Reference: USM Haller, Bulthaup, Vitsœ — systems thinking applied to residential furniture.

5) LIGHTING
- Task-oriented and architectural: every light serves a purpose.
- Desktop: architect lamps (Artemide Tolomeo, Flos Kelvin) as functional accents.
- Ambient: linear recessed lighting, LED strips under floating shelves.
- Pendant: geometric, minimal — a single statement fixture in dark metal or brushed aluminum.
- Color temperature: 3000K-3500K — crisp and clear, like a well-lit studio or gallery.
- Smart lighting implied: scenes, automation, adjustable intensity — technology serving function.

6) ART & OBJECTS
- Minimal, impactful: large-format black and white photography, architectural prints, abstract compositions.
- Books: extensively curated — art, architecture, design, and industry references. Properly shelved.
- Desktop objects: architectural models, design prototypes, premium stationery, a quality pen.
- Technology displayed as object: a beautiful monitor, premium headphones on a stand, a record player.
- Nothing mass-market or generic. Every object is a considered choice.

7) DETAILS & TECHNOLOGY
- Cable management is immaculate — nothing visible, everything routed.
- Hardware: minimal, consistent — matte black or brushed stainless throughout.
- Acoustic treatment: felt panels, wood slat walls, textured surfaces that absorb sound.
- Smart home interfaces: flush-mount controls, hidden speakers, integrated screens.
- Climate and air quality implied: the space feels precisely controlled and comfortable.
- Cabinetry: handleless or with minimal pulls, soft-close everything.

8) OVERALL FEELING
- Walking into this room should feel like walking into the office of someone who gets things done — brilliantly.
- Efficiency and taste coexist: nothing wasted, nothing missing.
- Respect for time: the space is optimized, organized, and ready.
- Not corporate — residential warmth with professional DNA.
- Reference: Monocle, Kinfolk's workspace features, the offices designed by Norm Architects.`,
  },
];

export function getStyleByKey(key) {
  return DESIGN_STYLES.find(s => s.key === key);
}
