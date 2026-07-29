import { describe, expect, it } from 'vitest'
import {
  buildWallRejectedFillCandidates,
  mergeHypothesesForFillStage,
  runDoorFillFilter,
  runDoorSwingFilter,
  type DoorSwingRefBand,
} from '@/cv/doors'
import {
  assembleFaceDualSpace,
  buildFaceSpaceFromComponents,
} from '@/cv/walls/rooms/face-dual-space'
import { detachEnclosedChildrenForOpeningSeeds } from '@/cv/walls/rooms/opening-seed-detach'
import type { RasterRoomComponent } from '@/cv/walls/rooms/room-raster'
import type { RoomRasterClass } from '@/cv/walls/rooms/room-ink-classify'

function component(
  label: number,
  x: number,
  y: number,
  width: number,
  height: number,
): RasterRoomComponent {
  return {
    label,
    areaPx: width * height,
    bbox: { x, y, width, height },
    touchesBorder: false,
  }
}

function run(params: {
  components: RasterRoomComponent[]
  classes: Array<[number, RoomRasterClass]>
  refBands: DoorSwingRefBand[]
  adjacency?: Map<number, Set<number>>
}) {
  return runDoorSwingFilter({
    components: params.components,
    parentMap: new Map(),
    classificationByLabel: new Map(params.classes),
    classificationGroupBy: 'component',
    refBands: params.refBands,
    sizeBand: { wallMinPx: 40, wallMaxPx: 120 },
    adjacency: params.adjacency ?? new Map(),
  })
}

