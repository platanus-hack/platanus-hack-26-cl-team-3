# Vehicle maps prototype

Open `index.html` directly in a current desktop or mobile browser. The eight
schematic maps work offline. The Outback also has a photo with selectable 3D
parts and a photo-only view. Both photo modes load the reference from its
publisher. If the image is unavailable, the viewer returns to the schematic.

The Outback 3.6R Limited reference is a photo of the 2016 Canadian model taken
by Michel Deslauriers for The Car Guide. Its full engine bay shows the washer
cap that is partly cropped in the Cars101 comparison photo. The nine part
footprints were traced against the full photo and checked against Subaru's
North American owner's manual (engine bay, p. 11-10). The engine and cabin fuse
diagrams are linked separately (pp. 12-12–12-13 and 12-10–12-11 respectively).

The catalog stores image-relative footprints and approximate extrusion heights.
Measure the actual vehicle and test on-vehicle tracking before using these
positions as AR anchors.

Keep photos that lack a documented license on their original sites. For a local
preview with an approved photo, set `photoFile` and `aspectRatio` for an entry
and use footprints calibrated to that image and crop.
