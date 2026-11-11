// Original schematic EV geometry; no manufacturer CAD or third-party model.
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { mkdir, writeFile } from 'node:fs/promises';
class ExportFileReader {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then(result => { this.result = result; this.onloadend?.(); }); }
}
globalThis.FileReader = ExportFileReader;
const assets = new URL('./assets/', import.meta.url);
await mkdir(assets, {recursive:true});
const material = (color, metalness=.2, roughness=.4) => new THREE.MeshStandardMaterial({color,metalness,roughness});
const paint=material('#477c71',.55,.3), glass=material('#253d48',.4,.2), rubber=material('#252a2c',0,.85);
const alloy=material('#b9c7c8',.8,.25), dark=material('#39474b',.4,.5), copper=material('#de9055',.5,.35), batteryPaint=material('#d8ab55',.3,.45), blue=material('#638fa7',.45,.35);
const groups=Object.fromEntries(['body','chassis','battery','drive','electronics','wheels'].map(name=>{const g=new THREE.Group();g.name=name;return [name,g]}));
function mesh(group,name,geometry,mat,position=[0,0,0],rotation=[0,0,0]) {
 const item=new THREE.Mesh(geometry,mat);item.name=name;item.position.fromArray(position);item.rotation.set(...rotation);groups[group].add(item);return item;
}
const box=(group,name,size,mat,pos)=>mesh(group,name,new THREE.BoxGeometry(...size),mat,pos);
function extrusion(group,name,outline,depth,mat) {
 const shape=new THREE.Shape();outline(shape);
 const geometry=new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:true,bevelThickness:.025,bevelSize:.025,bevelSegments:2,steps:1,curveSegments:20});
 geometry.translate(0,0,-depth/2);return mesh(group,name,geometry,mat);
}
extrusion('body','Sculpted body with four wheel openings',s=>{
 s.moveTo(-2.3,.53);s.lineTo(-2.28,.85);s.quadraticCurveTo(-2.1,1.0,-1.25,1.01);s.lineTo(1.25,1.01);s.quadraticCurveTo(2.2,.99,2.3,.77);s.lineTo(2.3,.53);
 s.lineTo(1.91,.53);s.bezierCurveTo(1.91,1.05,.99,1.05,.99,.53);s.lineTo(-.99,.53);s.bezierCurveTo(-.99,1.05,-1.91,1.05,-1.91,.53);s.closePath();
},1.72,paint);
extrusion('body','Glazed cabin',s=>{s.moveTo(-1.3,1.0);s.lineTo(-.8,1.53);s.quadraticCurveTo(-.7,1.62,-.45,1.63);s.lineTo(.5,1.59);s.lineTo(1.25,1.0);s.closePath();},1.42,glass);
extrusion('body','Painted roof panel',s=>{s.moveTo(-.83,1.53);s.quadraticCurveTo(-.7,1.65,-.45,1.66);s.lineTo(.51,1.62);s.lineTo(.57,1.56);s.lineTo(-.77,1.49);s.closePath();},1.48,paint);
for(const z of [-.745,.745]) {
 mesh('body','B pillar',new THREE.BoxGeometry(.065,.58,.055),paint,[-.1,1.28,z]);
 box('body','Door handle',[.18,.035,.035],alloy,[.3,.95,z*1.17]);
 box('body','Mirror',[.2,.11,.19],paint,[.85,1.08,z*1.25]);
}
for(const z of [-.59,.59]) {
 box('body','LED headlight',[.06,.105,.45],material('#f4e9c7',.1,.2),[2.27,.78,z]);
 box('body','Rear light',[.05,.085,.47],material('#b94f43',.1,.35),[-2.29,.77,z]);
}
box('body','Lower front intake',[.07,.13,1.25],dark,[2.3,.58,0]);
box('body','Rear bumper',[.07,.12,1.38],dark,[-2.3,.57,0]);
// Ladder-like frame and crossmembers under the body.
for(const z of [-.7,.7]) box('chassis','Longitudinal frame rail',[3.95,.14,.12],dark,[0,.38,z]);
for(const x of [-1.55,-.65,.65,1.55]) box('chassis','Crossmember',[.13,.12,1.45],alloy,[x,.38,0]);
for(const x of [-1.45,1.45]) mesh('chassis','Axle schematic',new THREE.CylinderGeometry(.045,.045,1.75,16),alloy,[x,.39,0],[Math.PI/2,0,0]);
box('battery','Sealed underfloor battery enclosure',[2.45,.23,1.28],batteryPaint,[-.05,.5,0]);
for(let x=-1.05;x<1.1;x+=.35) box('battery','Module cover seam',[.018,.01,1.21],dark,[x,.622,0]);
for(const z of [-.65,.65]) box('battery','Battery enclosure flange',[2.48,.045,.06],alloy,[-.05,.42,z]);
mesh('drive','Traction motor casing',new THREE.CylinderGeometry(.23,.23,.61,32),blue,[-1.45,.6,0],[Math.PI/2,0,0]);
mesh('drive','Reduction gearbox',new THREE.CylinderGeometry(.18,.18,.22,24),alloy,[-1.45,.59,.4],[Math.PI/2,0,0]);
for(let z=-.27;z<=.28;z+=.09) mesh('drive','Motor cooling fin',new THREE.TorusGeometry(.235,.012,6,32),alloy,[-1.45,.6,z]);
box('electronics','Power electronics enclosure',[.58,.2,.54],copper,[-1.45,.95,0]);
for(let x=-1.67;x<-1.2;x+=.075) box('electronics','Inverter cooling fin',[.018,.035,.49],alloy,[x,1.065,0]);
const cable=new THREE.CatmullRomCurve3([new THREE.Vector3(-.9,.66,.25),new THREE.Vector3(-1.02,.85,.3),new THREE.Vector3(-1.25,.91,.3)]);
mesh('electronics','High-voltage cable',new THREE.TubeGeometry(cable,20,.028,8,false),copper);
for(const x of [-1.45,1.45]) for(const z of [-.93,.93]) {
 mesh('wheels','Tyre',new THREE.CylinderGeometry(.405,.405,.24,48),rubber,[x,.405,z],[Math.PI/2,0,0]);
 const face=z+Math.sign(z)*.125;
 mesh('wheels','Brake disc',new THREE.CylinderGeometry(.27,.27,.012,32),dark,[x,.405,face],[Math.PI/2,0,0]);
 mesh('wheels','Alloy rim',new THREE.TorusGeometry(.29,.028,8,40),alloy,[x,.405,face]);
 mesh('wheels','Wheel hub',new THREE.CylinderGeometry(.07,.07,.03,20),alloy,[x,.405,face+Math.sign(z)*.01],[Math.PI/2,0,0]);
 for(let i=0;i<5;i++) {
  const a=i*Math.PI*2/5;
  mesh('wheels','Wheel spoke',new THREE.BoxGeometry(.065,.45,.035),alloy,[x,.405,face],[0,0,a]);
 }
}
const description={
 body:['Body and cabin','The outer shell defines the silhouette and encloses the cabin. This schematic omits detailed crash structures and interior trim.','#477c71',[0,1.65,0]],
 chassis:['Chassis and axles','The frame supports the main assemblies. Axles are simplified here; real suspension and steering linkages contain many more parts.','#39474b',[0,-.3,0]],
 battery:['Traction battery','Stores electrical energy for propulsion. Here the flat pack sits between the axles, below the cabin.','#d8ab55',[0,.35,0]],
 drive:['Motor and reduction gear','The electric motor produces torque. A reduction gear passes that torque to the driven wheels; this example illustrates rear-wheel drive.','#638fa7',[-.65,.7,0]],
 electronics:['Power electronics','Controls electrical power delivered to the traction motor. The orange cable indicates the electrical connection, not a wiring specification.','#de9055',[-.7,.8,1.35]],
 wheels:['Wheels and tyres','Tyres are the contact between the vehicle and road. The geometry shows wheel, rim and hub depth; the brakes and suspension are schematic.','#555f62',[0,-.15,.45]],
};
const all=new THREE.Group();all.name='Original schematic electric coupe';
for(const group of Object.values(groups)) all.add(group.clone());
const exporter=new GLTFExporter();
async function save(name,object){const data=await exporter.parseAsync(object,{binary:true});await writeFile(new URL(name,assets),new Uint8Array(data));return data.byteLength;}
console.log('car.glb',await save('car.glb',all));
const objects=[];
for(const [key,group] of Object.entries(groups)) {
 const bounds=new THREE.Box3().setFromObject(group),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
 const [label,desc,color,offset]=description[key];
 objects.push({shape:'model',label,description:desc,src:`/assets/car-${key}.glb`,color,position:center.toArray().map((n,i)=>Number((n+offset[i]).toFixed(5))),scale:Number((Math.max(...size.toArray())/2.6).toFixed(6))});
 console.log(`car-${key}.glb`,await save(`car-${key}.glb`,group));
}
await writeFile(new URL('./exploded.json',import.meta.url),JSON.stringify({title:'An electric car, layer by layer',description:'Select a component in the model or use the labelled buttons. The separated positions are an explanatory exploded view, not an assembly procedure.',background:'#edf1ef',poster:{src:'/assets/car-exploded.jpg',alt:'Exploded car: green body above a gold battery, grey chassis and wheels, with blue motor and orange power electronics separated to the rear.'},objects},null,2)+'\n');
