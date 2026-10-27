import {webkit} from 'playwright';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const browser=await webkit.launch();
try {
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,acceptDownloads:true});
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:5173',{waitUntil:'networkidle'});
  await page.locator('#status').getByText(/Explorando/).waitFor({timeout:30000});
  assert.equal(await page.locator('#game-canvas').count(),1);
  assert.equal(await page.locator('#metal').textContent(),'0');
  await page.screenshot({path:'webkit-explore.png'});
  await page.locator('#collect').click();
  assert.equal(await page.locator('#metal').textContent(),'1','collecting nearby starter metal failed');
  await page.locator('#toggle-build').click();
  await page.locator('#builder').waitFor({state:'visible'});
  await page.locator('[data-kind="connector"]').click();
  await page.locator('#game-canvas').click({position:{x:195,y:330}});
  await page.locator('#selected-details').getByText(/Conector/).waitFor({timeout:12000});
  assert.equal(await page.locator('#metal').textContent(),'0','crafting did not spend metal');
  await page.screenshot({path:'webkit-build.png'});
  await page.locator('#undo').click();
  assert.equal(await page.locator('#metal').textContent(),'1','undo did not return resources');
  await page.locator('#redo').click();
  assert.equal(await page.locator('#metal').textContent(),'0','redo did not spend resources');
  await page.locator('#save').click();
  await page.waitForTimeout(800);
  await page.reload({waitUntil:'networkidle'});
  await page.locator('#status').getByText(/Explorando/).waitFor({timeout:30000});
  assert.equal(await page.locator('#metal').textContent(),'0','inventory did not persist on reload');
  await page.locator('#toggle-build').click();
  const downloadPromise=page.waitForEvent('download');
  await page.locator('#export').click();
  const download=await downloadPromise;
  const blueprint=JSON.parse(await readFile(await download.path(),'utf8'));
  assert.equal(blueprint.format,'meujogo-blueprint');
  assert.equal(blueprint.parts.length,1,'construction did not persist on reload');
  await page.locator('#close-build').click();
  await page.locator('#salvage-cache').click();
  assert.equal(await page.locator('#metal').textContent(),'24','one-time scrap wreck recovery failed');
  assert.equal(await page.locator('#copper').textContent(),'5','copper starter stock missing');
  assert.equal(await page.locator('#salvage-cache').isHidden(),true,'salvage cache can be collected repeatedly');
  await page.locator('#toggle-build').click();
  await page.locator('#quick-buggy').click();
  await page.locator('#builder').waitFor({state:'hidden'});
  // Regression: quick assembly must put the player in the vehicle, not lose the buggy offscreen.
  await page.locator('#drive-controls').waitFor({state:'visible',timeout:12000});
  assert.equal(await page.locator('#drive-hud').isVisible(),true,'car assembled without entering cockpit');
  assert.equal(await page.locator('#metal').textContent(),'0','car fabrication did not spend metal');
  assert.equal(await page.locator('#copper').textContent(),'0','car fabrication did not spend copper');
  await page.screenshot({path:'webkit-parked-buggy.png'});
  assert.equal(await page.locator('#ride').isHidden(),true,'ride button should hide while driving');
  const gasBox=await page.locator('#pedal-gas').boundingBox();
  assert.ok(gasBox,'gas pedal is absent');
  await page.mouse.move(gasBox.x+gasBox.width/2,gasBox.y+gasBox.height/2);
  await page.mouse.down();
  try {
    const telemetry=async()=>page.evaluate(()=>({
      speed:document.querySelector('#speed')?.textContent,
      buttonHeld:document.querySelector('#pedal-gas')?.classList.contains('held'),
      charge:document.querySelector('#charge')?.textContent,
      carY:document.querySelector('#drive-hud')?.getAttribute('data-car-y'),
      physicsMass:document.querySelector('#drive-hud')?.getAttribute('data-physics-mass'),
      verticalSpeed:document.querySelector('#drive-hud')?.getAttribute('data-vertical-speed'),
      grounded:document.querySelector('#drive-hud')?.getAttribute('data-wheel-ground'),
      input:document.querySelector('#drive-hud')?.getAttribute('data-gas'),
      mode:document.body.className
    }));
    console.log('Drive initially:',JSON.stringify(await telemetry()));
    await page.waitForTimeout(1500);
    console.log('Drive after 1.5 s:',JSON.stringify(await telemetry()));
    assert.ok(Number((await telemetry()).carY)<14,'Buggy flew out of the scene from unstable suspension');
    try {
      await page.waitForFunction(()=>Number(document.querySelector('#speed')?.textContent||'0')>2,null,{timeout:7000});
    } catch(error) {
      await page.screenshot({path:'webkit-drive-failure.png'});
      console.log('Drive after timeout:',JSON.stringify(await telemetry()));
      throw error;
    }
  } finally {
    await page.mouse.up();
  }
  await page.screenshot({path:'webkit-driving-buggy.png'});
  await page.locator('#exit-car').click();
  await page.locator('#drive-controls').waitFor({state:'hidden'});
  await page.locator('#vehicle-panel').waitFor({state:'visible'});
  assert.match(await page.locator('#vehicle-distance').textContent(),/m/,'buggy location missing');
  await page.locator('#locate-car').click();
  assert.equal(await page.locator('#car-marker').isVisible(),true,'car map marker missing');
  await page.locator('#recover-car').click();
  await page.locator('#ride').click();
  await page.locator('#drive-controls').waitFor({state:'visible'});
  await page.locator('#exit-car').click();
  await page.locator('#drive-controls').waitFor({state:'hidden'});
  await page.locator('#save').click();
  await page.waitForTimeout(850);
  await page.reload({waitUntil:'networkidle'});
  await page.locator('#status').getByText(/Explorando/).waitFor({timeout:30000});
  await page.locator('#ride').waitFor({state:'visible'});
  await page.locator('#vehicle-panel').waitFor({state:'visible'});
  await page.locator('#recover-car').click();
  await page.locator('#ride').click();
  await page.locator('#drive-controls').waitFor({state:'visible'});
  assert.equal(await page.locator('#salvage-cache').isHidden(),true,'starter cache came back on reload');
  console.log('PASS: salvage cache, modular car construction, iPhone touch pedal, driving physics and vehicle persistence');

  assert.equal(errors.length,0,'WebKit page errors: '+errors.join('\n'));
  console.log('PASS: WebKit iPhone touch exploration, collect, place, undo/redo, IndexedDB reload, blueprint download');
  await page.close();

  const desktop=await browser.newPage({viewport:{width:1280,height:800}});
  await desktop.goto('http://127.0.0.1:5173',{waitUntil:'networkidle'});
  await desktop.locator('#status').getByText(/Explorando/).waitFor({timeout:30000});
  await desktop.keyboard.press('b');
  await desktop.locator('#builder').waitFor({state:'visible'});
  assert.equal(await desktop.locator('[data-kind]').count(),7);
  await desktop.keyboard.press('Escape');
  await desktop.locator('#builder').waitFor({state:'hidden'});
  console.log('PASS: desktop keyboard toggle and build catalog');
  await desktop.close();
} finally {
  await browser.close();
}
