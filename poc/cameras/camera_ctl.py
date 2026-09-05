"""镜头控制模块(独立可调试)

职责:
- setup():  创建相机 + LookTarget, 相机始终朝向目标(TrackTo 约束)
- animate(): 把剧本 JSON 的 camera 关键点(时间 at + 机位 pos)写成相机位置关键帧

调试指南:
- 调机位: 改 scenes/*.json 里 "camera" 数组, 不用动本文件
- 调镜头逻辑(插值方式/朝向/未来镜头词库): 改本文件

扩展点: 未来可在此加"镜头词库"(如 push 推近 / orbit 环绕 / two_shot 双人镜),
剧本只需写词名, 具体运动曲线在这里实现。
"""
import bpy
from mathutils import Vector


def setup(look_at, first_pos=(0, -5, 2.0)):
    """建 LookTarget(空物体)与相机; 相机 TrackTo 始终看向 LookTarget"""
    bpy.ops.object.empty_add(type="PLAIN_AXES")
    look = bpy.context.object
    look.name = "LookTarget"
    look.location = Vector(look_at)

    bpy.ops.object.camera_add(location=Vector(first_pos))
    cam = bpy.context.object
    cam.name = "Cam"
    bpy.context.scene.camera = cam        # 设为场景活动相机(渲染必需)

    c = cam.constraints.new(type="TRACK_TO")
    c.target = look
    c.track_axis = "TRACK_NEGATIVE_Z"
    c.up_axis = "UP_Y"
    return cam


def animate(cam, points, fps, total_frames):
    """camera 关键点 -> 相机位置关键帧; 首点前与末点后保持"""
    if not points:
        return
    # 首点前: 若第一点不在 0 帧, 补 0 帧保持
    if points[0]["at"] > 0:
        cam.location = Vector(points[0]["pos"])
        cam.keyframe_insert(data_path="location", frame=0)
    for p in points:
        fr = min(round(p["at"] * fps), total_frames)
        cam.location = Vector(p["pos"])
        cam.keyframe_insert(data_path="location", frame=fr)
    # 末点后保持到最后帧
    cam.location = Vector(points[-1]["pos"])
    cam.keyframe_insert(data_path="location", frame=total_frames)
