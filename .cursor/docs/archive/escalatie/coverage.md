# Escalatie — dekkingsregister

Gegenereerd: 2026-07-31 · Bron: `npm run esc:coverage`

Per inventaris-ID: getagd (`// ESC:`), geïnstrumenteerd (journaal-call), binnen E2E-harnas-bereik.
Zonder dit is "nul keer gevuurd" niet te onderscheiden van "niet gemeten".

| Status | Aantal |
|---|---|
| Getagd | 228/228 |
| Geïnstrumenteerd | 198 |
| Daarvan in harnas | 85 |
| Geïnstrumenteerd buiten harnas | 113 |
| Getagd zonder journaal | 30 |
| … waarvan A–E (luid-doel) | 20 |
| … skip-loud (F / O-40 / VERWIJDEREN-weg) | 10 |
| … stil in harnas | 0 |
| … stil buiten harnas | 20 |

## Geïnstrumenteerd + in harnas

| ID | Cat | Journaal |
|---|---|---|
| D-42 | D | cv/doors/door-attach-doorframes.ts:258 |
| D-44 | P | cv/doors/door-wall-snap.ts:141 |
| D-46 | A | cv/doors/door-wall-snap.ts:141 |
| D-47 | A | cv/doors/door-wall-snap-doorframe.ts:307, cv/doors/door-wall-snap-doorframe.ts:339 |
| D-48 | A | cv/doors/door-wall-snap-path-b.ts:148 |
| D-54 | A | cv/doors/door-swing-mask.ts:176 |
| D-55 | C | cv/doors/door-swing-mask.ts:311 |
| D-56 | B | cv/doors/door-kept-wall-mask-contact.ts:130 |
| D-57 | A | cv/doors/door-l12-hinge.ts:133, cv/doors/door-l12-hinge.ts:136 |
| D-58 | A | cv/doors/door-wall-orient.ts:302 |
| D-59 | B | cv/doors/door-wall-orient.ts:286 |
| R-27 | A | cv/windows/window-wall-merge.ts:141, cv/windows/window-wall-merge.ts:150 |
| REF-14 | E | core/fml/fml-wall-thickness-tiers.ts:100, core/fml/fml-wall-thickness-tiers.ts:103 |
| W-07 | E | cv/walls/rooms/pipeline-v3/layer-2-raw-segments.ts:139, cv/walls/rooms/pipeline-v3/layer-2-raw-segments.ts:147 |
| W-08 | A | cv/walls/rooms/pipeline-v3/layer-2-raw-segments.ts:262 |
| W-09 | B | cv/walls/rooms/pipeline-v3/layer-2-raw-segments.ts:276 |
| W-10 | A | cv/walls/rooms/pipeline-v3/layer-2-raw-segments.ts:284 |
| W-11 | B | cv/walls/rooms/pipeline-v3/engines/segment-ops/index.ts:355 |
| W-12 | A | cv/walls/rooms/pipeline-v3/engines/prune/index.ts:341 |
| W-13 | E | cv/walls/rooms/pipeline-v3/engines/prune/index.ts:45 |
| W-14 | E | cv/walls/rooms/pipeline-v3/engines/hv/position-segments-hv.ts:111, cv/walls/rooms/pipeline-v3/engines/hv/position-segments-hv.ts:115, cv/walls/rooms/pipeline-v3/engines/hv/position-segments-hv.ts:121, cv/walls/rooms/pipeline-v3/engines/hv/position-segments-hv.ts:124 |
| W-15 | B | cv/walls/rooms/pipeline-v3/engines/hv/position-segments-hv.ts:255, cv/walls/rooms/pipeline-v3/engines/hv/position-segments-hv.ts:259, cv/walls/rooms/pipeline-v3/engines/hv/position-segments-hv.ts:264, cv/walls/rooms/pipeline-v3/engines/hv/position-segments-hv.ts:268 |
| W-16 | B | cv/walls/rooms/pipeline-v3/layer-5-cleanup.ts:38 |
| W-17 | B | cv/walls/rooms/pipeline-v3/layer-5-cleanup.ts:50, cv/walls/rooms/pipeline-v3/layer-5-cleanup.ts:55, cv/walls/rooms/pipeline-v3/layer-5-cleanup.ts:58 |
| W-18 | B | cv/walls/rooms/pipeline-v3/layer-5-cleanup.ts:181, cv/walls/rooms/pipeline-v3/layer-5-cleanup.ts:184, cv/walls/rooms/pipeline-v3/layer-5-cleanup.ts:185 |
| W-19 | A | cv/walls/rooms/pipeline-v3/engines/weld/index.ts:82, cv/walls/rooms/pipeline-v3/engines/weld/index.ts:112, cv/walls/rooms/pipeline-v3/engines/weld/index.ts:116, cv/walls/rooms/pipeline-v3/engines/weld/index.ts:117 |
| W-20 | B | cv/walls/rooms/pipeline-v3/engines/cleanup/tx-micro.ts:77, cv/walls/rooms/pipeline-v3/engines/cleanup/tx-micro.ts:85, cv/walls/rooms/pipeline-v3/engines/cleanup/tx-micro.ts:89 |
| W-21 | B | cv/walls/rooms/pipeline-v3/engines/cleanup/micro-loops.ts:68, cv/walls/rooms/pipeline-v3/engines/cleanup/micro-loops.ts:75 |
| W-22 | A | cv/walls/rooms/pipeline-v3/engines/cleanup/same-line.ts:147, cv/walls/rooms/pipeline-v3/engines/cleanup/same-line.ts:196 |
| W-23 | A | cv/walls/rooms/pipeline-v3/engines/cleanup/ll-stair.ts:51, cv/walls/rooms/pipeline-v3/engines/cleanup/ll-stair.ts:94 |
| W-24 | A | cv/walls/rooms/pipeline-v3/layer-5-cleanup.ts:170 |
| W-25 | B | cv/walls/rooms/pipeline-v3/layer-6-repair.ts:115, cv/walls/rooms/pipeline-v3/layer-6-repair.ts:202, cv/walls/rooms/pipeline-v3/layer-6-repair.ts:208, cv/walls/rooms/pipeline-v3/layer-6-repair.ts:209 |
| W-26 | B | cv/walls/rooms/pipeline-v3/layer-6-repair.ts:116, cv/walls/rooms/pipeline-v3/layer-6-repair.ts:124, cv/walls/rooms/pipeline-v3/layer-6-repair.ts:130 |
| W-27 | A | cv/walls/rooms/pipeline-v3/layer-6-repair.ts:150, cv/walls/rooms/pipeline-v3/layer-6-repair.ts:153, cv/walls/rooms/pipeline-v3/layer-6-repair.ts:162, cv/walls/rooms/pipeline-v3/layer-6-repair.ts:178, cv/walls/rooms/pipeline-v3/layer-6-repair.ts:181, cv/walls/rooms/pipeline-v3/layer-6-repair.ts:189 |
| W-28 | B | cv/walls/rooms/pipeline-v3/engines/connector/kind-accept.ts:29, cv/walls/rooms/pipeline-v3/engines/connector/kind-accept.ts:36, cv/walls/rooms/pipeline-v3/engines/connector/kind-accept.ts:45, cv/walls/rooms/pipeline-v3/engines/connector/kind-accept.ts:51, cv/walls/rooms/pipeline-v3/engines/connector/kind-accept.ts:55 |
| W-29 | B | cv/walls/rooms/pipeline-v3/engines/connector/chamfer-group.ts:50, cv/walls/rooms/pipeline-v3/engines/connector/chamfer-group.ts:63, cv/walls/rooms/pipeline-v3/engines/connector/chamfer-group.ts:67, cv/walls/rooms/pipeline-v3/engines/connector/chamfer-group.ts:88, cv/walls/rooms/pipeline-v3/engines/connector/chamfer-group.ts:93 |
| W-30 | A | cv/walls/rooms/pipeline-v3/engines/connector/connector-repair.ts:113, cv/walls/rooms/pipeline-v3/engines/connector/connector-repair.ts:115 |
| W-31 | A | cv/walls/rooms/pipeline-v3/engines/connector/connector-repair.ts:138, cv/walls/rooms/pipeline-v3/engines/connector/connector-repair.ts:149, cv/walls/rooms/pipeline-v3/engines/connector/connector-repair.ts:152, cv/walls/rooms/pipeline-v3/engines/connector/connector-repair.ts:154 |
| W-32 | A | cv/walls/rooms/pipeline-v3/engines/connector/connector-repair.ts:239, cv/walls/rooms/pipeline-v3/engines/connector/connector-repair.ts:244, cv/walls/rooms/pipeline-v3/engines/connector/connector-repair.ts:247 |
| W-33 | A | cv/walls/rooms/pipeline-v3/engines/connector/connector-detect.ts:90, cv/walls/rooms/pipeline-v3/engines/connector/connector-detect.ts:117, cv/walls/rooms/pipeline-v3/engines/connector/connector-detect.ts:271, cv/walls/rooms/pipeline-v3/engines/connector/connector-detect.ts:301, cv/walls/rooms/pipeline-v3/engines/connector/connector-detect.ts:317 |
| W-34 | A | cv/walls/rooms/pipeline-v3/engines/connector/chamfer-group-geometry-resolve.ts:192, cv/walls/rooms/pipeline-v3/engines/connector/chamfer-group-geometry-resolve.ts:225, cv/walls/rooms/pipeline-v3/engines/connector/chamfer-group-geometry-resolve.ts:243, cv/walls/rooms/pipeline-v3/engines/connector/chamfer-group-geometry-resolve.ts:261, cv/walls/rooms/pipeline-v3/engines/connector/chamfer-group-geometry-resolve.ts:327, cv/walls/rooms/pipeline-v3/engines/connector/chamfer-group-geometry-resolve.ts:342, cv/walls/rooms/pipeline-v3/engines/connector/chamfer-group-geometry-resolve.ts:437, cv/walls/rooms/pipeline-v3/engines/connector/chamfer-group-geometry-resolve.ts:452, cv/walls/rooms/pipeline-v3/engines/connector/chamfer-group-geometry-resolve.ts:480, cv/walls/rooms/pipeline-v3/engines/connector/chamfer-group-geometry-resolve.ts:527, cv/walls/rooms/pipeline-v3/engines/connector/chamfer-group-geometry-resolve.ts:540 |
| W-35 | A | cv/walls/rooms/pipeline-v3/engines/connector/chamfer-group-geometry-resolve.ts:61, cv/walls/rooms/pipeline-v3/engines/connector/chamfer-group-geometry-resolve.ts:63, cv/walls/rooms/pipeline-v3/engines/connector/chamfer-group-geometry-resolve.ts:108 |
| W-36 | B | cv/walls/rooms/pipeline-v3/engines/connector/chamfer-group-geometry-resolve.ts:509, cv/walls/rooms/pipeline-v3/engines/connector/chamfer-group-geometry-resolve.ts:512 |
| W-37 | B | cv/walls/rooms/pipeline-v3/engines/connector/chamfer-group-apply.ts:58, cv/walls/rooms/pipeline-v3/engines/connector/chamfer-group-apply.ts:64, cv/walls/rooms/pipeline-v3/engines/connector/chamfer-group-apply.ts:67 |
| W-38 | B | cv/walls/rooms/pipeline-v3/engines/connector/chamfer-group-apply-snap.ts:32, cv/walls/rooms/pipeline-v3/engines/connector/chamfer-group-apply-snap.ts:36, cv/walls/rooms/pipeline-v3/engines/connector/chamfer-group-apply-snap.ts:38 |
| W-39 | B | cv/walls/rooms/pipeline-v3/engines/connector/junction-repair.ts:138, cv/walls/rooms/pipeline-v3/engines/connector/junction-repair.ts:144 |
| W-40 | B | cv/walls/rooms/pipeline-v3/engines/connector/junction-repair.ts:78, cv/walls/rooms/pipeline-v3/engines/connector/junction-repair.ts:96 |
| W-41 | B | cv/walls/rooms/pipeline-v3/engines/connector/junction-repair-diagonals.ts:75, cv/walls/rooms/pipeline-v3/engines/connector/junction-repair-diagonals.ts:90, cv/walls/rooms/pipeline-v3/engines/connector/junction-repair-diagonals.ts:104, cv/walls/rooms/pipeline-v3/engines/connector/junction-repair-diagonals.ts:111 |
| W-42 | B | cv/walls/rooms/pipeline-v3/engines/connector/junction-repair-l.ts:40, cv/walls/rooms/pipeline-v3/engines/connector/junction-repair-l.ts:51, cv/walls/rooms/pipeline-v3/engines/connector/junction-repair-l.ts:65, cv/walls/rooms/pipeline-v3/engines/connector/junction-repair-l.ts:72, cv/walls/rooms/pipeline-v3/engines/connector/junction-repair-l.ts:76, cv/walls/rooms/pipeline-v3/engines/connector/junction-repair-l.ts:108 |
| W-43 | E | cv/walls/rooms/pipeline-v3/engines/connector/constants.ts:11, cv/walls/rooms/pipeline-v3/engines/connector/constants.ts:14 |
| W-44 | B | cv/walls/rooms/pipeline-v3/layer-7-align.ts:68 |
| W-45 | A | cv/walls/rooms/pipeline-v3/engines/collapse/chain-collapse.ts:148, cv/walls/rooms/pipeline-v3/engines/collapse/chain-collapse.ts:209 |
| W-46 | E | cv/walls/rooms/pipeline-v3/engines/collapse/thickness.ts:27 |
| W-47 | A | cv/walls/rooms/pipeline-v3/layer-8-finalize.ts:77 |
| W-48 | B | cv/walls/rooms/pipeline-v3/layer-8-finalize.ts:84 |
| W-49 | B | cv/walls/rooms/pipeline-v3/layer-9-dissolve.ts:75, cv/walls/rooms/pipeline-v3/layer-9-dissolve.ts:89, cv/walls/rooms/pipeline-v3/layer-9-dissolve.ts:105 |
| W-50 | B | cv/walls/rooms/pipeline-v3/layer-10-fml.ts:75 |
| W-51 | A | cv/walls/rooms/pipeline-v3/layer-10-fml.ts:88 |
| W-52 | B | cv/walls/rooms/pipeline-v3/layer-10-fml.ts:101 |
| W-53 | B | cv/walls/rooms/build-semantic-walls-source.ts:28, cv/walls/rooms/build-semantic-walls-source.ts:33 |
| X-01 | E | core/fml/harmonize-fml-wall-thickness.ts:243 |
| X-02 | E | core/fml/harmonize-fml-wall-thickness.ts:234 |
| X-03 | E | core/fml/harmonize-fml-wall-thickness.ts:176 |
| X-04 | A | core/fml/harmonize-fml-wall-thickness.ts:135 |
| X-05 | E | core/fml/harmonize-fml-wall-thickness.ts:195 |
| X-06 | A | core/fml/extraction-to-plan-walls.ts:23, core/fml/extraction-to-plan-walls.ts:31, core/fml/extraction-to-plan-walls.ts:34 |
| X-07 | E | core/fml/extraction-to-plan-walls.ts:49, core/fml/extraction-to-plan-walls.ts:55, core/fml/extraction-to-plan-walls.ts:60 |
| X-08 | E | core/fml/extractionToPlan.ts:96 |
| X-09 | E | core/fml/extraction-to-plan-edge-openings.ts:18 |
| X-10 | A | core/fml/extraction-to-plan-doors.ts:111 |
| X-11 | E | core/fml/extraction-to-plan-windows.ts:36 |
| X-12 | A | core/fml/extraction-to-plan-doors.ts:167 |
| X-13 | E | core/fml/buildFmlV3.ts:52 |
| X-14 | E | core/fml/buildFmlV3.ts:54 |
| X-15 | E | core/fml/buildFmlV3.ts:56 |
| X-16 | E | core/fml/buildFmlV3.ts:59 |
| X-17 | E | core/fml/buildFmlV3.ts:64 |
| X-18 | E | core/fml/measure-underlay-wall-thickness.ts:448 |
| X-19 | A | core/fml/measure-underlay-wall-thickness.ts:289, core/fml/measure-underlay-wall-thickness.ts:293 |
| X-20 | E | core/fml/measure-underlay-wall-thickness.ts:335, core/fml/measure-underlay-wall-thickness.ts:344 |
| X-21 | B | cv/walls/rooms/build-semantic-walls-source.ts:29 |
| X-22 | E | cv/walls/rooms/build-semantic-walls-output.ts:86 |
| X-23 | E | cv/walls/rooms/build-semantic-walls-output.ts:55 |
| X-24 | B | core/fml/layer-openings-to-fml.ts:25, core/fml/layer-openings-to-fml.ts:48 |
| X-27 | P | cv/walls/rooms/build-semantic-walls-output.ts:94 |

