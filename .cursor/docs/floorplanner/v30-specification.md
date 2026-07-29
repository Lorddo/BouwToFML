> ## Documentation Index
> Fetch the complete documentation index at: https://floorplanner.readme.io/llms.txt
> Use this file to discover all available pages before exploring further.

# v3.0 Specification

# Introduction

While we're still supporting XML, JSON is going to become our primary
format soon. Our editor API also exposes the state of currently edited
floorplan, so this documentation will help those who need to use it for
various purposes at runtime.

## A good way to explore the format

You can examine the state of currently edited [floorplan](#floorplan)
via the editor API property called *state*. The API is available as
`window.api`. You can start a new project, draw something in the
editor and check the state in browser's developer console. Drawing a
single wall and checking `api.state.walls[0]` is a good start. Also,
note the [section](#runtime-vs-persistent) about runtime format vs
persistent format.

# The format

## Using Typescript notation

In order to describe the format, we decided to use
[Typescript](https://www.typescriptlang.org/) notation. This will
allow to show what properties each object has and of what data
type. Furthermore, this will allow declaring nested objects and
frequently used sets of properties as separate interfaces with their
own names, making it easier to comprehend.

## Runtime vs persistent

At runtime, a [floorplan](#floorplan) is represented by one big javascript
object. That's what you'll get from editor's API. When a floorplan is
saved or when it's exported as JSON, we use slightly different format
we call *persistent*. That's the format we describe in this
document. It doesn't contain some of runtime properties, and the one
called `asset` is replaced by `refid`. References to assets are
resolved when the plan is loaded, and the rest of runtime properties are
derived from those stored in the persistent format.

## Project

When you start working on a plan in Flooplanner, you start with a
*project*. A *project* has one or more [floors](#floor).

```typescript
interface Project {
    id: number;
    name: string;
    public: boolean;
    settings?: ProjectSettings;
    floors: Floor[];
}
```

### Project settings

One important attribute of a project is `settings`. It
contains a lot of configuration options specific for given project.

```typescript
interface ProjectSettings {
    wallHeight: number;
    wallSectionHeight: number;
    wallThickness: number;
    wallOuterThickness: number;
    useMetric: boolean;
    showGrid: boolean;
    showDims: boolean;
    showShortDims: boolean;
    showAreaDims: boolean;
    generateOuterDimension: boolean;
    showDropShadows: boolean;
    showObjects: boolean;
    showFixtures: boolean;
    showItemOutline: boolean;
    showObjectColour: boolean;
    showStructuralColour: boolean;
    showFloorsBelow: boolean;
    showObjects3d: boolean;
    showObjectMono: boolean;
    showLights: boolean;
    useSection3D: boolean;
    showLabels: boolean;
    areaLabelOutline: boolean;
    areaLabelLetterSpacing: number;
    dimLineLabelHorizontal: boolean;
    exportLabels3D: boolean;
    showShadows3D: boolean;
    exportOrtho3D: boolean;
    visuals: "ALL" | "BW" | "BWC";
    showTexts: boolean;
    arrowHeadType: "arrow-stop" | "stop" | "reverse-arrow-stop" | "arrow";
    northArrowRotation: number;
    northArrowKind: number;
    blueprintMode: boolean;
    dimLineFont: string;
    hideItemsAboveHeight: number;
    hideItemsAbove: boolean;
}
```

## Floor

A *floor* is a container for [designs](#floorplan), which are actual
*Floorplans*. It's also used as a container for [cameras](#camera), which are
shared between desings on the same floor.

```typescript
interface Floor {
    id: number;
    name: string;
    level: number;
    height: number; // default wall height
    designs: Floorplan[];
    cameras: Camera[];
    drawing?: Drawing
}
```

### Drawing

Another important attribute a *floor* may contain is called
*drawing*. It is an image a user can upload and then draw the plan on
top of it. Useful for tracing scans of paper floorplans.

```typescript
interface Drawing {
    x: number;				// position of the drawing on the plan
    y: number;
    width: number;			// size of the drawing in cm
    height: number;
    visible: boolean;
    url: string;
    rotation: number;		// in degrees
    alpha: number;
    depth?: "LOW" | "HIGH"	// drawn above or below the floorplan
}
```

### Camera

Cameras are used as viewpoints to create 3D renders of floorplans.

```typescript
interface Camera {
    id: number;
    name: string;
    type_name: 'orbital' | 'walkthrough';
    x: number;		// position
    y: number;
    z: number;
    ux: number;		// direction of normals
    uy: number;
    uz: number;
    dx: number;		// direction of camera
    dy: number;
    dz: number;
    fov: number;	// field of view, in degrees
    lightSettings: CameraLightSettings;
    background_image: PresetSky | UserDefinedSky | {}
}
```

#### Camera light settings

Each camera has light environment settings, which describe the
position of the sun on the sky (if it's a day) as well as light
intensity.

```typescript
interface CameraLightSettings {
    altitude: number;
    azimuth: number;
    day: boolean;
    intensity: number;
    profile: boolean;
}
```

#### Camera background image

A camera may have a background image. Either a preset one or an image uploaded
by the user.

```typescript
interface PresetSky {
    sky_id: number;
    url: string;
    type_name: 'sphere'
}

interface UserDefinedSky {
    url: string;
    type_name: 'plane'
}
```

## Floorplan

Floorplan is the core object in Floorplanner. It describes things like
walls, doors, windows and furniture items.

```typescript
interface Floorplan {
    id: number;
    name: string;
    walls: Wall[];
    areas: Area[];
    surfaces: Surface[];
    dimensions: Dimension[];
    items: Item[];
    labels: Label[];
    lines: Line[];
    settings?: DesignSettings;
}
```

Before we go on describing all these types, let's introduce a few
basic ones used in multiple places in a floorplan.

We use centimeters for coordinates. The *X* axis is directed from left
to right and the *Y* axis - from the top to the bottom of the screen.

```typescript
interface Point {
    x: number;
    y: number;
}
```

Not all the floorplan coordinates are 3D. We use the third dimension
when needed.

```
interface Point3D extends Point {
    z: number;
}
```

For colors, we use a string starting with the *#* symbol and having
six hexadecimal digits.

```
type Color = string
```

All the lines in a Floorplan have two endpoints we refer to as *a* and
*b*. When the direction is important, we say that the line *goes from
a to b*.

```typescript
interface GenericLine {
    a: Point;
    b: Point;
}
```

### Wall

A wall is defined by the coordinates of the endpoints of its centerline. Curved walls also have the
control point. Wall balance defines how much of wall thickness goes to
the left and to the right of the centerline.

Terms *left* and *right* are also used when decorating a wall and, at
runtime, for holding data about wall's outline. Imagine standing at
point *a* and looking at point *b*. The left side then will be to the
left and the right side - to the right.

```typescript
interface Wall extends GenericLine {
    c?: Point | null; // control point for curved walls (quadratic bezier)
    az: Endpoint3D;
    bz: Endpoint3D;
    thickness: number; // in cm
    balance: number; // 0..1
    openings: Opening[];
    decor: WallDecor;
};
```

Note that each endpoint also has two z-coordinates: the lower and the higher.

```typescript
interface Endpoint3D {
    z: number; // elevation of the bottom of the wall's endpoint
    h: number; // elevation of the top of the wall's endpoint
}
```

#### Openings

A wall also serves as a container for openings - doors and
windows. Type of the door or window is defined by the referenced
asset. The `t` parameter describes the horizontal position of the opening relative to wall's endpoints. When it's 0, the middle of the opening is over the endpoint *a*, when 1 - over the endpoint *b*.

```typescript
interface GenericOpening {
    refid: string;
    width: number;
    z: number; // elevation
    z_height: number; // height
    t: number; // 0..1 - relative position of the opening on the wall
    frameColor?: Color;
}

interface Door extends GenericOpening {
    type: 'door';
    mirrored: [0 | 1, 0 | 1]; // vertical and horizontal flipping
    doorColor?: Color;
}

interface Window extends GenericOpening {
    type: 'window'
}
```

#### Decor

Finally, each side of a wall may be independently decorated with
a color, a material or an image uploaded by the user.

```typescript
interface WallDecor {
    left: WallSideDecor;
    right: WallSideDecor;
}

type WallSideDecor = null | WallSideWithColor | WallSideWithMaterial | WallSideWithTexture;

interface WallSideWithColor {
    color: Color;
}

interface WallSideWithMaterial {
    refid: string;
}

interface WallSideWithTexture {
    texture: WallTexture;
}

interface WallTexture {
    src: string;	// url to the image
    fit: 'free' | 'no-stretch' | 'fill' | 'contain' | 'tile-horizontally' | 'tile-vertically' | 'tile-both';
    tlx: number;	// top left corner coordinates on the wall side
    tly: number;
    brx: number;	// bottom right corner coordinates on the wall side
    bry: number;
}
```

### Area

Areas in Floorplanner are generated automatically, whenever plan walls
make closed spaces. Quite often areas have a texture applied to them,
hence a set of texture-specific properties.

```typescript
interface TextureProps {
    rotation?: number; // rotation of the texture, in degrees, if a texture applied and rotation is not zero
    tx?: number; // horizontal texture offset, in pixels, if a texture is applied and if the offset is not zero
    ty?: number; // vertical texture offset, in pixels, if a texture is applied and if the offset is not zero
    sx?: number; // horizontal texture scale, in %, if a texture is applied and scale is not 100%
    sy?: number; // vertical texture scale, in %, if a texture is applied and scale is not 100%
}
```

Another set of area attributes is related to its purpose - an area may
have a name, either a standard one representing one of room types, or
a custom one. The same set of attributes is also used by [surfaces](#surface).

```typescript
interface AreaProps extends TextureProps {
    refid?: string;
    color: Color;
    showSurfaceArea?: boolean;
    showAreaLabel: boolean;

    name?: string;			// standard name, derived from the applied roomtype
    customName?: string;	// custom name, if supplied
    role?: number;			// roomtype identifier, if a roomtype is applied
    name_x?: number;		// area label position, horizontal offset from the area polygon centroid, in metres
    name_y?: number;		// area label position, vertical offset from the area polygon centroid, in metres
}
```

Finally, the shape of the area is represented by an array of 2D
points. Note that these points are located on edges of walls (not
on their center lines).

```typescript
interface Area extends AreaProps {
    poly: Point[];
    ceiling?: Ceiling;
    roomstyle_id?: string;  // if a roomstyle was chosen for this area
};
```

### Surface

Surfaces are quite similar to areas and share many attributes. They
are used for drawing special purpose stuctures such as roofs or
cutouts, as well area-like structures without walls. For instance,
a patch of grass in the garden. Unlike areas, surfaces are drawn
point-by-point by the user.

```typescript
interface Surface extends AreaProps {
    poly: SurfacePoint[];
    isRoof?: boolean;
    isCutout?: boolean;
    transparency?: number;
};
```

Sufaces can also be elevated, therefore their points have the *z*
coordinate. Curves for surfaces are also modelled differently, areas
use approximation with straight segments for curved walls.

```typescript
interface Point3D extends Point {
    z: number;
}

interface BezierPoint extends Point {
    cx: number;
    cy: number;
    cz?: number;
}

type SurfacePoint = Point3D | BezierPoint;
```

### Dimension line

Dimension line is one of the simplest types in the Floorplan. It's
label shows the length of the corresponding line.

```typescript
interface Dimension extends GenericLine {
    type: 'custom_dimension';
}
```

### Item

Furniture items, structural elements, icons and symbols - they all are
item objects in the floorplan. Exact type of the item is defined by
its asset, referenced by the `refid` attribute.

```typescript
interface Item extends Point3D {
    refid: string;
    width: number;
    height: number;
    z_height: number;
    rotation: number;
    mirrored?: [0 | 1, 0];
    light?: Light;
    materials?: SmartMaterials;
}
```

#### Light

Some of items represent light sources. In such case they also have the
`light` attribute containing the following data structure.

```typescript
interface Light {
    on: boolean;  // a light can be switched off
    color: Color;
    watt: number; // light intensity, integer in range 0..200
}
```

#### Smart items

Some of items are so-called *smart items*. These may have some of
their materials swapped, resulting in multiple variations with the
same geometry. Think of a table with a set of material options for its
top and legs.

```typescript
interface SmartMaterials {
    [materialName: string]: number;
}
```

The list of material names and available options is defined by the
asset for given item.

### Label

Labels represent formatted pieces of text in the floorplan.

```typescript
interface Label extends Point {
    text: string;
    fontFamily: string;
    fontSize: number;			// in px
    letterSpacing: number;		// in %
    fontColor: Color;
    backgroundColor: Color;
    backgroundAlpha?: number;	// in %
    align: 'left' | 'center' | 'right';
    rotation: number;
    outline?: boolean;
    bold?: boolean;
    italic?: boolean;
}
```

### Line

Lines are usually added to the floorplan for the notation purpose.

```typescript
interface Line extends GenericLine {
    type: 'solid_line' | 'dashed_line' | 'dotted_line' | 'dashdotted_line';
    color: Color;
    thickness: number; // in pixels
}
```

### Design settings

Finally, there are several settings stored in each floorplan. This
means that they can vary from one plan to another, even on the same
floor.

```
interface DesignSettings {
    engineAutoThickness: boolean;		// no longer used, always false
    engineAutoDims: boolean;			// automatically generate dimension lines
    areaLabelMultiplier: number;		// text scale factor for area labels
    scaleMultiplierDimensions: number;	// text scale factor for dimension text
    scaleMultiplierComments: number;	// text scale factor for regular labels
    showCeilings3D: boolean;
    minWallLength?: number;				// defaults to 4; walls shorter than this size are discarded
}
```