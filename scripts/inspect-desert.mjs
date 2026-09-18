/**
 * Explicit Playwright inspection of desert placement and LOD diagnostics. Requires a running dev server and user authorization to run browser automation; writes report and screenshot artifacts.
 * @module scripts/inspect-desert
 */

import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
const browser = await chromium.launch({channel:'chrome',args:['--enable-unsafe-webgpu','--ignore-gpu-blocklist']});
try {
    const page = await browser.newPage({viewport:{width:1280,height:800}});
    page.on('pageerror', e=>console.log('PAGEERROR',e.message));
    page.on('console', m=>{if(m.type()==='error') console.log('CONSOLE',m.text().slice(0,2500));});
    await page.goto('http://127.0.0.1:5173');
    await page.waitForFunction(()=>globalThis.EXALTED,null,{timeout:90000});
    await page.waitForTimeout(2000);
    const report = await page.evaluate(()=> {
        const p=EXALTED.desertProps;
        return {...p.audit,visibleInstances:p.visibleInstances,triangles:p.triangles,
            batches:p.batches.map(b=>({name:b.mesh.name,distance:b.distance,count:b.count,near:b.nearCount,far:b.farCount,total:b.names.length,triangles:b.mesh.getTotalIndices()/3,lodTriangles:b.far.getTotalIndices()/3,lodError:b.lodError}))};
    });
    await fs.writeFile('reports/desert-placement.json',JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify({...report,seats:report.seats.slice(0,10)}));
    await page.screenshot({path:'reports/desert-spawn.png'});
} finally { await browser.close(); }
