// Original schematic geometry, generated locally. No third-party model or patient data.
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { writeFile } from 'node:fs/promises';
class ExportFileReader {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then(result => { this.result = result; this.onloadend?.(); }); }
}
globalThis.FileReader = ExportFileReader;
const heart = new THREE.Group(); heart.name = 'Schematic human heart';
const tissue = new THREE.MeshStandardMaterial({color: '#b44544', roughness: .56});
const atrium = new THREE.MeshStandardMaterial({color: '#ce6c62', roughness: .6});
const artery = new THREE.MeshStandardMaterial({color: '#b74d45', roughness: .46});
const vein = new THREE.MeshStandardMaterial({color: '#577a9b', roughness: .5});
function mesh(name, geometry, material, position=[0,0,0], scale=[1,1,1]) {
  const object = new THREE.Mesh(geometry, material); object.name=name;
  object.position.fromArray(position); object.scale.fromArray(scale); heart.add(object); return object;
}
const profile = [[0,-1.65],[.15,-1.53],[.37,-1.25],[.64,-.8],[.86,-.3],[.96,.2],[.9,.55],[.65,.8],[.25,.9],[0,.92]].map(([x,y])=>new THREE.Vector2(x,y));
const ventricle = new THREE.LatheGeometry(profile, 64);
const positions=ventricle.attributes.position;
for(let i=0;i<positions.count;i++) {
  const y=positions.getY(i), x=positions.getX(i), z=positions.getZ(i);
  positions.setXYZ(i,x+.23*(.8-y),y,z*.72);
}
ventricle.computeVertexNormals();
mesh('Ventricular muscle',ventricle,tissue);
mesh('Right atrial surface',new THREE.SphereGeometry(.58,40,32),atrium,[-.65,.61,.1],[.9,1.05,.9]);
mesh('Left atrial surface',new THREE.SphereGeometry(.5,40,32),atrium,[.56,.7,-.1],[1,1,.86]);
function tube(name, points, radius, material) {
 const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));
 mesh(name,new THREE.TubeGeometry(curve,64,radius,16,false),material);
}
tube('Aortic arch',[[.08,.62,-.12],[.05,1.25,-.15],[.2,1.65,-.17],[.65,1.7,-.2],[.94,1.35,-.35],[.98,.75,-.45]],.19,artery);
for (const [x,top] of [[.24,2.05],[.48,2.14],[.71,2.03]]) tube('Aortic branch',[[x,1.62,-.16],[x-.03,top,-.17]],.085,artery);
tube('Pulmonary trunk',[[.03,.3,.61],[-.04,.88,.55],[.04,1.22,.4],[.58,1.35,.26],[1.1,1.26,.12]],.18,vein);
tube('Pulmonary branch',[[.1,1.2,.35],[-.45,1.34,.15],[-1.04,1.31,0]],.13,vein);
tube('Superior vena cava',[[-.72,.7,.02],[-.78,1.18,-.03],[-.79,1.7,-.04]],.17,vein);
tube('Inferior vena cava',[[-.68,.38,-.1],[-.87,-.12,-.15],[-.88,-.63,-.18]],.16,vein);
for(const y of [.59,.91]) tube('Pulmonary vein',[[.62,y,-.13],[1.03,y+.07,-.18],[1.28,y+.1,-.22]],.105,artery);
// A shallow surface groove helps reveal the three-dimensional ventricular form.
tube('Surface groove',[[.04,.51,.69],[.15,.14,.74],[.33,-.4,.64],[.49,-.92,.43],[.57,-1.37,.22]],.024,new THREE.MeshStandardMaterial({color:'#883331',roughness:.8}));
const exporter = new GLTFExporter();
const glb=await exporter.parseAsync(heart,{binary:true,onlyVisible:true});
const destination=new URL('./assets/heart.glb',import.meta.url);
await writeFile(destination,new Uint8Array(glb));
console.log(`Generated original heart GLB (${glb.byteLength} bytes).`);