## Geïnstrumenteerd buiten harnas

| ID | Cat | Journaal |
|---|---|---|
| D-01 | C | cv/doors/door-swing-filter.ts:67 |
| D-02 | C | cv/doors/door-swing-filter.ts:69 |
| D-03 | C | cv/doors/run-door-stage-pipeline.ts:51 |
| D-04 | C | cv/doors/door-swing-filter-seed.ts:121 |
| D-05 | C | cv/doors/run-door-stage-pipeline.ts:143 |
| D-06 | C | cv/doors/run-door-stage-pipeline.ts:138 |
| D-07 | C | cv/doors/door-swing-ref.ts:230, cv/doors/door-swing-ref.ts:234 |
| D-08 | C | cv/doors/door-swing-angle-rescue.ts:126 |
| D-09 | A | cv/doors/door-swing-filter-seed.ts:65 |
| D-10 | A | cv/doors/door-swing-filter-seed.ts:81 |
| D-11 | A | cv/doors/door-swing-filter-matching.ts:250 |
| D-12 | B | cv/doors/door-swing-filter-matching.ts:286, cv/doors/door-swing-filter-matching.ts:294, cv/doors/door-swing-filter-matching.ts:300 |
| D-13 | C | cv/doors/door-swing-filter-seed.ts:146, cv/doors/door-swing-filter-seed.ts:150 |
| D-14 | A | cv/doors/door-swing-filter-matching.ts:354 |
| D-15 | A | cv/doors/door-swing-filter-seed.ts:240 |
| D-16 | C | cv/doors/door-swing-filter-seed.ts:304 |
| D-17 | A | cv/doors/door-swing-filter-seed.ts:362 |
| D-18 | A | cv/doors/door-swing-filter-matching.ts:171 |
| D-19 | C | cv/doors/door-swing-filter-cluster.ts:25 |
| D-20 | A | cv/doors/door-swing-filter-cluster.ts:263 |
| D-21 | B | cv/doors/door-swing-filter-cluster.ts:86, cv/doors/door-swing-filter-cluster.ts:90 |
| D-22 | A | cv/doors/door-swing-filter-cluster.ts:184 |
| D-23 | B | cv/doors/door-swing-filter-cluster.ts:278 |
| D-24 | A | cv/doors/door-swing-fill-stage.ts:46 |
| D-25 | B | cv/doors/door-fill-filter.ts:80, cv/doors/door-fill-filter.ts:93 |
| D-26 | A | cv/doors/door-swing-fill-stage.ts:72 |
| D-27 | B | cv/doors/door-room-surround.ts:111, cv/doors/door-room-surround.ts:116 |
| D-28 | B | cv/doors/door-room-surround.ts:179 |
| D-29 | B | cv/doors/door-swing-angle-rescue.ts:84 |
| D-30 | B | cv/doors/door-swing-angle-rescue.ts:245 |
| D-31 | C | cv/doors/door-swing-angle-rescue.ts:123 |
| D-32 | C | cv/doors/door-swing-angle-rescue.ts:131 |
| D-33 | B | cv/doors/door-swing-angle-rescue.ts:275 |
| D-34 | B | cv/doors/door-swing-angle-rescue.ts:292 |
| D-35 | B | cv/doors/door-swing-angle-rescue.ts:324 |
| D-36 | B | cv/doors/door-swing-angle-rescue.ts:341 |
| D-37 | A | cv/doors/door-swing-angle-rescue.ts:368 |
| D-38 | B | cv/doors/door-swing-angle-rescue.ts:186, cv/doors/door-swing-angle-rescue.ts:194 |
| D-39 | A | cv/doors/door-swing-angle-rescue.ts:308 |
| D-40 | A | cv/doors/door-bridge-wall-promote.ts:211 |
| D-41 | D | cv/doors/door-bridge-wall-promote.ts:254, cv/doors/door-bridge-wall-promote.ts:273 |
| D-43 | E | cv/doors/door-resolve.ts:73 |
| D-60 | E | cv/doors/door-swing-ref.ts:182 |
| D-61 | D | cv/doors/run-door-stage-pipeline.ts:148 |
| O-10 | D | ui/composables/workspace/door-faces-snap.ts:63 |
| O-11 | D | ui/composables/workspace/door-faces-snap.ts:162 |
| O-12 | D | ui/composables/workspace/useWorkspaceWindowFaces.ts:149 |
| O-13 | D | ui/composables/workspace/constants.ts:47 |
| O-14 | D | ui/composables/workspace/useWorkspaceDoorSwingFaces.ts:415 |
| O-15 | D | ui/composables/workspace/useWorkspaceWindowFaces.ts:201 |
| O-16 | D | ui/composables/workspace/useWorkspaceRoomFaces.ts:453, ui/composables/workspace/useWorkspaceRoomFaces.ts:457 |
| O-17 | B | ui/composables/workspace/useWorkspaceDoorSwingFaces.ts:336 |
| O-18 | B | ui/composables/workspace/useWorkspaceDoorSwingComputationCache.ts:76 |
| O-19 | D | ui/composables/workspace/useWorkspaceDoorSwingComputationCache.ts:86 |
| O-20 | B | ui/composables/workspace/door-faces-snap.ts:34 |
| O-21 | B | ui/composables/workspace/door-faces-snap.ts:185 |
| O-22 | B | ui/composables/workspace/window-faces-bind.ts:24 |
| O-23 | D | ui/composables/workspace/useWorkspaceWindowFaces.ts:263, ui/composables/workspace/useWorkspaceWindowFaces.ts:600 |
| O-24 | D | ui/composables/workspace/useWorkspaceDoorSwingFaces.ts:623 |
| O-25 | D | ui/composables/workspace/useWorkspaceWindowFaces.ts:560 |
| O-26 | D | ui/composables/workspace/useWorkspaceDoorSwingFaces.ts:665 |
| O-27 | D | ui/composables/useWorkspace.ts:320 |
| O-28 | D | ui/composables/workspace/useWorkspaceDoorSwingHelpers.ts:21 |
| O-29 | D | ui/composables/workspace/workspace-dev-session-restore-detection.ts:163 |
| O-30 | D | ui/composables/workspace/workspace-dev-session-restore-detection.ts:124 |
| O-31 | D | ui/composables/workspace/useWorkspaceDetection.ts:261 |
| O-32 | D | ui/composables/workspace/useWorkspaceDetection.ts:423 |
| O-33 | D | ui/composables/workspace/useWorkspaceDetection.ts:444 |
| O-34 | D | ui/composables/workspace/useWorkspaceDoorSwingFaces.ts:398 |
| O-35 | D | ui/composables/workspace/useWorkspaceWindowFaces.ts:468 |
| O-36 | D | ui/composables/workspace/door-faces-snap.ts:250 |
| O-37 | D | ui/composables/workspace/useWorkspaceRoomFaces.ts:138 |
| O-38 | D | ui/composables/workspace/workspace-fml-generate.ts:128 |
| O-39 | D | ui/composables/workspace/useWorkspaceDebugProbe.ts:122 |
| O-41 | D | ui/composables/workspace/workspace-export-door-swing-report.ts:186 |
| O-42 | B | ui/composables/workspace/useWorkspaceFlow.ts:92 |
| O-43 | B | ui/composables/workspace/workspace-view-visibility.ts:41, ui/composables/workspace/workspace-view-visibility.ts:47 |
| O-44 | B | ui/composables/workspace/useWorkspaceViewUi.ts:59 |
| O-45 | B | ui/composables/workspace/useWorkspaceDoorSwingFaces.ts:146, ui/composables/workspace/useWorkspaceWindowFaces.ts:137 |
| O-46 | B | ui/composables/workspace/constants.ts:61 |
| R-05 | E | cv/windows/window-axel-ref.ts:312 |
| R-10 | A | cv/windows/window-axel-cluster.ts:262 |
| R-11 | E | cv/windows/window-axel-cluster.ts:75, cv/windows/window-axel-cluster.ts:76 |
| R-12 | B | cv/windows/window-axel-cluster.ts:353 |
| R-13 | C | cv/windows/window-axel-cluster.ts:74 |
| R-14 | C | cv/windows/window-door-arc-filter.ts:96 |
| R-15 | A | cv/windows/window-door-arc-filter.ts:242 |
| R-16 | A | cv/windows/window-evidence-filter.ts:142, cv/windows/window-evidence-filter.ts:167, cv/windows/window-evidence-filter.ts:186 |
| R-17 | C | cv/windows/window-evidence-stack.ts:119 |
| R-18 | C | cv/windows/window-evidence-framing.ts:154 |
| R-19 | A | cv/windows/window-size-range.ts:89 |
| R-20 | B | cv/windows/window-evidence-stack.ts:138 |
| R-21 | D | cv/windows/window-stage3-retarget.ts:39 |
| R-22 | C | cv/windows/window-resolve.ts:55, cv/windows/window-resolve.ts:56 |
| R-23 | E | cv/windows/window-resolve.ts:92 |
| R-24 | A | cv/windows/window-resolve.ts:216 |
| R-25 | B | cv/windows/window-resolve.ts:224 |
| REF-01 | A | cv/refs/ref-crop-bw.ts:229 |
| REF-02 | A | cv/refs/ref-axis-align.ts:97, cv/refs/ref-axis-align.ts:110, cv/refs/ref-axis-align.ts:117 |
| REF-05 | E | cv/refs/ref-blob-units.ts:281 |
| REF-06 | E | cv/refs/ref-face-crop.ts:314 |
| REF-07 | E | cv/refs/ref-face-crop.ts:242 |
| REF-08 | E | cv/refs/ref-face-crop.ts:168 |
| REF-10 | E | cv/refs/ref-pipeline.ts:409 |
| REF-11 | A | cv/refs/classify-wall-ref-style.ts:72, cv/refs/classify-wall-ref-style.ts:80 |
| REF-12 | A | cv/refs/ref-swing-arc.ts:117, cv/refs/ref-swing-arc.ts:121, cv/refs/ref-swing-arc.ts:125 |
| REF-13 | A | cv/refs/ref-swing-hinge-resolve.ts:260 |
| W-01 | E | cv/walls/rooms/room-wall-connected-blobs.ts:171 |
| W-02 | A | cv/walls/rooms/room-exterior-pocket.ts:105 |
| W-03 | A | cv/walls/rooms/room-refine-topology.ts:87, cv/walls/strategies/room-first.ts:174 |
| W-04 | A | cv/walls/rooms/face-parent-claim.ts:67 |
| W-06 | E | cv/walls/rooms/room-exterior-pocket.ts:33 |
| X-26 | E | platform/export/layer-debug-report/build-layer-debug-report.ts:115 |

