import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { parseBlock } from "./schema";
import { advanceFlow, pointAlongRoute, flowColor } from "./illustration-flow";
const heart = JSON.parse(readFileSync(new URL('../../examples/heart-atlas/heart.json', import.meta.url), 'utf8'));

test('flow timing carries remainder, reaches the final endpoint and stays complete', () => {
  assert.deepEqual(advanceFlow({step: 0, progress: .9}, .3, 8), {step: 1, progress: .19999999999999996});
  assert.deepEqual(advanceFlow({step: 7, progress: .9}, .3, 8), {step: 7, progress: 1});
  assert.deepEqual(advanceFlow({step: 7, progress: 1}, 20, 8), {step: 7, progress: 1});
  assert.deepEqual(advanceFlow({step: 0, progress: .5}, 0, 8), {step: 0, progress: .5});
});
test('particles follow route distance rather than cutting diagonally between endpoints', () => {
  const points: [number, number][] = [[0,0],[0,30],[40,30]];
  assert.deepEqual(pointAlongRoute(points, 0), [0,0]);
  assert.deepEqual(pointAlongRoute(points, .5), [5,30]);
  assert.deepEqual(pointAlongRoute(points, 1), [40,30]);
  assert.equal(flowColor('#315e9b','#b33f36',0), '#315e9b');
  assert.equal(flowColor('#315e9b','#b33f36',1), '#b33f36');
});
test('flow is optional, bounded, nonexecutable and continuous', () => {
  const {flow, ...staticHeart} = heart;
  assert.equal(parseBlock('illustration', JSON.stringify(staticHeart)).kind, 'illustration');
  const changeStep = (change: object) => ({...flow, steps: [{...flow.steps[0], ...change}]});
  for (const invalid of [
    {...flow, secondsPerStep: 0}, {...flow, secondsPerStep: 20},
    changeStep({points: [[0,0],[601,0]]}), changeStep({points: [[0,0],[0,0]]}),
    changeStep({points: [[0,0]]}), changeStep({points: [[0,0],[Infinity,0]]}),
    changeStep({region: 'unknown'}), changeStep({onEnd: 'alert(1)'}),
    changeStep({color: 'url(https://example.com)'}),
    {...flow, steps: Array(31).fill(flow.steps[0])},
    {...flow, steps: [flow.steps[0], {...flow.steps[1], points: [[5,5],[10,10]]}]},
  ]) assert.throws(() => parseBlock('illustration', JSON.stringify({...heart, flow: invalid})));
});
test('the heart route visits valves in the correct order and changes oxygen colour only in lungs and body', () => {
  const steps = heart.flow.steps;
  assert.deepEqual(steps.filter((step: any) => step.region).map((step: any) => step.region), ['ra','tv','plv','la','mv','av']);
  assert.deepEqual(steps.filter((step: any) => step.endColor).map((step: any) => step.label), ['In the lungs','In the body']);
  assert.deepEqual(steps.at(-1).points.at(-1), steps[0].points[0]);
});
