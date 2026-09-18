import { WebGPUEngine } from '@babylonjs/core/Engines/webgpuEngine';
import '@babylonjs/core/Engines/WebGPU/Extensions/index';
import { Scene } from '@babylonjs/core/scene';
import { SceneInstrumentation } from '@babylonjs/core/Instrumentation/sceneInstrumentation';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color4 } from '@babylonjs/core/Maths/math.color';
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader';
import '@babylonjs/loaders/glTF';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { MeshSurface } from '../terrain/meshSurface.js';
import { ForestSystem } from './ForestSystem.js';
import { DEFAULTS } from './chunks.js';
import { smoothGroundColors } from './groundColors.js';

const $=id=>document.getElementById(id),canvas=$('forest-view'),status=$('status');
const keys=new Set();let yaw=Math.PI/2,pitch=.05,forest,engine,scene,camera,surface,groundContainer,instrumentation;
let recording=null,lastReport=null,samples=[],lastUI=0,resizePending=false;
const controls=[
    ['Vegetation',[['trees','Trees'],['bushes','Bushes'],['grass','Grass'],['density','Plant density',.1,1,.05],['grounded','Ground plant bases on map']]],
    ['Detail and distance',[['lod','Use LOD'],['impostors','Distant tree cards'],['nearDistance','Full detail distance',8,80,1],['farDistance','Tree card distance',40,220,5],['treeDistance','Tree visibility',80,500,10],['bushDistance','Bush visibility',15,130,5],['grassDistance','Grass visibility',8,90,2]]],
    ['Shadows',[['shadows','Nearby shadows'],['shadowDistance','Shadow distance',20,100,5]]],
    ['Wind and movement',[['windStrength','Wind strength',0,2,.05],['windSpeed','Wind speed',0,3,.05],['windDirection','Wind direction',0,360,1],['freeze','Freeze wind'],['collisions','Trunk collisions']]],
];
const pending={...DEFAULTS};
const resolution=document.createElement('label');resolution.className='slider';
resolution.innerHTML='<span>Render scale</span><output>100%</output><input type="range" min="50" max="150" step="10" value="100">';
resolution.querySelector('input').addEventListener('input',e=>{
    const scale=Number(e.target.value)/100;resolution.querySelector('output').textContent=`${e.target.value}%`;
    engine?.setHardwareScalingLevel(1/scale);samples=[];
});
$('controls').append(resolution);
for(const [title,items] of controls) {
    const group=document.createElement('fieldset'),legend=document.createElement('legend');legend.textContent=title;group.append(legend);
    for(const [key,title,min,max,step] of items) {
        const label=document.createElement('label'),input=document.createElement('input'),name=document.createElement('span');name.textContent=title;input.id=`forest-${key}`;
        if(min===undefined){input.type='checkbox';input.checked=!!pending[key];label.append(input,name);}
        else{label.className='slider';input.type='range';Object.assign(input,{min,max,step,value:pending[key]});const value=document.createElement('output');value.textContent=input.value;label.append(name,value,input);input.addEventListener('input',()=>value.textContent=input.value);}
        input.addEventListener('input',()=>{pending[key]=input.type==='checkbox'?input.checked:Number(input.value);forest?.configure(pending);samples=[];});
        group.append(label);
    }
    $('controls').append(group);
}
function reset(){const x=-680,z=170,y=surface.sample(x,z);camera.position.set(x,y+($('fly').checked?14:1.7),z);yaw=Math.PI/2;pitch=$('fly').checked?.2:0;keys.clear();forest.force=true;samples=[];}
function percentiles(values){const sorted=[...values].sort((a,b)=>a-b);return{median:sorted[Math.floor(sorted.length*.5)]||0,p95:sorted[Math.floor(sorted.length*.95)]||0,p99:sorted[Math.floor(sorted.length*.99)]||0};}
function snapshot(){return{options:{...forest.options},viewport:{width:engine.getRenderWidth(),height:engine.getRenderHeight(),devicePixelRatio:devicePixelRatio},camera:camera.position.asArray(),rotation:camera.rotation.asArray(),stats:{...forest.stats},source:forest.manifest.sha256};}
function lockMeasurement(locked){document.querySelectorAll('#controls input,#reset,#fly,#record').forEach(input=>input.disabled=locked);}
async function boot(){
    if(!navigator.gpu)throw Error('This demo requires a WebGPU-capable browser.');
    engine=new WebGPUEngine(canvas,{antialias:false});await engine.initAsync();
    scene=new Scene(engine);scene.clearColor=new Color4(.65,.73,.79,1);scene.skipPointerMovePicking=true;
    // Resets Babylon's draw counter at each scene frame, including shadow passes.
    instrumentation=new SceneInstrumentation(scene);
    camera=new FreeCamera('forest-camera',new Vector3(-680,60,170),scene);camera.minZ=.1;camera.maxZ=900;camera.fov=.95;scene.activeCamera=camera;
    status.textContent='Loading the current Exalted terrain…';
    groundContainer=await LoadAssetContainerAsync(`${import.meta.env.BASE_URL}assets/exalted/alpha-map.glb`,scene);
    const ground=groundContainer.meshes.find(m=>m.name==='vis_ground');if(!ground)throw Error('Missing alpha-map terrain');
    const data=VertexData.ExtractFromMesh(ground,true,true);data.transform(ground.computeWorldMatrix(true));
    ground.parent=null;ground.position.set(0,0,0);ground.scaling.set(1,1,1);ground.rotationQuaternion=null;ground.rotation.set(0,0,0);
    const authoredColors=data.colors;
    data.colors=smoothGroundColors(data.positions,authoredColors);
    data.uvs=new Float32Array(data.positions.length/3*2);data.applyToMesh(ground);ground.isPickable=false;groundContainer.addAllToScene();
    surface=new MeshSurface(data.positions,data.indices,16,authoredColors);
    forest=new ForestSystem(scene,{heightAt:(x,z)=>surface.sample(x,z),options:pending});ground.material=forest.createGroundMaterial();
    status.textContent='Loading prototypes and 32 m chunks…';await forest.load(message=>status.textContent=message);
    reset();$('reset').disabled=$('record').disabled=false;
    status.textContent='Ready · click the scene to explore';
    globalThis.EXALTED_FOREST={engine,scene,camera,forest,surface};
    let previous=performance.now();
    engine.runRenderLoop(()=>{
        if(resizePending){engine.resize();resizePending=false;}
        const now=performance.now(),ms=now-previous;previous=now;const dt=Math.min(ms/1000,.05);
        const speed=keys.has('ShiftLeft')||keys.has('ShiftRight')?18:5;
        let x=Number(keys.has('KeyD'))-Number(keys.has('KeyA')),z=Number(keys.has('KeyW'))-Number(keys.has('KeyS'));
        const length=Math.max(1,Math.hypot(x,z));x/=length;z/=length;
        const velocity=new Vector3((Math.sin(yaw)*z+Math.cos(yaw)*x)*speed,0,(Math.cos(yaw)*z-Math.sin(yaw)*x)*speed);
        const body=camera.position.clone();body.y-=1.7;
        if(forest.options.collisions)forest.collisions.move(body,velocity,dt);
        else{body.x+=velocity.x*dt;body.z+=velocity.z*dt;}
        surface.clampToPlayArea(body);camera.position.x=body.x;camera.position.z=body.z;
        const floor=surface.sample(body.x,body.z);
        if($('fly').checked){
            const vertical=(Number(keys.has('Space'))-Number(keys.has('ControlLeft')||keys.has('ControlRight')))*speed*dt;
            const next=forest.options.collisions?forest.collisions.verticalLimit(body,body.y+vertical):body.y+vertical;
            camera.position.y=Math.max(floor+1.7,next+1.7);
        }else camera.position.y=floor+1.7;
        camera.rotation.set(pitch,yaw,0);forest.update(camera,dt);scene.render();
        samples.push(ms);if(samples.length>240)samples.shift();
        if(recording){recording.frames.push(ms);recording.draws.push(instrumentation.drawCallsCounter.current);recording.triangles.push(forest.stats.visibleTriangles);
            if(now-recording.start>=10000){lastReport={...recording.snapshot,end:snapshot(),durationMs:now-recording.start,frames:recording.frames.length,frameMs:percentiles(recording.frames),meanDrawCalls:recording.draws.reduce((a,b)=>a+b,0)/recording.draws.length,maxVisibleTriangles:Math.max(...recording.triangles)};recording=null;lockMeasurement(false);$('download').disabled=false;status.textContent='Measurement complete. Download the JSON to compare settings.';}}
        if(now-lastUI>300){lastUI=now;const t=percentiles(samples),s=forest.stats;
            $('stats').textContent=`Frame median / p95: ${t.median.toFixed(1)} / ${t.p95.toFixed(1)} ms\nApprox. FPS: ${(1000/t.median).toFixed(0)}\nDraw calls / frame (all passes): ${instrumentation.drawCallsCounter.current}\nVisible vegetation batches: ${s.visibleBatches}\nVisible primitive instances: ${s.visiblePrimitiveInstances}\nVisible vegetation triangles: ${s.visibleTriangles.toLocaleString()}\nSelected LOD 0 / 1 / cards: ${s.near} / ${s.medium} / ${s.far}\nShadow batches: ${s.shadowBatches}\nForest update CPU: ${s.cpuUpdateMs.toFixed(2)} ms\nChunks (32 m): ${s.chunks}\nAuthored plants: ${s.authoredPlants}\nLoad/preparation: ${(s.loadMs/1000).toFixed(2)} s\nAuthored base mismatch >20cm: ${s.grounding.over20cm}\nMedian ground delta: ${s.grounding.median.toFixed(2)} m\nGrounding: ${forest.options.grounded?'adjusted to alpha-map':'authored heights'}\nViewport: ${engine.getRenderWidth()} × ${engine.getRenderHeight()}\n${recording?'Recording…':''}`;
        }
    });
}
canvas.addEventListener('click',()=>{void canvas.requestPointerLock();});
document.addEventListener('mousemove',e=>{if(document.pointerLockElement!==canvas)return;yaw+=e.movementX*.002;pitch=Math.max(-1.3,Math.min(1.3,pitch+e.movementY*.002));});
window.addEventListener('keydown',e=>{if(document.pointerLockElement!==canvas)return;if(['Space','KeyW','KeyA','KeyS','KeyD'].includes(e.code))e.preventDefault();keys.add(e.code);});
window.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',()=>keys.clear());
document.addEventListener('pointerlockchange',()=>{if(document.pointerLockElement!==canvas)keys.clear();});
window.addEventListener('resize',()=>resizePending=true);
$('reset').addEventListener('click',reset);$('fly').addEventListener('change',()=>keys.clear());
$('record').addEventListener('click',()=>{recording={start:performance.now(),snapshot:snapshot(),frames:[],draws:[],triangles:[]};lockMeasurement(true);status.textContent='Recording for 10 seconds; keep the view fixed for a static comparison.';});
$('download').addEventListener('click',()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(lastReport,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='exalted-forest-performance.json';a.click();URL.revokeObjectURL(url);});
boot().catch(error=>{status.textContent=error.message;console.error(error);});
if(import.meta.hot)import.meta.hot.dispose(()=>{engine?.stopRenderLoop();forest?.dispose();instrumentation?.dispose();scene?.dispose();engine?.dispose();});
