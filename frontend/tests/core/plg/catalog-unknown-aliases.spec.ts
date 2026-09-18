import { describe, expect, it } from 'vitest'
import { openingKindFromFmlRefid } from '@/core/plg/fml-adapter/opening-fml-refids'
import { fixtureKindFromFmlRefid } from '@/core/plg/fml-adapter/fixture-fml-refids'

describe('onbekende-catalogus aliases (2026-09-18)', () => {
  it('mapt Floorplanner-nummers naar opening-kinds', () => {
    expect(openingKindFromFmlRefid('218', 'window')).toEqual({ kind: 'window.single', known: true })
    expect(openingKindFromFmlRefid('206', 'door')).toEqual({ kind: 'door.flush', known: true })
    expect(openingKindFromFmlRefid('3263', 'door')).toEqual({
      kind: 'door.balcony',
      known: true,
    })
    expect(
      openingKindFromFmlRefid('9c845cf2ad8de220b65ee4dedeeb28ba4d750e21', 'door'),
    ).toEqual({ kind: 'door.french_balcony', known: true })
    expect(openingKindFromFmlRefid('204', 'door')).toEqual({ kind: 'door.half_glass', known: true })
    expect(openingKindFromFmlRefid('3264', 'door')).toEqual({ kind: 'door.elevator', known: true })
    expect(openingKindFromFmlRefid('212', 'door')).toEqual({ kind: 'door.garage', known: true })
    expect(openingKindFromFmlRefid('219', 'window')).toEqual({ kind: 'window.double', known: true })
    expect(openingKindFromFmlRefid('220', 'window')).toEqual({ kind: 'window.triple', known: true })
    expect(openingKindFromFmlRefid('7000', 'window')).toEqual({ kind: 'door.round', known: true })
    expect(openingKindFromFmlRefid('208', 'door')).toEqual({ kind: 'door.double', known: true })
    expect(openingKindFromFmlRefid('222', 'door')).toEqual({ kind: 'door.passage', known: true })
    expect(openingKindFromFmlRefid('6161', 'door')).toEqual({
      kind: 'door.sliding_single',
      known: true,
    })
    expect(openingKindFromFmlRefid('b3af7fd4e5a6cb72575a00e389cd45936a8ede7d', 'window')).toEqual({
      kind: 'window.grid',
      known: true,
    })
  })

  it('mapt trap- en hek-hashes naar fixture-kinds', () => {
    expect(fixtureKindFromFmlRefid('2fa75eaccb316cfe425443170a4c592ce744150d')).toEqual({
      kind: 'stair_straight',
      known: true,
    })
    expect(fixtureKindFromFmlRefid('aa120b01575651032fde11b1a73edbd14fc1e134')).toEqual({
      kind: 'stair_straight',
      known: true,
    })
    expect(fixtureKindFromFmlRefid('1370b0fb20e3fb98e25a86c30291ee80177bb20e')).toEqual({
      kind: 'railing',
      known: true,
    })
    expect(fixtureKindFromFmlRefid('74f724450aa8c35c6b6de2002b27acd6d4a39170')).toEqual({
      kind: 'railing',
      known: true,
    })
    expect(fixtureKindFromFmlRefid('80e78b8385c1474321e95290e0478c4135c4b246')).toEqual({
      kind: 'column',
      known: true,
    })
    expect(fixtureKindFromFmlRefid('755f931e2b6ce0b0550475d705bda3fb16172bc2')).toEqual({
      kind: 'column_round',
      known: true,
    })
    expect(fixtureKindFromFmlRefid('575283d4277c38c85c9ccd1f2541560270224483')).toEqual({
      kind: 'stair_winder_270',
      known: true,
    })
    expect(fixtureKindFromFmlRefid('8d570e6107cc9797e86fb3b432c0ee93e040b78e')).toEqual({
      kind: 'railing',
      known: true,
    })
    expect(fixtureKindFromFmlRefid('7526c516ba52af0746a985899c71dcd54b3036f1')).toEqual({
      kind: 'sink_large',
      known: true,
    })
    expect(fixtureKindFromFmlRefid('f4dfb1284c71db8a36d38366191b11bffc1a0aad')).toEqual({
      kind: 'stair_c_90',
      known: true,
    })
    expect(fixtureKindFromFmlRefid('be2676cebc67e106722cb9e8f6e0d662263e84e4')).toEqual({
      kind: 'balustrade_glass',
      known: true,
    })
    expect(fixtureKindFromFmlRefid('a32b295d3151d42cb5809d7ae24f5b7eaad800f2')).toEqual({
      kind: 'doorbell',
      known: true,
    })
    expect(fixtureKindFromFmlRefid('46545216942e52eba957507812a889d8a73fdf9c')).toEqual({
      kind: 'railing',
      known: true,
    })
    expect(fixtureKindFromFmlRefid('0a74fe428df1ffbc0d4eb91a1f5d93e810c02ac8')).toEqual({
      kind: 'stair_l_90',
      known: true,
    })
    expect(fixtureKindFromFmlRefid('6a7f42be0fe9ad75f553aff035ef99a88b2f5b4f')).toEqual({
      kind: 'stair_l_90_up',
      known: true,
    })
    expect(fixtureKindFromFmlRefid('e701f9f4b4cced9ece89e1a9be7ff16b3e8ebdc0')).toEqual({
      kind: 'stair_loft_dashed',
      known: true,
    })
    expect(fixtureKindFromFmlRefid('217a4cc8c41ce47c5a3af1c87b665aed5ad5ef84')).toEqual({
      kind: 'doorbell',
      known: true,
    })
    expect(fixtureKindFromFmlRefid('f4ac4e40e32c7e6b0dacb52c390e94462095943e')).toEqual({
      kind: 'awning',
      known: true,
    })
    expect(fixtureKindFromFmlRefid('82f13d6382a3da7ae33a69db81eccb5baec5ec2f')).toEqual({
      kind: 'balustrade_glass',
      known: true,
    })
    expect(fixtureKindFromFmlRefid('5a29a61452bd6d28398a56eb3ac559fa5f2f8a9c')).toEqual({
      kind: 'bathtub_square',
      known: true,
    })
    expect(fixtureKindFromFmlRefid('3eccd07e62d16033ccc432437a698441fdb39904')).toEqual({
      kind: 'stair_straight',
      known: true,
    })
    expect(fixtureKindFromFmlRefid('154ef47edc578f74c3c939bbbdddc992fb03152e')).toEqual({
      kind: 'ramp',
      known: true,
    })
    expect(fixtureKindFromFmlRefid('4589a832b430a438497532cf949c0fca4422e5fa')).toEqual({
      kind: 'stair_u_landing',
      known: true,
    })
  })
})