describe('door-swing-filter', () => {
  it('accepteert single-seeds met aspect ±5% orientatie-agnostisch', () => {
    const result = run({
      components: [component(1, 0, 0, 80, 40), component(2, 120, 0, 40, 80)],
      classes: [
        [1, 'surface'],
        [2, 'unknown'],
      ],
      refBands: [{ aspectRef: 2, swingWpx: 70, swingHpx: 35, areaPx: 800 }],
    })

    expect(result.hypotheses).toHaveLength(2)
    expect(result.hypotheses.every((hyp) => hyp.source === 'single')).toBe(true)
    expect(result.hypotheses.every((hyp) => hyp.matchedRefIndex === 0)).toBe(true)
    expect(result.hypotheses[0]?.filledAreaPx).toBe(3200)
    expect(result.hypotheses[1]?.filledAreaPx).toBe(3200)
  })

  it('outside mag seed zijn (opening-wit); cluster-expansie neemt outside mee', () => {
    const result = run({
      components: [component(1, 0, 0, 30, 45), component(2, 30, 0, 15, 45)],
      classes: [
        [1, 'surface'],
        [2, 'outside'],
      ],
      refBands: [{ aspectRef: 1, swingWpx: 50, swingHpx: 50, areaPx: 1200 }],
      adjacency: new Map<number, Set<number>>([
        [1, new Set([2])],
        [2, new Set([1])],
      ]),
    })

    expect(result.hypotheses).toHaveLength(1)
    expect(result.hypotheses[0]?.source).toBe('cluster')
    expect(result.hypotheses[0]?.faceIds).toEqual([1, 2])
    expect(result.hypotheses[0]?.filledAreaPx).toBe(2025)
    // Opening-wit: outside telt mee als seed (size/aspect filtert mega-exterior).
    expect(result.stats.seedCount).toBeGreaterThanOrEqual(1)
  })

  it('ondersteunt per-ref parallelle filters en overlappende multi-parent clusters', () => {
    const result = run({
      components: [
        component(1, 0, 0, 30, 45),
        component(2, 45, 0, 30, 45),
        component(3, 30, 0, 15, 45),
        component(4, 160, 0, 80, 40),
      ],
      classes: [
        [1, 'surface'],
        [2, 'surface'],
        [3, 'outside'],
        [4, 'surface'],
      ],
      refBands: [
        { aspectRef: 1, swingWpx: 45, swingHpx: 45, areaPx: 900 },
        { aspectRef: 2, swingWpx: 80, swingHpx: 40, areaPx: 1200 },
      ],
      adjacency: new Map<number, Set<number>>([
        [1, new Set([3])],
        [2, new Set([3])],
        [3, new Set([1, 2])],
        [4, new Set()],
      ]),
    })

    const clusters = result.hypotheses.filter((hyp) => hyp.source === 'cluster')
    const singles = result.hypotheses.filter((hyp) => hyp.source === 'single')
    expect(clusters.some((hyp) => hyp.faceIds.join(',') === '1,3')).toBe(true)
    expect(clusters.some((hyp) => hyp.faceIds.join(',') === '2,3')).toBe(true)
    expect(singles.some((hyp) => hyp.faceIds.join(',') === '4')).toBe(true)
    expect(singles.some((hyp) => hyp.matchedRefIndex === 1)).toBe(true)
  })

  it('accepteert korte draaiboog als ref zelf kort is (ref-gestuurde min-axis relaxatie)', () => {
    const result = run({
      components: [component(7, 20, 10, 32, 74)],
      classes: [[7, 'surface']],
      refBands: [{ aspectRef: 74 / 32, swingWpx: 32, swingHpx: 74, areaPx: 1100 }],
    })

    expect(result.hypotheses).toHaveLength(1)
    expect(result.hypotheses[0]?.source).toBe('single')
    expect(result.hypotheses[0]?.faceIds).toEqual([7])
  })

  it('geeft diagnostics terug voor accepted en dropped roots', () => {
    const result = run({
      components: [component(1, 0, 0, 80, 40), component(2, 90, 0, 20, 20)],
      classes: [
        [1, 'surface'],
        [2, 'outside'],
      ],
      refBands: [{ aspectRef: 2, swingWpx: 70, swingHpx: 35, areaPx: 800 }],
    })
    const byRoot = new Map(result.diagnostics.map((row) => [row.root, row]))
    expect(byRoot.get(1)?.status).toBe('accepted_single')
    // Outside mag seed zijn; te kleine face → out-of-band of cluster-no-match (niet wall-gate).
    expect(byRoot.get(2)?.status).toMatch(
      /^rejected_(out_of_band_or_aspect|cluster_no_match|outside_or_wall)$/,
    )
  })

  it('laat wall-root toe als die strak op de deur-ref lijkt (wall-rescue)', () => {
    const result = run({
      components: [
        {
          label: 11,
          areaPx: 10225,
          bbox: { x: 0, y: 0, width: 116, height: 115 },
          touchesBorder: false,
        },
      ],
      classes: [[11, 'wall']],
      refBands: [{ aspectRef: 118 / 114, swingWpx: 114, swingHpx: 118, areaPx: 9871 }],
    })

    expect(result.hypotheses).toHaveLength(1)
    expect(result.hypotheses[0]?.source).toBe('single')
    const row = result.diagnostics.find((d) => d.root === 11)
    expect(row?.status).toBe('accepted_single')
  })

  it('wall-rescue Either: ink te dik → white geom redt (Project4 twin onder raam)', () => {
    // Ink 81×29 faalt aspect vs ref 86×24 (~22%); white 71×22 past sizeNear+fill.
    const inkComp = {
      label: 439,
      areaPx: 1437,
      bbox: { x: 1825, y: 1488, width: 81, height: 29 },
      touchesBorder: false,
    }
    const whiteComp = {
      label: 439,
      areaPx: 873,
      bbox: { x: 1831, y: 1490, width: 71, height: 22 },
      touchesBorder: false,
    }
    const classificationByLabel = new Map([[439, 'wall' as const]])
    const dual = assembleFaceDualSpace(
      buildFaceSpaceFromComponents({
        kind: 'opening-white',
        components: [whiteComp],
        classificationByLabel,
      }),
      buildFaceSpaceFromComponents({
        kind: 'wall-ink',
        components: [inkComp],
        classificationByLabel,
      }),
    )
    const result = runDoorSwingFilter({
      components: [inkComp],
      parentMap: new Map(),
      classificationByLabel,
      classificationGroupBy: 'component',
      refBands: [
        {
          aspectRef: 86 / 24,
          swingWpx: 86,
          swingHpx: 24,
          areaPx: 1072,
          wallRatio: 1,
          depthRatio: 0.27906976744186046,
          areaSpan2Ratio: 0.14494321254732287,
        },
      ],
      sizeBand: { wallMinPx: 35, wallMaxPx: 167 },
      adjacency: new Map(),
      dual,
    })

    expect(result.hypotheses).toHaveLength(1)
    expect(result.hypotheses[0]?.faceIds).toEqual([439])
    expect(result.hypotheses[0]?.unionBBox).toEqual(whiteComp.bbox)
    expect(result.hypotheses[0]?.filledAreaPx).toBe(873)
    const row = result.diagnostics.find((d) => d.root === 439)
    expect(row?.status).toBe('accepted_single')
    expect(row?.areaPx).toBe(873)
  })

  it('wall-rescue Either zonder dual: alleen ink (geen white fallback)', () => {
    const result = runDoorSwingFilter({
      components: [
        {
          label: 439,
          areaPx: 1437,
          bbox: { x: 1825, y: 1488, width: 81, height: 29 },
          touchesBorder: false,
        },
      ],
      parentMap: new Map(),
      classificationByLabel: new Map([[439, 'wall']]),
      classificationGroupBy: 'component',
      refBands: [
        {
          aspectRef: 86 / 24,
          swingWpx: 86,
          swingHpx: 24,
          areaPx: 1072,
          wallRatio: 1,
          depthRatio: 0.27906976744186046,
          areaSpan2Ratio: 0.14494321254732287,
        },
      ],
      sizeBand: { wallMinPx: 35, wallMaxPx: 167 },
      adjacency: new Map(),
    })
    expect(result.hypotheses).toHaveLength(0)
    expect(result.diagnostics.find((d) => d.root === 439)?.status).toBe('rejected_outside_or_wall')
  })

  it('houdt volle blok-wall tegen ondanks vergelijkbare bbox', () => {
    const result = runDoorSwingFilter({
      components: [
        {
          label: 12,
          areaPx: 116 * 115,
          bbox: { x: 0, y: 0, width: 116, height: 115 },
          touchesBorder: false,
        },
      ],
      parentMap: new Map(),
      classificationByLabel: new Map([[12, 'wall']]),
      classificationGroupBy: 'component',
      refBands: [{ aspectRef: 118 / 114, swingWpx: 114, swingHpx: 118, areaPx: 4000 }],
      sizeBand: { wallMinPx: 40, wallMaxPx: 120 },
      adjacency: new Map(),
    })

    expect(result.hypotheses).toHaveLength(0)
    const row = result.diagnostics.find((d) => d.root === 12)
    expect(row?.status).toBe('rejected_outside_or_wall')
  })

  it('accepteert een mild afgesneden boog als clipped-arc fallback binnen ref-band valt', () => {
    // Milde clip: aspect ~1.22 (boven de strikte 5% maar ruim binnen de
    // proportie-marge) met arc-achtige fill dicht bij de ref.
    const result = runDoorSwingFilter({
      components: [
        {
          label: 13,
          areaPx: 9000,
          bbox: { x: 0, y: 0, width: 122, height: 100 },
          touchesBorder: false,
        },
      ],
      parentMap: new Map(),
      classificationByLabel: new Map([[13, 'surface']]),
      classificationGroupBy: 'component',
      refBands: [{ aspectRef: 1.035, swingWpx: 114, swingHpx: 118, areaPx: 9871 }],
      sizeBand: { wallMinPx: 51, wallMaxPx: 155 },
      adjacency: new Map(),
      aspectToleranceRatio: 0.05,
    })

    expect(result.hypotheses).toHaveLength(1)
    expect(result.hypotheses[0]?.source).toBe('single')
    const row = result.diagnostics.find((d) => d.root === 13)
    expect(row?.status).toBe('accepted_single')
    expect(row?.score ?? 0).toBeGreaterThan(0.5)
  })

  it('weigert een disproportioneel massief blok (aspect 1.39, fill ~0.95) ondanks clipped-arc venster', () => {
    // Het BouwTek11-geval: 103x74 near-solid rechthoek (geen boog). Aspect 1.39
    // t.o.v. ref 1.035 valt buiten de proportie-marge → mag NIET als deur passeren.
    const result = runDoorSwingFilter({
      components: [
        {
          label: 13,
          areaPx: 7205,
          bbox: { x: 0, y: 0, width: 103, height: 74 },
          touchesBorder: false,
        },
      ],
      parentMap: new Map(),
      classificationByLabel: new Map([[13, 'surface']]),
      classificationGroupBy: 'component',
      refBands: [{ aspectRef: 1.035, swingWpx: 114, swingHpx: 118, areaPx: 9871 }],
      sizeBand: { wallMinPx: 51, wallMaxPx: 155 },
      adjacency: new Map(),
      aspectToleranceRatio: 0.05,
    })

    expect(result.hypotheses).toHaveLength(0)
    const row = result.diagnostics.find((d) => d.root === 13)
    expect(row?.status).not.toBe('accepted_single')
  })

  it('accepteert ondiepe wall-seed onder absolute muur-min via wall-rescue (ref-diepte)', () => {
    // Muur-as 51 < wallMin 84 (350mm), maar dicht bij ref 70×39 → under-wall-min rescue.
    const result = runDoorSwingFilter({
      components: [
        {
          label: 14,
          areaPx: 853,
          bbox: { x: 0, y: 0, width: 51, height: 29 },
          touchesBorder: false,
        },
      ],
      parentMap: new Map(),
      classificationByLabel: new Map([[14, 'wall']]),
      classificationGroupBy: 'component',
      refBands: [{ aspectRef: 1.7949, swingWpx: 70, swingHpx: 39, areaPx: 1460 }],
      sizeBand: { wallMinPx: 84, wallMaxPx: 254 },
      adjacency: new Map(),
      aspectToleranceRatio: 0.05,
    })

    expect(result.hypotheses).toHaveLength(1)
    expect(result.hypotheses[0]?.source).toBe('single')
    const row = result.diagnostics.find((d) => d.root === 14)
    expect(row?.status).toBe('accepted_single')
  })

  it('accepteert ondiepe unknown-seed onder absolute muur-min via shallow-rescue', () => {
    const result = runDoorSwingFilter({
      components: [
        {
          label: 15,
          areaPx: 853,
          bbox: { x: 0, y: 0, width: 51, height: 30 },
          touchesBorder: false,
        },
      ],
      parentMap: new Map(),
      classificationByLabel: new Map([[15, 'unknown']]),
      classificationGroupBy: 'component',
      refBands: [{ aspectRef: 1.7949, swingWpx: 70, swingHpx: 39, areaPx: 1460 }],
      sizeBand: { wallMinPx: 84, wallMaxPx: 254 },
      adjacency: new Map(),
      aspectToleranceRatio: 0.05,
    })

    expect(result.hypotheses).toHaveLength(1)
    expect(result.hypotheses[0]?.source).toBe('single')
    const row = result.diagnostics.find((d) => d.root === 15)
    expect(row?.status).toBe('accepted_single')
  })

  it('accepteert smalle ondiepe unknown-face (40x69) onder muur-min via shallow-rescue', () => {
    const result = runDoorSwingFilter({
      components: [
        {
          label: 16,
          areaPx: 1554,
          bbox: { x: 0, y: 0, width: 40, height: 69 },
          touchesBorder: false,
        },
      ],
      parentMap: new Map(),
      classificationByLabel: new Map([[16, 'unknown']]),
      classificationGroupBy: 'component',
      refBands: [{ aspectRef: 1.7949, swingWpx: 70, swingHpx: 39, areaPx: 1460 }],
      sizeBand: { wallMinPx: 84, wallMaxPx: 254 },
      adjacency: new Map(),
      aspectToleranceRatio: 0.05,
    })

    expect(result.hypotheses).toHaveLength(1)
    expect(result.hypotheses[0]?.source).toBe('single')
    const row = result.diagnostics.find((d) => d.root === 16)
    expect(row?.status).toBe('accepted_single')
  })

  it('accepteert ondiepe face ook bij 90-graden rotatie (size-band swap)', () => {
    const result = runDoorSwingFilter({
      components: [
        {
          label: 17,
          areaPx: 1647,
          bbox: { x: 0, y: 0, width: 30, height: 100 },
          touchesBorder: false,
        },
      ],
      parentMap: new Map(),
      classificationByLabel: new Map([[17, 'surface']]),
      classificationGroupBy: 'component',
      refBands: [{ aspectRef: 3.3793, swingWpx: 98, swingHpx: 29, areaPx: 1442 }],
      sizeBand: { wallMinPx: 54, wallMaxPx: 161 },
      adjacency: new Map(),
      aspectToleranceRatio: 0.05,
    })

    expect(result.hypotheses).toHaveLength(1)
    expect(result.hypotheses[0]?.source).toBe('single')
    const row = result.diagnostics.find((d) => d.root === 17)
    expect(row?.status).toBe('accepted_single')
  })

  it('absorbeert kleine aanliggende puntjes in de mask zolang union binnen marge blijft', () => {
    const result = run({
      components: [component(1, 0, 0, 45, 45), component(2, 45, 0, 5, 10)],
      classes: [
        [1, 'surface'],
        [2, 'surface'],
      ],
      refBands: [{ aspectRef: 1, swingWpx: 45, swingHpx: 45, areaPx: 2025 }],
      adjacency: new Map<number, Set<number>>([
        [1, new Set([2])],
        [2, new Set([1])],
      ]),
    })

    expect(result.hypotheses).toHaveLength(1)
    expect(result.hypotheses[0]?.source).toBe('single')
    expect(result.hypotheses[0]?.faceIds).toEqual([1, 2])
    expect(result.stats.singleAccepted).toBe(1)
  })

  it('slokt een even grote buurkamer niet op tijdens absorptie (area-guard)', () => {
    const result = run({
      components: [component(1, 0, 0, 45, 45), component(2, 45, 0, 45, 45)],
      classes: [
        [1, 'surface'],
        [2, 'surface'],
      ],
      refBands: [{ aspectRef: 1, swingWpx: 45, swingHpx: 45, areaPx: 2025 }],
      adjacency: new Map<number, Set<number>>([
        [1, new Set([2])],
        [2, new Set([1])],
      ]),
    })

    expect(result.hypotheses).toHaveLength(2)
    expect(result.hypotheses.every((hyp) => hyp.faceIds.length === 1)).toBe(true)
    const faceSets = result.hypotheses.map((hyp) => hyp.faceIds.join(','))
    expect(faceSets).toContain('1')
    expect(faceSets).toContain('2')
  })

  it('vormt cluster ook als deelvlak al binnen de min-band valt (min-verlaging mag geen cluster laten vallen)', () => {
    // Beide deelvlakken vallen binnen de min-band (45x90 → beide assen >= 40) maar
    // matchen op zichzelf niet (aspect 2.0 vs ref 1.0). Samen vormen ze 90x90 = ref.
    // Voorheen werden ze via de underMinBand-gate als out-of-band afgewezen.
    const result = run({
      components: [component(1, 0, 0, 90, 45), component(2, 0, 45, 90, 45)],
      classes: [
        [1, 'surface'],
        [2, 'surface'],
      ],
      refBands: [{ aspectRef: 1, swingWpx: 90, swingHpx: 90, areaPx: 8100 }],
      adjacency: new Map<number, Set<number>>([
        [1, new Set([2])],
        [2, new Set([1])],
      ]),
    })

    expect(
      result.hypotheses.some((hyp) => hyp.source === 'cluster' && hyp.faceIds.join(',') === '1,2'),
    ).toBe(true)
  })

  it('clustert opening-wit stroken via ink-brug (wit–wall–wit), niet via white-direct', () => {
    // Typische boogstroken: white faces raken elkaar nooit; alleen via wall-ink mid.
    const result = run({
      components: [
        component(1, 0, 0, 90, 40),
        component(2, 0, 50, 90, 40),
        component(99, 0, 40, 90, 10),
      ],
      classes: [
        [1, 'surface'],
        [2, 'surface'],
        [99, 'wall'],
      ],
      refBands: [{ aspectRef: 1, swingWpx: 90, swingHpx: 90, areaPx: 8100 }],
      adjacency: new Map<number, Set<number>>([
        [1, new Set([99])],
        [2, new Set([99])],
        [99, new Set([1, 2])],
      ]),
    })

    expect(
      result.hypotheses.some((hyp) => hyp.source === 'cluster' && hyp.faceIds.join(',') === '1,2'),
    ).toBe(true)
    // Wall mid mag niet in de hypothese belanden.
    expect(result.hypotheses.every((hyp) => !hyp.faceIds.includes(99))).toBe(true)
  })

  it('weigert een 3x opgeblazen blob die alleen op aspect matcht (ref-gebonden bovengrens)', () => {
    // ref: 70x39 (aspect ~1.79). Een 105x59 blob (1.5x) blijft binnen de
    // ref-gebonden bovengrens (2x) en wordt geaccepteerd; een 210x117 blob (3x)
    // heeft dezelfde aspect maar overschrijdt de ref-gebonden bovengrens en valt af,
    // ook al past hij nog binnen de globale maatband (max 254).
    const result = runDoorSwingFilter({
      components: [component(1, 0, 0, 105, 59), component(2, 400, 0, 210, 117)],
      parentMap: new Map(),
      classificationByLabel: new Map<number, RoomRasterClass>([
        [1, 'surface'],
        [2, 'surface'],
      ]),
      classificationGroupBy: 'component',
      refBands: [{ aspectRef: 1.7949, swingWpx: 70, swingHpx: 39, areaPx: 1460 }],
      sizeBand: { wallMinPx: 40, wallMaxPx: 254 },
      adjacency: new Map(),
      aspectToleranceRatio: 0.05,
    })

    const faceSets = result.hypotheses.map((hyp) => hyp.faceIds.join(','))
    expect(faceSets).toContain('1')
    expect(faceSets).not.toContain('2')
    expect(result.diagnostics.find((d) => d.root === 1)?.status).toBe('accepted_single')
    expect(result.diagnostics.find((d) => d.root === 2)?.status).not.toBe('accepted_single')
  })

  it('absorbeert geen buur die de union bij een ANDERE ref laat passen (per-ref absorptie)', () => {
    // Seed 129x137 matcht ref0 (bijna vierkant). De brede strook (100x20) zou de
    // union 229x137 maken, wat qua aspect bij ref1 (1.67) past. Absorptie is echter
    // aan ref0 gebonden, dus de strook wordt niet opgeslokt en de deur blijft 129 breed.
    const result = runDoorSwingFilter({
      components: [component(1, 0, 0, 129, 137), component(2, 129, 0, 100, 20)],
      parentMap: new Map(),
      classificationByLabel: new Map<number, RoomRasterClass>([
        [1, 'surface'],
        [2, 'surface'],
      ]),
      classificationGroupBy: 'component',
      refBands: [
        { aspectRef: 137 / 129, swingWpx: 129, swingHpx: 137, areaPx: 17673 },
        { aspectRef: 137 / 82, swingWpx: 137, swingHpx: 82, areaPx: 11234 },
      ],
      sizeBand: { wallMinPx: 40, wallMaxPx: 254 },
      adjacency: new Map<number, Set<number>>([
        [1, new Set([2])],
        [2, new Set([1])],
      ]),
      aspectToleranceRatio: 0.05,
    })

    const seedHyp = result.hypotheses.find((hyp) => hyp.faceIds.includes(1))
    expect(seedHyp?.faceIds).toEqual([1])
    expect(seedHyp?.unionBBox.width).toBe(129)
    expect(seedHyp?.matchedRefIndex).toBe(0)
  })

  it('geeft de grootste ref voorrang: kleine ref onderdrukt als hij geen nieuwe faces toevoegt', () => {
    // 2x2 raster van 65x65 vlakken (1..4) vormt samen 130x130 = ref1 (grote boog).
    // Vlak 5 staat los en matcht alleen ref0 (kleine boog). Ref1 heeft het grootste
    // oppervlak en gaat eerst: het clustert 1..4 tot de volle boog. In de ref0-pass
    // worden 1..4 onderdrukt (hergebruiken alleen ref1-faces zonder nieuw vlak),
    // maar vlak 5 komt door omdat het een nieuw vlak is.
    const result = runDoorSwingFilter({
      components: [
        component(1, 0, 0, 65, 65),
        component(2, 65, 0, 65, 65),
        component(3, 0, 65, 65, 65),
        component(4, 65, 65, 65, 65),
        component(5, 400, 400, 65, 65),
      ],
      parentMap: new Map(),
      classificationByLabel: new Map<number, RoomRasterClass>([
        [1, 'surface'],
        [2, 'surface'],
        [3, 'surface'],
        [4, 'surface'],
        [5, 'surface'],
      ]),
      classificationGroupBy: 'component',
      refBands: [
        { aspectRef: 1, swingWpx: 45, swingHpx: 45, areaPx: 2025 },
        { aspectRef: 1, swingWpx: 130, swingHpx: 130, areaPx: 16900 },
      ],
      sizeBand: { wallMinPx: 40, wallMaxPx: 200 },
      adjacency: new Map<number, Set<number>>([
        [1, new Set([2, 3])],
        [2, new Set([1, 4])],
        [3, new Set([1, 4])],
        [4, new Set([2, 3])],
        [5, new Set()],
      ]),
      aspectToleranceRatio: 0.05,
    })

    const bigArc = result.hypotheses.find((hyp) => hyp.matchedRefIndex === 1)
    expect(bigArc?.source).toBe('cluster')
    expect(bigArc?.faceIds).toEqual([1, 2, 3, 4])
    // Geen enkele ref0-hypothese op de faces van de grote boog:
    const smallOnBigFaces = result.hypotheses.filter(
      (hyp) => hyp.matchedRefIndex === 0 && hyp.faceIds.every((f) => f <= 4),
    )
    expect(smallOnBigFaces).toHaveLength(0)
    // Los vlak 5 mag wel als kleine boog (nieuw vlak):
    const isolated = result.hypotheses.find((hyp) => hyp.faceIds.join(',') === '5')
    expect(isolated?.matchedRefIndex).toBe(0)
  })

  it('clustert een te kleine single eerst naar de volle ref i.p.v. een verkeerde kleine deur', () => {
    // Vlak 1 (80x80) matcht de ref (120x120) al als single via de globale min-vloer,
    // maar is veel kleiner dan de ref-bbox. Samen met 2/3/4 vormt het exact 120x120.
    // Verwacht: één CLUSTER van de volle boog, niet een te kleine single-deur.
    const result = runDoorSwingFilter({
      components: [
        component(1, 0, 0, 80, 80),
        component(2, 80, 0, 40, 80),
        component(3, 0, 80, 80, 40),
        component(4, 80, 80, 40, 40),
      ],
      parentMap: new Map(),
      classificationByLabel: new Map<number, RoomRasterClass>([
        [1, 'surface'],
        [2, 'surface'],
        [3, 'surface'],
        [4, 'surface'],
      ]),
      classificationGroupBy: 'component',
      refBands: [{ aspectRef: 1, swingWpx: 120, swingHpx: 120, areaPx: 14400 }],
      sizeBand: { wallMinPx: 70, wallMaxPx: 200 },
      adjacency: new Map<number, Set<number>>([
        [1, new Set([2, 3])],
        [2, new Set([1, 4])],
        [3, new Set([1, 4])],
        [4, new Set([2, 3])],
      ]),
      aspectToleranceRatio: 0.05,
    })

    expect(result.hypotheses).toHaveLength(1)
    expect(result.hypotheses[0]?.source).toBe('cluster')
    expect(result.hypotheses[0]?.faceIds).toEqual([1, 2, 3, 4])
    expect(result.hypotheses[0]?.unionBBox.width).toBe(120)
    expect(result.hypotheses[0]?.unionBBox.height).toBe(120)
  })

  it('clustert gestapelde platte stroken naar de volle boog via clipped-arc (dubbele-deur blad)', () => {
    // Linker blad van een dubbele deur: 4 platte horizontale stroken die samen
    // 138x122 vormen — vrijwel identiek aan het rechter blad (één vlak), maar iets
    // langgerekt (aspect 1.13 > strikte 5%). De cluster-groei moet dit via de
    // clipped-arc match herkennen i.p.v. terug te vallen op een kleine ref-strook.
    const strips = [
      { label: 34, areaPx: 2644, bbox: { x: 226, y: 187, width: 97, height: 35 } },
      { label: 39, areaPx: 3330, bbox: { x: 226, y: 221, width: 122, height: 35 } },
      { label: 44, areaPx: 3550, bbox: { x: 226, y: 256, width: 134, height: 34 } },
      { label: 56, areaPx: 2140, bbox: { x: 227, y: 289, width: 137, height: 20 } },
    ].map((s) => ({ ...s, touchesBorder: false }))
    const result = runDoorSwingFilter({
      components: strips,
      parentMap: new Map(),
      classificationByLabel: new Map<number, RoomRasterClass>([
        [34, 'surface'],
        [39, 'surface'],
        [44, 'surface'],
        [56, 'surface'],
      ]),
      classificationGroupBy: 'component',
      refBands: [{ aspectRef: 1.062015503875969, swingWpx: 129, swingHpx: 137, areaPx: 13267 }],
      sizeBand: { wallMinPx: 73, wallMaxPx: 254 },
      adjacency: new Map<number, Set<number>>([
        [34, new Set([39])],
        [39, new Set([34, 44])],
        [44, new Set([39, 56])],
        [56, new Set([44])],
      ]),
      aspectToleranceRatio: 0.05,
    })

    expect(result.hypotheses).toHaveLength(1)
    expect(result.hypotheses[0]?.source).toBe('cluster')
    expect(result.hypotheses[0]?.faceIds).toEqual([34, 39, 44, 56])
    expect(result.hypotheses[0]?.unionBBox.width).toBe(138)
    expect(result.hypotheses[0]?.unionBBox.height).toBe(122)
    expect(result.hypotheses[0]?.filledAreaPx).toBe(11664)
  })

  it('accepteert onder-min ondiepe face met lichte aspect-afwijking via shallow-bonus', () => {
    const result = runDoorSwingFilter({
      components: [
        {
          label: 18,
          areaPx: 1601,
          bbox: { x: 0, y: 0, width: 100, height: 32 },
          touchesBorder: false,
        },
      ],
      parentMap: new Map(),
      classificationByLabel: new Map([[18, 'surface']]),
      classificationGroupBy: 'component',
      refBands: [{ aspectRef: 3.3793, swingWpx: 98, swingHpx: 29, areaPx: 1442 }],
      sizeBand: { wallMinPx: 54, wallMaxPx: 161 },
      adjacency: new Map(),
      aspectToleranceRatio: 0.05,
    })

    expect(result.hypotheses).toHaveLength(1)
    expect(result.hypotheses[0]?.source).toBe('single')
    const row = result.diagnostics.find((d) => d.root === 18)
    expect(row?.status).toBe('accepted_single')
  })

  it('Stage-2 wall-fill: Stage-1 rescue-fill-fail → individuele fill-kandidaat mag door', () => {
    // Size/aspect/geschaalde area OK, maar fill net onder wallRescueMinFill (0.45).
    // Stage-2 fill-band t.o.v. lagere ref-fill accepteert wél.
    const sizeBand = { wallMinPx: 40, wallMaxPx: 120 }
    const refBands: DoorSwingRefBand[] = [
      {
        aspectRef: 118 / 114,
        swingWpx: 114,
        swingHpx: 118,
        areaPx: 5000,
        swingSpanPx: 118,
      },
    ]
    const stage1 = runDoorSwingFilter({
      components: [
        {
          label: 21,
          areaPx: 2800, // fill 2800/6400 = 0.4375 < wallRescueMinFill 0.45
          bbox: { x: 10, y: 20, width: 80, height: 80 },
          touchesBorder: false,
        },
      ],
      parentMap: new Map(),
      classificationByLabel: new Map([[21, 'wall']]),
      classificationGroupBy: 'component',
      refBands,
      sizeBand,
      adjacency: new Map(),
    })
    expect(stage1.hypotheses).toHaveLength(0)
    expect(stage1.diagnostics.find((d) => d.root === 21)?.status).toBe('rejected_outside_or_wall')

    const wallFillCandidates = buildWallRejectedFillCandidates({
      diagnostics: stage1.diagnostics,
      refBands,
      sizeBand,
    })
    expect(wallFillCandidates).toHaveLength(1)
    expect(wallFillCandidates[0]?.id).toBe('door-swing-wall-fill-21')
    expect(wallFillCandidates[0]?.faceIds).toEqual([21])

    const fill = runDoorFillFilter({
      hypotheses: mergeHypothesesForFillStage({
        stage1Hypotheses: stage1.hypotheses,
        wallFillCandidates,
      }),
      refBands,
    })
    expect(fill.accepted.map((h) => h.id)).toEqual(['door-swing-wall-fill-21'])
  })

  it('ondiepe deur: area-gate schaalt met swing-span² (niet absolute ref-area)', () => {
    // Closet-ref 70×39 area 1460; kandidaat ~half span 39×23 area 498.
    // Abs relDiff ≈0.66 zou falen; geschaald expected ≈453 → relDiff ≈0.10 OK.
    const result = runDoorSwingFilter({
      components: [
        {
          label: 214,
          areaPx: 498,
          bbox: { x: 980, y: 1005, width: 39, height: 23 },
          touchesBorder: false,
        },
      ],
      parentMap: new Map(),
      classificationByLabel: new Map([[214, 'surface']]),
      classificationGroupBy: 'component',
      refBands: [
        {
          aspectRef: 70 / 39,
          swingWpx: 70,
          swingHpx: 39,
          areaPx: 1460,
          swingSpanPx: 70,
          swingAngleDeg: 30,
        },
      ],
      sizeBand: { wallMinPx: 53, wallMaxPx: 253 },
      adjacency: new Map(),
    })
    expect(result.diagnostics.find((d) => d.root === 214)?.status).toMatch(/^accepted_/)
    expect(result.hypotheses.some((h) => h.faceIds.includes(214))).toBe(true)
  })

  it('Stage-2 wall-fill: massief muurblok blijft too_full', () => {
    const sizeBand = { wallMinPx: 40, wallMaxPx: 120 }
    const refBands: DoorSwingRefBand[] = [
      { aspectRef: 118 / 114, swingWpx: 114, swingHpx: 118, areaPx: 9871 },
    ]
    const stage1 = runDoorSwingFilter({
      components: [
        {
          label: 22,
          areaPx: 116 * 115,
          bbox: { x: 0, y: 0, width: 116, height: 115 },
          touchesBorder: false,
        },
      ],
      parentMap: new Map(),
      classificationByLabel: new Map([[22, 'wall']]),
      classificationGroupBy: 'component',
      refBands,
      sizeBand,
      adjacency: new Map(),
    })
    expect(stage1.hypotheses).toHaveLength(0)

    const wallFillCandidates = buildWallRejectedFillCandidates({
      diagnostics: stage1.diagnostics,
      refBands,
      sizeBand,
    })
    expect(wallFillCandidates).toHaveLength(1)

    const fill = runDoorFillFilter({
      hypotheses: mergeHypothesesForFillStage({
        stage1Hypotheses: stage1.hypotheses,
        wallFillCandidates,
      }),
      refBands,
    })
    expect(fill.accepted).toHaveLength(0)
    expect(fill.rejected[0]?.reason).toBe('too_full')
  })

  it('Stage-2 wall-fill: Otsu-deur met aspect ~14% naast ref komt door (size-near of fill-pass)', () => {
    // De Roemer-achtig: ref-swing 98×29, Otsu-wall face 102×35 (aspect ~14% off).
    // Na muur-as/ref-diepte-band + size-near (0.18) mag Stage-1 al accepteren;
    // anders wall-fill → Stage-2 fill.
    const sizeBand = { wallMinPx: 47, wallMaxPx: 161 }
    const refBands: DoorSwingRefBand[] = [
      { aspectRef: 98 / 29, swingWpx: 98, swingHpx: 29, areaPx: 1442 },
    ]
    const stage1 = runDoorSwingFilter({
      components: [
        {
          label: 91,
          areaPx: 1852,
          bbox: { x: 814, y: 1290, width: 102, height: 35 },
          touchesBorder: false,
        },
      ],
      parentMap: new Map(),
      classificationByLabel: new Map([[91, 'wall']]),
      classificationGroupBy: 'component',
      refBands,
      sizeBand,
      adjacency: new Map(),
    })
    const wallFillCandidates = buildWallRejectedFillCandidates({
      diagnostics: stage1.diagnostics,
      refBands,
      sizeBand,
    })
    const fill = runDoorFillFilter({
      hypotheses: mergeHypothesesForFillStage({
        stage1Hypotheses: stage1.hypotheses,
        wallFillCandidates,
      }),
      refBands,
    })
    expect(fill.accepted.some((h) => h.faceIds.includes(91))).toBe(true)
  })

  it('Stage-2 wall-fill: outside-faces worden geen wall-fill kandidaat', () => {
    const sizeBand = { wallMinPx: 40, wallMaxPx: 120 }
    const refBands: DoorSwingRefBand[] = [
      { aspectRef: 1, swingWpx: 100, swingHpx: 100, areaPx: 7800 },
    ]
    const stage1 = runDoorSwingFilter({
      components: [
        {
          label: 23,
          areaPx: 7800,
          bbox: { x: 0, y: 0, width: 100, height: 100 },
          touchesBorder: false,
        },
      ],
      parentMap: new Map(),
      classificationByLabel: new Map([[23, 'outside']]),
      classificationGroupBy: 'component',
      refBands,
      sizeBand,
      adjacency: new Map(),
    })
    // Opening-wit: outside mag Stage-1 seed zijn als maat/aspect klopt.
    expect(stage1.diagnostics.find((d) => d.root === 23)?.status).toBe('accepted_single')
    // Wall-fill pass A alleen class === wall.
    expect(
      buildWallRejectedFillCandidates({
        diagnostics: stage1.diagnostics,
        refBands,
        sizeBand,
      }),
    ).toHaveLength(0)
  })

  it('mergeHypothesesForFillStage skipt faces die Stage-1 al claimde', () => {
    const stage1 = [
      {
        id: 'door-swing-single-1',
        faceIds: [5, 6],
        unionBBox: { x: 0, y: 0, width: 50, height: 50 },
        filledAreaPx: 2000,
        score: 0.9,
        source: 'single' as const,
        matchedRefIndex: 0,
      },
    ]
    const wallFillCandidates = [
      {
        id: 'door-swing-wall-fill-5',
        faceIds: [5],
        unionBBox: { x: 0, y: 0, width: 40, height: 40 },
        filledAreaPx: 1000,
        score: 0.8,
        source: 'single' as const,
        matchedRefIndex: 0,
      },
      {
        id: 'door-swing-wall-fill-9',
        faceIds: [9],
        unionBBox: { x: 100, y: 0, width: 40, height: 40 },
        filledAreaPx: 1000,
        score: 0.8,
        source: 'single' as const,
        matchedRefIndex: 0,
      },
    ]
    const merged = mergeHypothesesForFillStage({ stage1Hypotheses: stage1, wallFillCandidates })
    expect(merged.map((h) => h.id)).toEqual(['door-swing-single-1', 'door-swing-wall-fill-9'])
  })

  it('muur-as mm-band + ref-diepte: staande ondiepe boog 31×90 (De Roemer #145)', () => {
    // Diepte 31 ≈ ref 29; muur-as 90 ≈ ref 98. Mag NIET afvallen op isotrope 47×47.
    const result = runDoorSwingFilter({
      components: [
        {
          label: 145,
          areaPx: 1498,
          bbox: { x: 980, y: 1743, width: 31, height: 90 },
          touchesBorder: false,
        },
      ],
      parentMap: new Map(),
      classificationByLabel: new Map([[145, 'surface']]),
      classificationGroupBy: 'component',
      refBands: [{ aspectRef: 98 / 29, swingWpx: 98, swingHpx: 29, areaPx: 1442 }],
      sizeBand: { wallMinPx: 47, wallMaxPx: 161 },
      adjacency: new Map(),
    })

    expect(result.hypotheses).toHaveLength(1)
    expect(result.hypotheses[0]?.faceIds).toEqual([145])
    expect(result.diagnostics.find((d) => d.root === 145)?.status).toBe('accepted_single')
  })

  it('allowedSeedClasses=["door"]: unknown wordt geen seed en niet geabsorbeerd', () => {
    const adjacency = new Map<number, Set<number>>([
      [1, new Set([2])],
      [2, new Set([1])],
    ])
    const result = runDoorSwingFilter({
      components: [component(1, 0, 0, 80, 80), component(2, 80, 0, 20, 20)],
      parentMap: new Map(),
      classificationByLabel: new Map([
        [1, 'door'],
        [2, 'unknown'],
      ]),
      classificationGroupBy: 'component',
      refBands: [{ aspectRef: 1, swingWpx: 80, swingHpx: 80, areaPx: 6400 }],
      sizeBand: { wallMinPx: 40, wallMaxPx: 120 },
      adjacency,
      allowedSeedClasses: ['door'],
    })

    expect(result.hypotheses).toHaveLength(1)
    expect(result.hypotheses[0]?.faceIds).toEqual([1])
    expect(result.hypotheses[0]?.faceIds).not.toContain(2)
  })

  it('surface-pocket gemerged in wall-parent blijft eigen seed (niet mega-wall)', () => {
    // Reproduceert 2D_3E: rawLabel 214 (surface) → parentMap → root 17 (wall).
    // Detach-owner = opening-seed-detach (pipeline via prepareOpeningPipeDual).
    const components = [component(17, 0, 0, 400, 400), component(214, 10, 10, 70, 40)]
    const detached = detachEnclosedChildrenForOpeningSeeds({
      parentMap: new Map([[214, 17]]),
      classificationByLabel: new Map([
        [17, 'wall'],
        [214, 'surface'],
      ]),
      components,
      imageWidth: 400,
      imageHeight: 400,
    })
    const result = runDoorSwingFilter({
      components,
      parentMap: detached.parentMap,
      classificationByLabel: detached.classificationByLabel,
      classificationGroupBy: 'component',
      refBands: [{ aspectRef: 1.75, swingWpx: 70, swingHpx: 40, areaPx: 2800 }],
      sizeBand: { wallMinPx: 40, wallMaxPx: 120 },
      adjacency: new Map(),
    })

    expect(result.diagnostics.find((d) => d.root === 214)?.className).toBe('surface')
    expect(result.diagnostics.find((d) => d.root === 214)?.status).toMatch(/^accepted_/)
    expect(result.hypotheses.some((h) => h.faceIds.includes(214))).toBe(true)
    expect(result.hypotheses.every((h) => !h.faceIds.includes(17))).toBe(true)
  })

  it('autoclass-realiteit: child zonder eigen class-key (erft wall) wordt alsnog surface-seed', () => {
    // Autoclass schrijft alleen merged-root keys. Child 214 staat NIET in de map
    // en resolvePixelClassification erft wall — detach materialiseert surface.
    const components = [component(17, 0, 0, 400, 400), component(214, 10, 10, 70, 40)]
    const detached = detachEnclosedChildrenForOpeningSeeds({
      parentMap: new Map([[214, 17]]),
      classificationByLabel: new Map([[17, 'wall']]),
      components,
      imageWidth: 400,
      imageHeight: 400,
    })
    const result = runDoorSwingFilter({
      components,
      parentMap: detached.parentMap,
      classificationByLabel: detached.classificationByLabel,
      classificationGroupBy: 'component',
      refBands: [{ aspectRef: 1.75, swingWpx: 70, swingHpx: 40, areaPx: 2800 }],
      sizeBand: { wallMinPx: 40, wallMaxPx: 120 },
      adjacency: new Map(),
    })

    expect(result.diagnostics.find((d) => d.root === 214)?.className).toBe('surface')
    expect(result.diagnostics.find((d) => d.root === 214)?.status).toMatch(/^accepted_/)
    expect(result.hypotheses.some((h) => h.faceIds.includes(214))).toBe(true)
  })

  it('shallow-rescue: 44px ondiepe kast-face (0.5×81) wordt geaccepteerd', () => {
    // 2D_3E probe3/4: plan-fragmenten ~44–45px, closet-ref swingWpx=81.
    // 0.55×81=44.55 liet 44px zakken terwijl 45px wel door kwam.
    const refBands: DoorSwingRefBand[] = [
      {
        aspectRef: 1.8,
        swingWpx: 81,
        swingHpx: 45,
        areaPx: 2000,
        wallRatio: 1,
        depthRatio: 45 / 81,
        areaSpan2Ratio: 2000 / (81 * 81),
      },
    ]
    const result = runDoorSwingFilter({
      components: [
        {
          label: 198,
          areaPx: 693,
          bbox: { x: 1209, y: 1237, width: 44, height: 26 },
          touchesBorder: false,
        },
        {
          label: 199,
          areaPx: 686,
          bbox: { x: 1292, y: 1237, width: 45, height: 26 },
          touchesBorder: false,
        },
      ],
      parentMap: new Map(),
      classificationByLabel: new Map<number, RoomRasterClass>([
        [198, 'surface'],
        [199, 'surface'],
      ]),
      classificationGroupBy: 'component',
      refBands,
      sizeBand: { wallMinPx: 62, wallMaxPx: 299 },
      adjacency: new Map(),
    })

    expect(result.hypotheses.some((h) => h.faceIds.includes(198))).toBe(true)
    expect(result.hypotheses.some((h) => h.faceIds.includes(199))).toBe(true)
  })

  it('cluster-groei: tip-face voorbij ref-target wint niet van sectorstroken', () => {
    // Rechter dubbele-deur vleugel: tip-face 69 verlaagt underfill hard maar
    // schiet voorbij de ref-breedte; sectorstroken (+ onderstrook 68) vormen de boog.
    const refBands: DoorSwingRefBand[] = [
      {
        aspectRef: 160 / 151,
        swingWpx: 151,
        swingHpx: 160,
        areaPx: 18547,
        wallRatio: 1,
        depthRatio: 0.94375,
        areaSpan2Ratio: 0.7244921875,
        swingSpanPx: 160,
      },
      {
        aspectRef: 1.8,
        swingWpx: 81,
        swingHpx: 45,
        areaPx: 2000,
        wallRatio: 1,
        depthRatio: 45 / 81,
        areaSpan2Ratio: 2000 / (81 * 81),
        swingSpanPx: 81,
      },
    ]
    const result = runDoorSwingFilter({
      components: [
        {
          label: 41,
          areaPx: 2054,
          bbox: { x: 966, y: 279, width: 88, height: 33 },
          touchesBorder: false,
        },
        {
          label: 47,
          areaPx: 4506,
          bbox: { x: 929, y: 310, width: 126, height: 42 },
          touchesBorder: false,
        },
        {
          label: 56,
          areaPx: 5465,
          bbox: { x: 912, y: 351, width: 143, height: 41 },
          touchesBorder: false,
        },
        {
          label: 68,
          areaPx: 168,
          bbox: { x: 980, y: 392, width: 28, height: 6 },
          touchesBorder: false,
        },
        {
          label: 69,
          areaPx: 1218,
          bbox: { x: 1052, y: 389, width: 88, height: 28 },
          touchesBorder: false,
        },
      ],
      parentMap: new Map(),
      classificationByLabel: new Map<number, RoomRasterClass>([
        [41, 'surface'],
        [47, 'surface'],
        [56, 'surface'],
        [68, 'surface'],
        [69, 'surface'],
      ]),
      classificationGroupBy: 'component',
      refBands,
      sizeBand: { wallMinPx: 62, wallMaxPx: 299 },
      adjacency: new Map<number, Set<number>>([
        [41, new Set([47])],
        [47, new Set([41, 56, 69])],
        [56, new Set([47, 68])],
        [68, new Set([56])],
        [69, new Set([47])],
      ]),
    })

    const fullDoor = result.hypotheses.find((h) => h.matchedRefIndex === 0)
    expect(fullDoor).toBeTruthy()
    expect(fullDoor!.faceIds).toEqual(expect.arrayContaining([41, 47, 56]))
    expect(fullDoor!.faceIds).toContain(68)
    expect(fullDoor!.faceIds).not.toContain(69)
    expect(fullDoor!.unionBBox.width).toBeLessThanOrEqual(160 * 1.2)
  })
})
