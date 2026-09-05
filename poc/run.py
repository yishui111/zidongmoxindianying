"""入口: blender -b --python run.py -- <剧本.json> <输出.mp4> [预览.png]

用法示例(在 poc/ 下):
  全量: blender -b --python run.py -- scenes/demo_story.json output/demo.mp4
  预览: blender -b --python run.py -- scenes/demo_story.json output/demo.mp4 output/preview.png
"""
import json, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # Blender 5.x 不自动加脚本目录

import engine
import cameras.camera_ctl as camera_ctl


def resolve(base, rel):
    return os.path.normpath(os.path.join(base, rel))


def main():
    argv = sys.argv
    args = argv[argv.index("--") + 1:] if "--" in argv else []
    if len(args) < 2:
        print("[run] 用法: blender -b --python run.py -- <剧本.json> <输出.mp4> [预览.png]")
        sys.exit(1)
    story_path, out_path = os.path.abspath(args[0]), args[1]
    preview = args[2] if len(args) > 2 else None
    base = os.path.dirname(story_path)

    with open(story_path, "r", encoding="utf-8") as f:
        story = json.load(f)
    meta = story["meta"]

    engine.clear_scene()
    objs, home = engine.build_character(resolve(base, meta["model"]))
    actions = engine.load_actions(resolve(base, meta["actions"]))
    total = engine.apply_takes(objs, actions, story["takes"], meta["fps"], home)
    engine.setup_env()

    cam_pts = story.get("camera", [])
    first = cam_pts[0]["pos"] if cam_pts else (0, -5, 2.0)
    cam = camera_ctl.setup(tuple(meta["look_at"]), tuple(first))
    camera_ctl.animate(cam, cam_pts, meta["fps"], total)

    engine.render(out_path, meta["fps"], meta["resolution"], total, preview)
    print(f"[run] 完成. 总时长 {total / meta['fps']:.2f}s, 总帧数 {total}")


if __name__ == "__main__":
    main()
