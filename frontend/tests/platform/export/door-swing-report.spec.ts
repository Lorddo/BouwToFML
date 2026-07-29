import { describe, expect, it } from 'vitest'
import { buildDoorSwingReportHtml } from '@/platform/export/door-swing-report'

describe('door-swing-report', () => {
  it('rendert hypotheses + overlay in html', () => {
    const html = buildDoorSwingReportHtml({
      drawing: 'demo.png',
      exportedAtIso: '2026-07-17T12:00:00.000Z',
      pxPerMmX: 2.5,
      pxPerMmY: 2.5,
      refBands: [{ aspectRef: 1.9, swingWpx: 40, swingHpx: 76, areaPx: 950 }],
      sizeBandPx: { wallMinPx: 40, wallMaxPx: 120 },
      stats: {
        rootCount: 120,
        seedCount: 22,
        singleAccepted: 7,
        clusterAccepted: 1,
        skippedOutsideSeedCount: 5,
        skippedOutOfBandCount: 9,
      },
      hypotheses: [
        {
          id: 'door-swing-single-1',
          faceIds: [11],
          unionBBox: { x: 100, y: 200, width: 42, height: 76 },
          filledAreaPx: 1200,
          score: 0.96,
          source: 'single',
          matchedRefIndex: 0,
        },
      ],
      diagnostics: [
        {
          root: 11,
          className: 'surface',
          areaPx: 1200,
          bbox: { x: 100, y: 200, width: 42, height: 76 },
          status: 'accepted_single',
          matchedRefIndex: 0,
          score: 0.96,
        },
      ],
      stage2: {
        minRatio: 0.8,
        maxRatio: 1.2,
        acceptedIds: ['door-swing-single-1'],
        rejectedCount: 0,
        rejectedTooFull: 0,
        rejectedTooEmpty: 0,
        angleRescueCount: 0,
        fillRejected: [
          {
            id: 'door-swing-single-2',
            faceIds: [22],
            reason: 'too_full',
            candidateFill: 0.9,
            refFill: 0.5,
            minAllowedFill: 0.4,
            maxAllowedFill: 0.6,
            unionBBox: { x: 0, y: 0, width: 40, height: 20 },
            filledAreaPx: 720,
          },
        ],
        angleRescueDiagnostics: [
          {
            root: 99,
            status: 'rejected_fill_cap',
            space: 'white',
            bbox: { x: 1, y: 2, width: 50, height: 24 },
            areaPx: 1000,
            fill: 0.85,
            depthPx: 24,
            depthRefPx: 24,
            longPx: 50,
            wallMaxPx: 120,
            matchedRefIndex: 0,
            candidateAngleDeg: null,
            refAngleDeg: 16,
            angleDeltaDeg: null,
            score: null,
          },
        ],
      },
      resolvedDoors: [
        {
          id: 'door-swing-single-1',
          source: 'single',
          score: 0.96,
          matchedRefIndex: 0,
          faceIds: [11],
          bbox: { x: 100, y: 200, width: 42, height: 76 },
          centroidPx: { x: 121, y: 238 },
          swingSpanPx: 74.2,
          framingPx: 14,
          overhangAlongPx: 90,
          overhangOppositePx: 0,
          framingAlongPx: 0,
          framingOppositePx: 0,
          ratioBlade: 1.2,
          widthPx: 103.04,
          widthCm: 4.12,
          fmlRefId: '0434246537840a3326e305dbe7b9c355743e6e93',
          kind: 'single',
        },
      ],
      gapsContext: {
        demotedCount: 12,
        keptCount: 88,
        oversizedDemotedCount: 2,
        maxRefFaceAreaPx: 1500,
        refFaceAreaCapPx: 4500,
      },
      overlayPng: 'data:image/png;base64,AAAA',
    })

    expect(html).toContain('Deuren stage-1/2/3 — draaiboog candidates + maatvoering')
    expect(html).toContain('door-swing-single-1')
    expect(html).toContain('data:image/png;base64,AAAA')
    expect(html).toContain('muur-as px-band')
    expect(html).toContain('Gaten-context')
    expect(html).toContain('Dropped / diagnostics per root')
    expect(html).toContain('candidateFill')
    expect(html).toContain('Stage 2 — fill rejects')
    expect(html).toContain('too_full')
    expect(html).toContain('Stage 2 — angle-rescue diagnostics')
    expect(html).toContain('rejected_fill_cap')
    expect(html).toContain('Stage 3 — resolved deurenlijst')
    expect(html).toContain('ratioBlade')
  })
})