## Getagd zonder journaal

ID’s met `// ESC:`-tag maar zonder journaal-call. Skip-loud = Cat **F**, **O-40**, of VERWIJDEREN-weg.
Harnas = tag-bestand matcht `HARNESS_REACHABLE` (nog niet geïnstrumenteerd → potentiële meetbaarheid).

### Stil in harnas (0)

| ID | Cat | Tag |
|---|---|---|

### Stil buiten harnas (20)

| ID | Cat | Tag |
|---|---|---|
| O-01 | D | cv/walls/rooms/face-override-sync.ts:97 |
| O-02 | D | cv/walls/rooms/face-override-sync.ts:122 |
| O-03 | D | cv/walls/rooms/face-override-sync.ts:147 |
| O-04 | D | cv/walls/rooms/face-override-sync.ts:169 |
| O-05 | D | cv/walls/rooms/face-override-sync.ts:36 |
| O-06 | D | ui/composables/workspace/door-faces-auto-pass.ts:39 |
| O-07 | D | ui/composables/workspace/window-faces-auto-pass.ts:44 |
| O-08 | D | ui/composables/workspace/window-faces-auto-pass.ts:97 |
| O-09 | D | ui/composables/workspace/window-faces-auto-pass.ts:86 |
| R-01 | C | cv/walls/rooms/opening-pipe-dual.ts:22 |
| R-02 | A | cv/windows/window-axel-ref.ts:90, cv/windows/window-axel-ref.ts:339 |
| R-03 | A | cv/windows/window-axel-ref.ts:264 |
| R-04 | C | cv/windows/window-axel-ref.ts:357 |
| R-06 | A | cv/windows/window-axel-filter.ts:57 |
| R-07 | E | cv/windows/window-axel-filter.ts:98 |
| R-08 | A | cv/windows/window-axel-strip-geometry.ts:299 |
| R-09 | A | cv/windows/window-axel-cluster.ts:232 |
| REF-03 | A | cv/refs/ref-straighten.ts:380 |
| REF-04 | A | cv/refs/ref-blob-units.ts:160 |
| REF-09 | A | cv/refs/ref-pipeline.ts:236 |

