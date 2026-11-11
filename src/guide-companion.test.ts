import assert from "node:assert/strict";
import test from "node:test";
import { guideStepLevel, guideSteps } from "./blog/guide-progress";

test("guide steps group subheadings under main sections and skip a single document title", () => {
  assert.equal(guideStepLevel([2,3,2,3,2]),2);
  assert.equal(guideStepLevel([1,2,3,2,3]),2);
  assert.equal(guideStepLevel([1,2,1,2]),1);
  assert.equal(guideStepLevel([3,4,3]),3);
  assert.equal(guideStepLevel([1]),1);
  assert.equal(guideStepLevel([]),Infinity);
});

test("step discovery ignores hidden sections and generated UI headings", () => {
  function heading(id: string, level: number, title: string, authored = true, visible = true) {
    return {id, tagName:`H${level}`, querySelector:()=>authored, getClientRects:()=>visible?[{}]:[], cloneNode:()=>({textContent:title,querySelectorAll:()=>[]})};
  }
  const root = {querySelectorAll:()=>[
    heading("title",1,"Document title"),heading("first",2,"  Set up  your space  "),heading("detail",3,"Details"),
    heading("second",2,"Try the command"),heading("hidden",2,"Hidden tab",true,false),heading("widget",2,"Your guide",false),
  ]} as unknown as HTMLElement;
  assert.deepEqual(guideSteps(root).map(({id,title})=>({id,title})),[{id:"first",title:"Set up your space"},{id:"second",title:"Try the command"}]);
});
