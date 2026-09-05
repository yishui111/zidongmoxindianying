"""表演引擎核心(装配层): 读取 模型/动作库/剧本 -> 构建 Blender 场景动画 -> 渲染

依赖四个独立模块/数据文件(谁出错就只调谁):
- ① 模型:   models/*.json      关节树(部件/尺寸/颜色)      -> build_character()
- ② 动作库: actions/*.json     动作=时间点x关节指令序列     -> load_actions()/apply_takes()
- ③ 镜头:   cameras/camera_ctl.py 相机创建与轨道           -> 由 run.py 调用
- ④ 剧本:   scenes/*.json      takes+camera+meta          -> run.py 解析后调用本模块

本文件不做任何业务数据上的"魔法数", 全部来自 JSON。
"""
import json, os
import bpy
from mathutils import Euler, Vector


# ---------------- 通用工具 ----------------
def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def _make_material(name, rgba):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    m.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = rgba
    return m


def _new_mesh(name):
    bpy.ops.mesh.primitive_cube_add(size=1)
    o = bpy.context.object
    o.name = name
    o.data.name = name + "_mesh"
    return o


def _new_empty(name):
    bpy.ops.object.empty_add(type="PLAIN_AXES")
    o = bpy.context.object
    o.name = name
    return o


def kf_rot(obj, frame, e):
    obj.rotation_euler = Euler(e)
    obj.keyframe_insert(data_path="rotation_euler", frame=frame)


def kf_loc(obj, frame, loc):
    obj.location = Vector(loc)
    obj.keyframe_insert(data_path="location", frame=frame)


# ---------------- ① 模型 ----------------
def build_character(model_path):
    """按模型 JSON 构建关节对象树。
    返回 (objs, home): objs=部件名->Blender对象, home=部件名->初始loc(供动作复位)
    约定: 对象自身 scale 恒 1(尺寸做进网格顶点), 子对象坐标=相对父关节的局部偏移。"""
    with open(model_path, "r", encoding="utf-8") as f:
        model = json.load(f)
    objs, home = {}, {}
    for p in model["parts"]:
        name = p["name"]
        parent = objs.get(p.get("parent"))
        if p.get("type") == "empty":
            o = _new_empty(name)
        else:
            o = _new_mesh(name)
            sz = p["size"]
            sh = p.get("shift", 0.0)
            for v in o.data.vertices:
                v.co = (v.co.x * sz[0], v.co.y * sz[1], (v.co.z + sh) * sz[2])
            col = p["color"]
            rgba = (col[0], col[1], col[2], col[3]) if len(col) == 4 else (col[0], col[1], col[2], 1.0)
            o.data.materials.append(_make_material(name + "_mat", rgba))
        o.location = p["loc"]
        if parent is not None:
            o.parent = parent          # 父 scale 恒 1 -> 局部坐标即世界偏移
        objs[name] = o
        home[name] = list(p["loc"])
    return objs, home


# ---------------- ② 动作库 ----------------
def load_actions(actions_path):
    with open(actions_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    return data["actions"]


def apply_takes(objs, actions, takes, fps, home):
    """按剧本 takes 顺序调度动作, 逐段写关键帧; 段尾自动复位动作涉及的关节.
    返回总帧数。"""
    t = 0.0
    rot_used, loc_used = set(), set()
    for take in takes:
        name, dur = take["act"], take["dur"]
        seq = actions.get(name, actions.get("idle", []))
        f0, f1 = round(t * fps), round((t + dur) * fps)
        for sec, poses in seq:
            fr = min(f0 + round(sec * fps), f1)
            for jn, cmd in poses.items():
                if jn not in objs:
                    print(f"[engine] 警告: 动作 '{name}' 引用了不存在的关节 '{jn}', 已跳过")
                    continue
                if "loc" in cmd:
                    loc_used.add(jn)
                    kf_loc(objs[jn], fr, cmd["loc"])
                else:
                    rot_used.add(jn)
                    kf_rot(objs[jn], fr, cmd["rot"])
        # 段尾复位: 旋转归零 / 位置回 home, 保证下段衔接干净
        for jn in rot_used:
            kf_rot(objs[jn], f1, (0, 0, 0))
        for jn in loc_used:
            kf_loc(objs[jn], f1, home[jn])
        t += dur
    return round(t * fps)


# ---------------- 场景环境(灯光/地面/背景) ----------------
def setup_env():
    # 地面
    bpy.ops.mesh.primitive_plane_add(size=60, location=(0, 0, 0))
    g = bpy.context.object
    g.name = "Ground"
    g.data.materials.append(_make_material("ground_mat", (0.28, 0.30, 0.33, 1.0)))
    # 世界背景
    w = bpy.data.worlds.new("World") if "World" not in bpy.data.worlds else bpy.data.worlds["World"]
    bpy.context.scene.world = w
    w.use_nodes = True
    w.node_tree.nodes["Background"].inputs[0].default_value = (0.06, 0.08, 0.12, 1.0)
    # 主光 + 补光
    bpy.ops.object.light_add(type="SUN", location=(8, -6, 12))
    s = bpy.context.object
    s.name = "SunKey"
    s.data.energy = 3.0
    s.rotation_euler = (0.9, 0.1, 0.6)
    bpy.ops.object.light_add(type="SUN", location=(-8, 8, 4))
    s2 = bpy.context.object
    s2.name = "SunFill"
    s2.data.energy = 0.6
    s2.rotation_euler = (-0.6, 0.0, -1.2)


# ---------------- 渲染 ----------------
def render(out_path, fps, resolution, total_frames, preview=None):
    """渲染 PNG 帧序列到 <out>.frames/ (视频由外部 ffmpeg 合成);
    preview 给路径时只渲单帧(用于快速检查取景/姿势)。"""
    sc = bpy.context.scene
    sc.render.fps = fps
    sc.render.resolution_x, sc.render.resolution_y = resolution[0], resolution[1]
    sc.frame_start, sc.frame_end = 0, total_frames
    if preview:
        sc.render.image_settings.file_format = "PNG"
        sc.render.filepath = preview
        sc.frame_set(total_frames // 4)
        bpy.ops.render.render(write_still=True)
        print("[render] 预览帧:", preview)
    else:
        png_dir = out_path + ".frames"
        os.makedirs(png_dir, exist_ok=True)
        sc.render.image_settings.file_format = "PNG"
        sc.render.filepath = os.path.join(png_dir, "frame_")
        bpy.ops.render.render(animation=True)
        print("[render] PNG序列:", png_dir, "帧数:", total_frames)
