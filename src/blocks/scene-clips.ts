import {
  AnimationMixer,
  type AnimationAction,
  type AnimationClip,
  type Object3D,
} from "three";

export class SceneClips {
  private models = new Map<
    number,
    { mixer: AnimationMixer; clips: AnimationClip[]; label: string }
  >();
  private action?: AnimationAction;
  playing = false;

  add(index: number, root: Object3D, clips: AnimationClip[], label: string) {
    this.models.set(index, { mixer: new AnimationMixer(root), clips, label });
    return Array.from(this.models)
      .sort(([a], [b]) => a - b)
      .flatMap(([i, model]) =>
        model.clips.map((clip, j) => ({
          id: `${i}/${j}`,
          label: `${model.label} · ${clip.name || `Clip ${j + 1}`}`,
        })),
      );
  }
  select(id: string) {
    this.action?.stop();
    const [i, j] = id.split("/").map(Number);
    const model = this.models.get(i)!;
    this.action = model.mixer.clipAction(model.clips[j]).reset().play();
    this.playing = false;
    this.action.getMixer().update(0);
  }
  update(seconds: number) {
    if (this.playing) this.action?.getMixer().update(seconds);
  }
  dispose() {
    for (const { mixer } of this.models.values()) {
      mixer.stopAllAction();
      mixer.uncacheRoot(mixer.getRoot());
    }
    this.models.clear();
    this.action = undefined;
    this.playing = false;
  }
}
