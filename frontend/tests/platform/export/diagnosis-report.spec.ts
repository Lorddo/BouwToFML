import { describe, expect, it } from 'vitest'
import {
  buildDiagnosisReportHtml,
  type DiagnosisReportPayload,
} from '@/platform/export/diagnosis-report'
import type { LayerDebugReport } from '@/platform/export/layer-debug-report/types'

function emptyLayer(segmentCount: number, junctionCount: number) {
  return {
    segments: Array.from({ length: segmentCount }, (_, i) => ({
      type: 'wall' as const,
      a: { x: i, y: 0 },
      b: { x: i + 1, y: 0 },
    })),
    junctions: Array.from({ length: junctionCount }, (_, i) => ({
      x: i,
      y: 0,
      kind: 'I' as const,
      angleDeg: 0,
    })),
  }
}

describe('buildDiagnosisReportHtml', () => {
  it('renders full L1–L10 pipeline layers, not only L10', () => {
    const layerDebug: LayerDebugReport = {
      version: 1,
      drawing: 'test.png',
      exportedAt: '2026-08-11T00:00:00.000Z',
      pipelineVersion: 'v3',
      layers: {
        layer1: emptyLayer(100, 80),
        layer2: emptyLayer(80, 60),
        layer3: emptyLayer(70, 55),
        layer4: emptyLayer(65, 50),
        layer5: emptyLayer(60, 48),
        layer6: emptyLayer(58, 47),
        layer7: emptyLayer(55, 45),
        layer8: emptyLayer(52, 44),
        layer9: emptyLayer(50, 42),
        layer10: emptyLayer(48, 40),
      },
      summary: {
        completedThroughLayer: 10,
        fmlReady: true,
      },
      wallTransitions: [
        {
          from: 'layer3',
          to: 'layer4',
          summary: {
            prevSegmentCount: 70,
            nextSegmentCount: 65,
            kept: 60,
            moved: 3,
            merged: 2,
            dropped: 5,
            added: 0,
            junctionDropped: 1,
            junctionAdded: 0,
            junctionShifted: 0,
          },
          droppedSegments: [],
          droppedJunctions: [],
        },
      ],
      openings: {
        layer11: { bound: [], unbound: [] },
        layer12: { oriented: [], skipped: [] },
        layer14: { bound: [], rejected: [] },
      },
      openingsSummary: {
        layer11: { bound: 0, unbound: 0 },
        layer12: { oriented: 0, skipped: 0 },
        layer14: { bound: 0, rejected: 0, rejectedByReason: {} },
      },
    }

    const payload: DiagnosisReportPayload = {
      meta: {
        exportedAtIso: '2026-08-11T00:00:00.000Z',
        projectName: 'Test',
        floorId: 'f1',
        floorName: 'BG',
        floorLevel: 0,
        imageName: 'test.png',
        flowStep: 'result',
        pxPerMmX: 0.2,
        pxPerMmY: 0.2,
        appVersion: '1.0.0',
      },
      originalPng: null,
      bwPng: null,
      references: null,
      referenceRefImages: null,
      doors: null,
      windows: null,
      layers: {
        layerDebug,
        semanticWallGraph: { segments: [], junctions: [], meta: {} },
      },
      layerDebugMarkdown: '# Layer debug\n',
      fmlText: null,
      previewPlan: null,
    }

    const html = buildDiagnosisReportHtml(payload)
    expect(html).toContain('Lagen (L1–L10 + L11/L12/L14)')
    expect(html).toContain('L1–L10 counts')
    expect(html).toContain('Wall transitions')
    expect(html).toContain('L3→L4')
    expect(html).toContain('L1 — 100 segments')
    expect(html).toContain('L5 — 60 segments')
    expect(html).toContain('L10 — 48 segments')
    expect(html).toContain('Complete layer-debug report')
    expect(html).toContain('Semantic wall graph')
    expect(html).toContain('Layer-debug markdown')
    expect(html).toContain('Originele onderlegger (stap 1)')
    expect(html).toContain('href="#original"')
  })

  it('renders Gegroepeerde contouren los for opening REFs', () => {
    const payload: DiagnosisReportPayload = {
      meta: {
        exportedAtIso: '2026-08-11T00:00:00.000Z',
        projectName: 'Test',
        floorId: 'f1',
        floorName: 'BG',
        floorLevel: 0,
        imageName: 'test.png',
        flowStep: 'templates',
        pxPerMmX: 0.2,
        pxPerMmY: 0.2,
        appVersion: '1.0.0',
      },
      originalPng: null,
      bwPng: null,
      references: [{ id: 'door-1', type: 'door', x: 0, y: 0, width: 40, height: 20 }],
      referenceRefImages: [
        {
          id: 'door-1',
          kind: 'door',
          png: 'data:image/png;base64,aaa',
          imageKind: 'groupedPolygonClean',
        },
      ],
      doors: null,
      windows: null,
      layers: { layerDebug: null, semanticWallGraph: null },
      layerDebugMarkdown: null,
      fmlText: null,
      previewPlan: null,
    }

    const html = buildDiagnosisReportHtml(payload)
    expect(html).toContain('Gegroepeerde contouren los')
    expect(html).toContain('data:image/png;base64,aaa')
    expect(html).toContain('door · door-1')
    expect(html).toContain('REF-vakken JSON')
  })

  it('renders wall face-overlay REF images with band', () => {
    const payload: DiagnosisReportPayload = {
      meta: {
        exportedAtIso: '2026-08-12T00:00:00.000Z',
        projectName: 'Test',
        floorId: 'f1',
        floorName: 'BG',
        floorLevel: 0,
        imageName: 'walls.png',
        flowStep: 'preprocess',
        pxPerMmX: 0.2,
        pxPerMmY: 0.2,
        appVersion: '1.0.0',
      },
      originalPng: null,
      bwPng: null,
      references: [
        { id: 'w-max', type: 'wall', wallThicknessBand: 'max' },
        { id: 'w-mid', type: 'wall', wallThicknessBand: 'mid' },
      ],
      referenceRefImages: [
        {
          id: 'w-max',
          kind: 'wall',
          wallThicknessBand: 'max',
          png: 'data:image/png;base64,wallmax',
          imageKind: 'faceOverlay',
        },
        {
          id: 'w-mid',
          kind: 'wall',
          wallThicknessBand: 'mid',
          png: 'data:image/png;base64,wallmid',
          imageKind: 'faceOverlay',
        },
      ],
      doors: null,
      windows: null,
      layers: { layerDebug: null, semanticWallGraph: null },
      layerDebugMarkdown: null,
      fmlText: null,
      previewPlan: null,
    }

    const html = buildDiagnosisReportHtml(payload)
    expect(html).toContain('face-overlay')
    expect(html).toContain('wall · max · w-max')
    expect(html).toContain('wall · mid · w-mid')
    expect(html).toContain('data:image/png;base64,wallmax')
    expect(html).toContain('data:image/png;base64,wallmid')
  })

  it('renders step-1 original underlay with size in meta', () => {
    const payload: DiagnosisReportPayload = {
      meta: {
        exportedAtIso: '2026-08-13T00:00:00.000Z',
        projectName: 'Test',
        floorId: 'f1',
        floorName: 'BG',
        floorLevel: 0,
        imageName: 'scan.png',
        flowStep: 'templates',
        pxPerMmX: 0.2,
        pxPerMmY: 0.2,
        appVersion: '1.0.0',
        originalWidth: 4120,
        originalHeight: 3000,
      },
      originalPng: 'data:image/jpeg;base64,origscan',
      bwPng: 'data:image/png;base64,bwscan',
      references: null,
      referenceRefImages: null,
      doors: null,
      windows: null,
      layers: { layerDebug: null, semanticWallGraph: null },
      layerDebugMarkdown: null,
      fmlText: null,
      previewPlan: null,
    }

    const html = buildDiagnosisReportHtml(payload)
    expect(html).toContain('Originele onderlegger (stap 1)')
    expect(html).toContain('data:image/jpeg;base64,origscan')
    expect(html).toContain('4120×3000 px')
    expect(html).toContain('4120 × 3000 px')
    expect(html).toContain('data:image/png;base64,bwscan')
    expect(html).toContain('Stap 2 effective / base wall B/W')
  })
})
