"use client"

import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react"

/**
 * Onboarding illustrations: ink line work over sprayed terracotta glows, light hatching and
 * soft cast shadows. Every scene shares the same horizon and a dotted terracotta path along
 * the ground, so the three screens read as one continuous journey.
 * Decorative only (aria-hidden); the screen copy carries the meaning.
 */

const INK = "#1A1410"
const ACCENT = "#C75B3A"
const MUTED = "#A89580"
const CREAM = "#F7F3EE"
const BLUSH = "#FFE8DC"
const LAMP = "#F6B08A"

/** Shared filters/gradients. `p` prefixes ids so two scenes on a page never collide. */
function TextureDefs({ p }: { p: string }) {
  return (
    <defs>
      <filter id={`${p}-spray`} x="-15%" y="-15%" width="130%" height="130%" colorInterpolationFilters="sRGB">
        <feTurbulence type="fractalNoise" baseFrequency="1.15" numOctaves={2} seed={7} result="n" />
        <feColorMatrix
          in="n"
          type="matrix"
          values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -2.6 0 0 0 1.78"
          result="dots"
        />
        <feComposite in="SourceGraphic" in2="dots" operator="in" />
      </filter>
      <radialGradient id={`${p}-sky`} cx="0.5" cy="0.62" r="0.62">
        <stop offset="0" stopColor="#F2BFA2" stopOpacity="0.5" />
        <stop offset="0.6" stopColor="#F2BFA2" stopOpacity="0.2" />
        <stop offset="1" stopColor={CREAM} stopOpacity="0" />
      </radialGradient>
      {/* Fades the left and right edges so a scene never reads as a boxed picture. */}
      <linearGradient id={`${p}-edgefade`} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#fff" stopOpacity="0" />
        <stop offset="0.06" stopColor="#fff" stopOpacity="1" />
        <stop offset="0.94" stopColor="#fff" stopOpacity="1" />
        <stop offset="1" stopColor="#fff" stopOpacity="0" />
      </linearGradient>
      <mask id={`${p}-edges`} maskUnits="userSpaceOnUse" x="0" y="0" width="390" height="1000">
        <rect x="0" y="0" width="390" height="1000" fill={`url(#${p}-edgefade)`} />
      </mask>
      <radialGradient id={`${p}-glow`}>
        <stop offset="0" stopColor="#EE7F50" stopOpacity="0.95" />
        <stop offset="0.45" stopColor={ACCENT} stopOpacity="0.38" />
        <stop offset="1" stopColor={ACCENT} stopOpacity="0" />
      </radialGradient>
      <radialGradient id={`${p}-soft`}>
        <stop offset="0" stopColor="#F3A47C" stopOpacity="0.65" />
        <stop offset="1" stopColor="#F3A47C" stopOpacity="0" />
      </radialGradient>
      <radialGradient id={`${p}-steam`}>
        <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.95" />
        <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
      </radialGradient>
      <radialGradient id={`${p}-shadow`}>
        <stop offset="0" stopColor={INK} stopOpacity="0.42" />
        <stop offset="1" stopColor={INK} stopOpacity="0" />
      </radialGradient>
      <radialGradient id={`${p}-barrel`} cx="0.4" cy="0.36" r="0.66">
        <stop offset="0.5" stopColor="#A8472B" stopOpacity="0" />
        <stop offset="1" stopColor="#7A3420" stopOpacity="0.5" />
      </radialGradient>
      <linearGradient id={`${p}-cyl`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.7" />
        <stop offset="0.38" stopColor={ACCENT} stopOpacity="0" />
        <stop offset="1" stopColor="#8A3B24" stopOpacity="0.5" />
      </linearGradient>
      <linearGradient id={`${p}-wall`} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor={ACCENT} stopOpacity="0" />
        <stop offset="1" stopColor="#8A3B24" stopOpacity="0.32" />
      </linearGradient>
      <linearGradient id={`${p}-ground`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#C79C80" stopOpacity="0.55" />
        <stop offset="1" stopColor="#EDE8E2" stopOpacity="0" />
      </linearGradient>
      <pattern id={`${p}-hatch`} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(40)">
        <path d="M0 0 V5" stroke={INK} strokeWidth="0.8" strokeOpacity="0.38" />
      </pattern>
    </defs>
  )
}

/**
 * Each scene is drawn 390 wide and grows taller to fill whatever space the screen leaves it.
 * At the compact height the scene matches the original framing; as it gets taller the subjects
 * scale up from the ground and the sky elements (sun, calendar, moon) rise into the new space,
 * so a large phone gets a full-height illustration instead of a strip under empty cream.
 * When the space is shorter than the compact framing, the whole scene shrinks to fit.
 */
function useSceneHeight(min: number, max: number) {
  const ref = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState(min)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === "undefined") return
    const update = (width: number, boxHeight: number) => {
      if (width <= 0 || boxHeight <= 0) return
      const fitted = Math.min(max, Math.max(min, (boxHeight / width) * 390))
      setHeight(Math.round(fitted))
    }
    const rect = el.getBoundingClientRect()
    update(rect.width, rect.height)
    const observer = new ResizeObserver(([entry]) => update(entry.contentRect.width, entry.contentRect.height))
    observer.observe(el)
    return () => observer.disconnect()
  }, [min, max])

  // 0 at the compact framing, 1 at the tallest.
  const t = (height - min) / (max - min)
  return { ref, height, t }
}

