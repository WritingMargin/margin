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
    const plan = {id:"studio",name:"Studio",available:true,featured:false};
    const state = {current:"starter",existing:true,busy:"",error:"",checkout:async (...args:unknown[])=>{calls.push(args)}};
    const button = PlanAction({plan,state});
    assert.equal(button.props.disabled,false);
    await button.props.onClick();
    assert.deepEqual(calls,[["studio","change"]]);
    assert.match(renderToStaticMarkup(createElement(PlanAction,{plan,state})),/Upgrade to Studio/);
    assert.equal(PlanAction({plan,state:{...state,error:"Portal unavailable"}}).props.disabled,false);
    assert.equal(PlanAction({plan,state:{...state,current:"studio"}}).props.disabled,true);
    assert.equal(PlanAction({plan,state:{...state,busy:"studio"}}).props.disabled,true);
    assert.equal(PlanAction({plan:{...plan,available:false},state}).props.disabled,true);
    await PlanAction({plan,state:{...state,current:"free",existing:false}}).props.onClick();
    assert.deepEqual(calls.at(-1),["studio","plan"]);
    await PlanAction({plan:{...plan,id:"starter"},state:{...state,current:"studio"}}).props.onClick();
    assert.deepEqual(calls.at(-1),["starter","manage"]);
  } finally { await rm(dir,{recursive:true,force:true}); }
});