### Skip-loud (10)

| ID | Cat | Tag |
|---|---|---|
| D-45 | A | cv/doors/door-wall-snap-doorframe.ts:25, cv/doors/door-wall-snap.ts:89 |
| D-49 | A | cv/doors/door-wall-snap-path-b.ts:115, cv/doors/door-wall-snap-tuning.ts:3 |
| D-50 | A | cv/doors/door-wall-snap.ts:151 |
| D-51 | A | cv/doors/door-wall-snap.ts:152 |
| D-52 | A | cv/doors/door-wall-snap.ts:153 |
| D-53 | A | cv/doors/door-wall-snap-bind.ts:123 |
| O-40 | D | ui/composables/workspace/assembleWorkspaceFacadeReturn.ts:240 |
| R-26 | E | cv/windows/window-wall-bind.ts:196 |
| W-05 | F | cv/walls/rooms/room-raster.ts:127 |
| X-25 | F | core/fml/importFmlV3.ts:122 |

## Golf 1 checklist (W-16…W-43)

L5 cleanup + L6 connector. Doel: 0 stil A–E in deze set.

| Status | Aantal |
|---|---|
| Set | 28 |
| Nog stil | 0 |
| Al luid | 28 |

_Alle ID’s in deze set hebben een journaal-telsite._