/** Scale around a point (used to grow subjects from where they meet the ground). */
function about(cx: number, cy: number, scale: number) {
  return `translate(${cx} ${cy}) scale(${scale}) translate(${-cx} ${-cy})`
}

function Scene({
  p,
  sceneRef,
  height,
  className,
  children,
}: {
  p: string
  sceneRef: RefObject<HTMLDivElement | null>
  height: number
  className?: string
  children: ReactNode
}) {
  return (
    <div ref={sceneRef} className={className}>
      <svg
        viewBox={`0 0 390 ${height}`}
        preserveAspectRatio="xMidYMax meet"
        fill="none"
        aria-hidden="true"
        focusable="false"
        className="h-full w-full"
      >
        <TextureDefs p={p} />
        <g mask={`url(#${p}-edges)`}>{children}</g>
      </svg>
    </div>
  )
}

const line = {
  stroke: INK,
  strokeWidth: 2.25,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  fill: "none",
}

/** Screen 1: a home with a backyard sauna, a pin (discover) and a calendar of booked days (host). */
export function IntroIllustration({ className }: { className?: string }) {
  const p = "ob1"
  const { ref, height, t } = useSceneHeight(260, 500)
  const ground = "M0 228 C120 222 260 234 390 226"
  const drop = height - 260 // ground moves down with the taller frame
  const grow = 1 + 0.22 * t // house and sauna
  const sky = drop * 0.32 // sun and calendar rise less than the ground drops
  const floatScale = 1 + 0.18 * t
  return (
    <Scene p={p} sceneRef={ref} height={height} className={className}>
      <rect x="0" y="0" width="390" height={height - 30} fill={`url(#${p}-sky)`} />

      {/* sun */}
      <g transform={`translate(${6 * t} ${sky}) ${about(40, 52, floatScale)}`}>
        <circle cx="40" cy="52" r="90" fill={`url(#${p}-soft)`} filter={`url(#${p}-spray)`} />
        <circle cx="40" cy="52" r="16" {...line} fill={BLUSH} />
      </g>

      {/* calendar */}
      <g transform={`translate(${-14 * t} ${sky}) ${about(335, 85, floatScale)}`}>
        <rect x="296" y="52" width="78" height="66" rx="10" fill="#FFFFFF" />
        <rect x="301" y="58" width="78" height="66" rx="10" fill={INK} opacity="0.08" filter={`url(#${p}-spray)`} />
        <g {...line}>
          <rect x="296" y="52" width="78" height="66" rx="10" />
          <path d="M296 68 H374 M314 46 V56 M356 46 V56" />
          <circle cx="312" cy="84" r="5" stroke={MUTED} />
          <circle cx="334" cy="84" r="5" fill={ACCENT} stroke={ACCENT} />
          <circle cx="356" cy="84" r="5" stroke={MUTED} />
          <circle cx="312" cy="102" r="5" fill={ACCENT} stroke={ACCENT} />
          <circle cx="334" cy="102" r="5" stroke={MUTED} />
          <circle cx="356" cy="102" r="5" fill={ACCENT} stroke={ACCENT} />
        </g>
      </g>

      <g transform={`translate(0 ${drop})`}>
        <circle cx="270" cy="190" r="120" fill={`url(#${p}-glow)`} opacity="0.45" filter={`url(#${p}-spray)`} />
        <circle cx="135" cy="180" r="90" fill={`url(#${p}-soft)`} opacity="0.7" filter={`url(#${p}-spray)`} />

        <path d={`${ground} L390 260 L0 260 Z`} fill="#EDE8E2" />
        <path d={`${ground} L390 250 L0 250 Z`} fill={`url(#${p}-ground)`} filter={`url(#${p}-spray)`} />
        <g {...line}>
          <path d={ground} />
          <path
            d="M0 242 C70 248 120 236 150 236 C200 236 230 246 270 240 C320 234 350 244 390 240"
            stroke={ACCENT}
            strokeWidth="3.2"
            strokeDasharray="0.5 9"
          />
          <path d="M352 229 l3 -8 M358 229 l-2 -7 M20 229 l2 -7 M26 229 l-3 -8" strokeWidth="1.5" strokeOpacity="0.7" />
        </g>

        {/* tree */}
        <g transform={about(34, 228, grow)} {...line}>
          <path d="M34 228 V204" />
          <circle cx="34" cy="194" r="12" />
        </g>

        {/* house */}
        <g transform={about(128, 228, grow)}>
          <ellipse cx="150" cy="232" rx="96" ry="8" fill={`url(#${p}-shadow)`} filter={`url(#${p}-spray)`} />
          <path d="M70 228 V150 L135 104 L200 150 V228 Z" fill={CREAM} />
          <rect x="135" y="150" width="65" height="78" fill={`url(#${p}-wall)`} filter={`url(#${p}-spray)`} />
          <path d="M135 104 L200 150 H135 Z" fill={`url(#${p}-hatch)`} />
          <circle cx="101" cy="175" r="26" fill={`url(#${p}-soft)`} filter={`url(#${p}-spray)`} />
          <circle cx="169" cy="175" r="26" fill={`url(#${p}-soft)`} filter={`url(#${p}-spray)`} />
          <g {...line}>
            <path d="M70 228 V150 L135 104 L200 150 V228" />
            <path d="M172 128 V110 H184 V136" />
            <rect x="123" y="186" width="24" height="42" rx="3" />
            <rect x="88" y="164" width="26" height="22" rx="3" fill={LAMP} />
            <rect x="156" y="164" width="26" height="22" rx="3" fill={LAMP} />
          </g>
        </g>

        {/* backyard sauna with the pin */}
        <g transform={about(282, 228, grow)}>
          <ellipse cx="284" cy="232" rx="66" ry="6" fill={`url(#${p}-shadow)`} filter={`url(#${p}-spray)`} />
          <rect x="222" y="184" width="104" height="44" rx="22" fill={CREAM} />
          <rect x="222" y="184" width="104" height="44" rx="22" fill={`url(#${p}-cyl)`} filter={`url(#${p}-spray)`} />
          <circle cx="262" cy="140" r="34" fill={`url(#${p}-glow)`} opacity="0.5" filter={`url(#${p}-spray)`} />
          <ellipse cx="311" cy="150" rx="14" ry="18" fill={`url(#${p}-steam)`} filter={`url(#${p}-spray)`} />
          <g {...line}>
            <rect x="222" y="184" width="104" height="44" rx="22" />
            <path d="M246 185 V227 M274 185 V227 M302 185 V227" />
            <path d="M306 184 V168 H316 V184" />
            <path d="M311 160 C304 150 318 144 311 134" stroke={MUTED} />
            <ellipse cx="262" cy="176" rx="12" ry="3" stroke={ACCENT} strokeWidth="1.5" />
            <path d="M262 172 C262 172 244 152 244 139 A18 18 0 0 1 280 139 C280 152 262 172 262 172 Z" fill={ACCENT} />
            <circle cx="262" cy="139" r="6" fill={CREAM} />
          </g>
        </g>
      </g>
    </Scene>
  )
}

