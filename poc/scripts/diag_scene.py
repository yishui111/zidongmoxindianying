"""诊断助手: 检查模型拼装与取景(不需渲染, 秒级出结果)

用法: blender -b --python diag_scene.py -- <模型.json>
输出: 各部件世界坐标 / 角色包围盒 / 相机画面内占比
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import bpy
import engine
import cameras.camera_ctl as camera_ctl
from bpy_extras.object_utils import world_to_camera_view

base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
model_path = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else os.path.join(base, "models", "robot_blocky.json")

engine.clear_scene()
objs, home = engine.build_character(model_path)
engine.setup_env()
cam = camera_ctl.setup((0, 0, 1.0), (0, -5, 2.0))
sc = bpy.context.scene
bpy.context.view_layer.update()

print("===== 部件世界坐标 =====")
for name, obj in objs.items():
    print(f"{name:12s} world={tuple(round(v, 3) for v in obj.matrix_world.translation)}")

pts = []
for obj in bpy.data.objects:
    if obj.type == "MESH" and obj.name != "Ground":
        for v in obj.data.vertices:
            pts.append(obj.matrix_world @ v.co)
if pts:
    xs = [p[0] for p in pts]; ys = [p[1] for p in pts]; zs = [p[2] for p in pts]
    print("===== 角色世界包围盒 =====")
    print(f"x: {min(xs):.2f}~{max(xs):.2f}  y: {min(ys):.2f}~{max(ys):.2f}  z: {min(zs):.2f}~{max(zs):.2f}")

uvs = []
for obj in bpy.data.objects:
    if obj.type == "MESH" and obj.name != "Ground":
        for v in obj.data.vertices:
            uv = world_to_camera_view(sc, cam, obj.matrix_world @ v.co)
            if 0 <= uv.x <= 1 and 0 <= uv.y <= 1:
                uvs.append(uv)
if uvs:
    umin = min(u.x for u in uvs); umax = max(u.x for u in uvs)
    vmin = min(u.y for u in uvs); vmax = max(u.y for u in uvs)
    print("===== 相机视角占比(初始机位) =====")
    print(f"u {umin:.2f}~{umax:.2f}  v {vmin:.2f}~{vmax:.2f}  占比 {(umax-umin)*(vmax-vmin)*100:.1f}%")
else:
    print("警告: 相机画面内没有任何角色顶点!")
print("相机:", tuple(round(v, 2) for v in cam.matrix_world.translation), "焦距:", cam.data.lens)