## Golf 2 checklist (W rest)

L0 + L2–L4 + L7–L10 + W-53. W-13 telt mee als set-lid (vaak al luid).

| Status | Aantal |
|---|---|
| Set | 22 |
| Nog stil | 0 |
| Al luid | 22 |

_Alle ID’s in deze set hebben een journaal-telsite._

## Golf 3 checklist (X)

core/fml + X-21/26/27. Gedrag X-11/13–17 laten; wel journaal OK.

| Status | Aantal |
|---|---|
| Set | 23 |
| Nog stil | 0 |
| Al luid | 23 |

_Alle ID’s in deze set hebben een journaal-telsite._

## Golf 4a checklist (L11 D)

D-42 + D-54…D-59.

| Status | Aantal |
|---|---|
| Set | 7 |
| Nog stil | 0 |
| Al luid | 7 |

_Alle ID’s in deze set hebben een journaal-telsite._

## Golf 4b checklist (Stage D)

D-01…12, D-14…41, D-43, D-60.

| Status | Aantal |
|---|---|
| Set | 42 |
| Nog stil | 0 |
| Al luid | 42 |

_Alle ID’s in deze set hebben een journaal-telsite._

## Golf 5 checklist (R)

R-01…15, R-17…25.

| Status | Aantal |
|---|---|
| Set | 24 |
| Nog stil | 0 |
| Al luid | 24 |

_Alle ID’s in deze set hebben een journaal-telsite._

## Golf 6 checklist (REF)

REF-03…14.

| Status | Aantal |
|---|---|
| Set | 12 |
| Nog stil | 0 |
| Al luid | 12 |

_Alle ID’s in deze set hebben een journaal-telsite._

## Golf 7 checklist (O)

O-01…30, O-41…46 (O-40 skip-loud).

| Status | Aantal |
|---|---|
| Set | 36 |
| Nog stil | 0 |
| Al luid | 36 |

_Alle ID’s in deze set hebben een journaal-telsite._