/** Screen 2: a phone with a chosen time beside the round sauna, door lit, steam rising. */
export function ExperienceIllustration({ className }: { className?: string }) {
  const p = "ob2"
  const { ref, height, t } = useSceneHeight(260, 500)
  const ground = "M0 228 C120 222 260 234 390 226"
  const drop = height - 260
  const grow = 1 + 0.24 * t
  const sky = drop * 0.85 // the spark stays level with the top of the phone
  const moonLift = drop * 0.38
  return (
    <Scene p={p} sceneRef={ref} height={height} className={className}>
      <rect x="0" y="0" width="390" height={height - 30} fill={`url(#${p}-sky)`} />

      {/* moon: rises into the open sky on tall screens */}
      <g transform={`translate(${-18 * t} ${moonLift}) ${about(352, 47, 1 + 0.35 * t)}`}>
        <circle cx="350" cy="46" r="40" fill={`url(#${p}-soft)`} opacity="0.75" filter={`url(#${p}-spray)`} />
        <path d="M358 32 A16 16 0 1 0 358 62 A12 12 0 1 1 358 32 Z" {...line} fill={BLUSH} />
      </g>
      {/* spark between phone and sauna */}
      <g transform={`translate(${-10 * t} ${sky})`} {...line}>
        <path d="M196 54 V62 M192 58 H200" stroke={ACCENT} />
      </g>

      <g transform={`translate(0 ${drop})`}>
        <path d={`${ground} L390 260 L0 260 Z`} fill="#EDE8E2" />
        <path d={`${ground} L390 250 L0 250 Z`} fill={`url(#${p}-ground)`} filter={`url(#${p}-spray)`} />
        <ellipse cx="266" cy="232" rx="110" ry="12" fill={`url(#${p}-glow)`} opacity="0.65" filter={`url(#${p}-spray)`} />
        <g {...line}>
          <path d={ground} />
          <path
            d="M0 242 C40 246 80 240 104 236 C160 228 190 246 230 238 C300 226 340 244 390 240"
            stroke={ACCENT}
            strokeWidth="3.2"
            strokeDasharray="0.5 9"
          />
          <path d="M20 229 l2 -7 M26 229 l-3 -8 M362 228 l3 -8 M368 228 l-2 -6" strokeWidth="1.5" strokeOpacity="0.7" />
        </g>

        {/* phone */}
        <g transform={about(104, 228, grow)}>
          <circle cx="104" cy="130" r="110" fill={`url(#${p}-soft)`} opacity="0.8" filter={`url(#${p}-spray)`} />
          <ellipse cx="116" cy="231" rx="70" ry="8" fill={`url(#${p}-shadow)`} filter={`url(#${p}-spray)`} />
          <rect x="52" y="30" width="104" height="198" rx="18" fill="#FFFFFF" />
          <rect x="52" y="30" width="104" height="198" rx="18" fill={`url(#${p}-wall)`} opacity="0.7" filter={`url(#${p}-spray)`} />
          <ellipse cx="104" cy="119" rx="58" ry="22" fill={`url(#${p}-glow)`} opacity="0.55" filter={`url(#${p}-spray)`} />
          <g {...line}>
            <rect x="52" y="30" width="104" height="198" rx="18" />
            <path d="M92 44 H116" />
            <circle cx="74" cy="64" r="7" />
            <circle cx="94" cy="64" r="7" fill={ACCENT} stroke={ACCENT} />
            <circle cx="114" cy="64" r="7" />
            <circle cx="134" cy="64" r="7" />
            <rect x="68" y="84" width="72" height="18" rx="9" />
            <rect x="68" y="110" width="72" height="18" rx="9" fill={ACCENT} stroke={ACCENT} />
            <path d="M120 119 L124 123 L131 115" stroke={CREAM} />
            <rect x="68" y="136" width="72" height="18" rx="9" />
            <rect x="68" y="162" width="72" height="18" rx="9" stroke={MUTED} />
            <rect x="68" y="196" width="72" height="20" rx="10" fill={INK} />
          </g>
        </g>

        {/* round sauna with steam */}
        <g transform={about(266, 228, grow)}>
          <circle cx="266" cy="150" r="150" fill={`url(#${p}-glow)`} opacity="0.55" filter={`url(#${p}-spray)`} />
          <ellipse cx="280" cy="232" rx="96" ry="9" fill={`url(#${p}-shadow)`} filter={`url(#${p}-spray)`} />
          <circle cx="266" cy="150" r="70" fill={CREAM} />
          <g stroke={MUTED} strokeWidth="1" strokeOpacity="0.5">
            <clipPath id={`${p}-clip`}>
              <circle cx="266" cy="150" r="61" />
            </clipPath>
            <path
              clipPath={`url(#${p}-clip)`}
              d="M200 100 H332 M200 112 H332 M200 124 H332 M200 136 H332 M200 148 H332 M200 160 H332 M200 172 H332 M200 184 H332 M200 196 H332"
            />
          </g>
          <circle cx="266" cy="150" r="70" fill={`url(#${p}-barrel)`} filter={`url(#${p}-spray)`} />
          <path d="M244 214 V146 A22 22 0 0 1 288 146 V214 Z" fill={BLUSH} />
          <path d="M244 214 V146 A22 22 0 0 1 288 146 V214 Z" fill={`url(#${p}-glow)`} />
          <ellipse cx="266" cy="152" rx="18" ry="24" fill={LAMP} opacity="0.75" filter={`url(#${p}-spray)`} />
          <ellipse cx="248" cy="52" rx="15" ry="11" fill={`url(#${p}-steam)`} filter={`url(#${p}-spray)`} />
          <ellipse cx="267" cy="38" rx="18" ry="13" fill={`url(#${p}-steam)`} filter={`url(#${p}-spray)`} />
          <ellipse cx="285" cy="54" rx="14" ry="10" fill={`url(#${p}-steam)`} filter={`url(#${p}-spray)`} />
          <g {...line}>
            <path d="M232 210 L220 228 M300 210 L312 228" />
            <circle cx="266" cy="150" r="70" />
            <circle cx="266" cy="150" r="61" stroke={MUTED} strokeWidth="1.5" />
            <path d="M244 214 V146 A22 22 0 0 1 288 146 V214 Z" />
            <rect x="258" y="140" width="16" height="22" rx="8" fill={ACCENT} stroke={ACCENT} />
            <path d="M282 180 V190" />
            <path
              d="M248 70 C241 58 255 52 248 40 M266 64 C259 51 273 44 266 30 M284 70 C277 58 291 52 284 40"
              stroke={MUTED}
            />
          </g>
        </g>
      </g>
    </Scene>
  )
}

