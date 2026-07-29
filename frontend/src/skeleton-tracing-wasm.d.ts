declare module 'skeleton-tracing-wasm' {
  interface SkeletonTraceResult {
    polylines: number[][][]
    rects: number[][]
    width: number
    height: number
  }

  interface SkeletonTracer {
    fromBoolArray(data: ArrayLike<number | boolean>, width: number, height: number): SkeletonTraceResult
  }

  export default class TraceSkeleton {
    static load(): Promise<SkeletonTracer>
  }
}
