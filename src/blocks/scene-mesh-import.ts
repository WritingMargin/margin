import { Group, Mesh, MeshStandardMaterial } from "three";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { STLLoader } from "three/addons/loaders/STLLoader.js";

function parseObj(buffer: ArrayBuffer) {
  const source = new TextDecoder().decode(buffer).replace(/\\\r?\n/g, "");
  // OBJ expands each polygon to independent triangles in memory.
  let vertices = 0,
    groups = 0;
  for (const match of source.matchAll(/^[ \t]*([fogvlp])[ \t]+([^\r\n]*)/gm)) {
    if (match[1] === "o" || match[1] === "g") groups++;
    if (match[1] === "v") vertices++;
    if (["f", "l", "p"].includes(match[1])) {
      let entries = 0;
      for (const _ of match[2].matchAll(/\S+/g)) entries++;
      vertices += match[1] === "f" ? 3 * Math.max(0, entries - 2) : entries;
    }
    if (vertices > 2_000_000 || groups > 1000)
      throw new Error("Reduce the OBJ geometry before importing.");
  }
  return new OBJLoader().parse(source);
}

export function parseStaticMesh(buffer: ArrayBuffer, format: string) {
  if (format === "obj") return parseObj(buffer);
  // Reject incorrect facet counts before STLLoader allocates typed arrays.
  const binary =
    buffer.byteLength >= 84 &&
    84 + new DataView(buffer).getUint32(80, true) * 50 === buffer.byteLength;
  const header = String.fromCharCode(...new Uint8Array(buffer.slice(0, 9)));
  if (buffer.byteLength < 84 || (!binary && !/^[\s\S]{0,4}solid/.test(header)))
    throw new Error("Invalid STL header or facet count.");
  const geometry = new STLLoader().parse(buffer);
  const group = new Group();
  group.add(
    new Mesh(
      geometry,
      new MeshStandardMaterial({
        vertexColors: geometry.hasAttribute("color"),
      }),
    ),
  );
  return group;
}