/** Screen 3: the round sauna (book) beside the house (host), the path running on underneath. */
export function ChooseIllustration({ className }: { className?: string }) {
  const p = "ob3"
  const { ref, height, t } = useSceneHeight(196, 330)
  const ground = "M0 172 C120 166 260 178 390 170"
  const drop = height - 196
  const grow = 1 + 0.3 * t
  return (
    <Scene p={p} sceneRef={ref} height={height} className={className}>
      <g transform={`translate(0 ${drop})`}>
        <path d={`${ground} L390 196 L0 196 Z`} fill="#EDE8E2" />
        <g {...line}>
          <path d={ground} />
          <path
            d="M0 184 C80 188 150 182 200 184 C250 186 300 182 390 180"
            stroke={ACCENT}
            strokeWidth="3.2"
            strokeDasharray="0.5 9"
          />
        </g>

        {/* round sauna */}
        <g transform={about(125, 171, grow)}>
          <circle cx="125" cy="104" r="110" fill={`url(#${p}-glow)`} opacity="0.5" filter={`url(#${p}-spray)`} />
          <ellipse cx="132" cy="174" rx="70" ry="7" fill={`url(#${p}-shadow)`} filter={`url(#${p}-spray)`} />
          <circle cx="125" cy="108" r="46" fill={CREAM} />
          <circle cx="125" cy="108" r="46" fill={`url(#${p}-barrel)`} filter={`url(#${p}-spray)`} />
          <path d="M110 148 V104 A15 15 0 0 1 140 104 V148" fill={BLUSH} />
          <path d="M110 148 V104 A15 15 0 0 1 140 104 V148" fill={`url(#${p}-glow)`} />
          <g {...line}>
            <path d="M100 150 L90 170 M150 150 L160 170" />
            <circle cx="125" cy="108" r="46" />
            <path d="M110 148 V104 A15 15 0 0 1 140 104 V148" />
            <rect x="119" y="100" width="12" height="16" rx="6" fill={ACCENT} stroke={ACCENT} />
            <path
              d="M112 50 C107 42 117 37 112 29 M125 46 C120 37 130 32 125 22 M138 50 C133 42 143 37 138 29"
              stroke={MUTED}
            />
          </g>
        </g>

        {/* plus between them */}
        <g transform={about(206, 171, grow)} {...line}>
          <path d="M206 120 V130 M201 125 H211" stroke={ACCENT} />
        </g>

        {/* house */}
        <g transform={about(282, 171, grow)}>
          <circle cx="282" cy="140" r="90" fill={`url(#${p}-soft)`} opacity="0.7" filter={`url(#${p}-spray)`} />
          <ellipse cx="292" cy="174" rx="66" ry="6" fill={`url(#${p}-shadow)`} filter={`url(#${p}-spray)`} />
          <path d="M238 171 V120 L282 86 L326 120 V171" fill={CREAM} />
          <rect x="282" y="120" width="44" height="51" fill={`url(#${p}-wall)`} filter={`url(#${p}-spray)`} />
          <path d="M282 86 L326 120 H282 Z" fill={`url(#${p}-hatch)`} />
          <g {...line}>
            <path d="M238 171 V120 L282 86 L326 120 V171" />
            <rect x="272" y="140" width="20" height="31" rx="3" />
            <rect x="248" y="128" width="18" height="16" rx="3" fill={LAMP} />
            <rect x="300" y="128" width="18" height="16" rx="3" fill={LAMP} />
          </g>
        </g>
      </g>
    </Scene>
  )
}
