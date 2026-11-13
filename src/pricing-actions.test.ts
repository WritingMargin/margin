import { build } from "esbuild";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

test("an existing subscription can upgrade through the portal and retry an error", async () => {
  const dir = await mkdtemp(path.join(process.cwd(), ".pricing-test-"));
  try {
    const outfile = path.join(dir, "renderer.mjs");
    await build({ stdin: {contents:'export { default as PlanAction } from "./src/pricing/PlanAction";', resolveDir:process.cwd(), loader:"ts"}, bundle:true, platform:"node", format:"esm", packages:"external", outfile, jsx:"automatic" });
    const { PlanAction } = await import(pathToFileURL(outfile).href);
    const calls: unknown[] = [];
    const plan = {id:"hosting-studio",name:"Hosting Studio",available:true,featured:false};
    const state = {current:"hosting-starter",existing:true,busy:"",error:"",checkout:async (...args:unknown[])=>{calls.push(args)}};
    const button = PlanAction({plan,state});
    assert.equal(button.props.disabled,false);
    await button.props.onClick();
    assert.deepEqual(calls,[["hosting-studio","change"]]);
    assert.match(renderToStaticMarkup(createElement(PlanAction,{plan,state})),/Upgrade to Hosting Studio/);
    assert.equal(PlanAction({plan,state:{...state,error:"Portal unavailable"}}).props.disabled,false);
    assert.equal(PlanAction({plan,state:{...state,current:"hosting-studio"}}).props.disabled,true);
    assert.equal(PlanAction({plan,state:{...state,busy:"hosting-studio"}}).props.disabled,true);
    assert.equal(PlanAction({plan:{...plan,available:false},state}).props.disabled,true);
    await PlanAction({plan,state:{...state,current:"free",existing:false}}).props.onClick();
    assert.deepEqual(calls.at(-1),["hosting-studio","plan"]);
    await PlanAction({plan:{...plan,id:"hosting-starter"},state:{...state,current:"hosting-studio"}}).props.onClick();
    assert.deepEqual(calls.at(-1),["hosting-starter","manage"]);
    await PlanAction({plan,state:{...state,current:"starter"}}).props.onClick();
    assert.deepEqual(calls.at(-1),["hosting-studio","manage"]);
    await PlanAction({plan:{...plan,id:"studio"},state}).props.onClick();
    assert.deepEqual(calls.at(-1),["studio","manage"]);
    await PlanAction({plan:{...plan,id:"ai-studio"},state:{...state,current:"ai-starter"}}).props.onClick();
    assert.deepEqual(calls.at(-1),["ai-studio","manage"]);
  } finally { await rm(dir,{recursive:true,force:true}); }
});
