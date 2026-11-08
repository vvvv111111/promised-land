"""Bounded, photo-observed coat layout. No executable provider output or asset URLs."""
import math
import re
import copy

REGIONS = (
    "head", "back", "leftFlank", "rightFlank", "chest", "belly",
    "leftFace", "rightFace", "muzzle", "leftEar", "rightEar",
    "frontLegs", "hindLegs", "paws", "tail", "tailTip", "blaze",
)

PROMPT = """
本机支持按照片记录身体部位毛色。fits_primary=true 时额外返回 photo_coat：
{"version":1,"base":"#rrggbb","regions":{"head":"#rrggbb"},"markings":[]}。
base 是身体主要底色，不是背景或白色默认底。只估计毛发本色，排除阴影、暖光、项圈和配饰。
regions 可用键：head头、back背、leftFlank左体侧、rightFlank右体侧、chest胸、belly腹、
leftFace左半脸、rightFace右半脸、muzzle口鼻毛、leftEar左耳、rightEar右耳、
frontLegs前腿、hindLegs后腿、paws爪尖、tail尾、tailTip尾尖、blaze额头至鼻梁的中间窄条。
左右始终按宠物自身，正对镜头时画面右方是宠物左方；无法确定的背面/远侧省略并记入 mapping_losses。
区域值只能是 #rrggbb。必须区分白爪尖和整条白腿；没有白额纹不能默认添加白额纹。
regions 先填每个部位占比最大的毛色，即使有混色也不能一律留白；再用 markings 叠加局部次色。混色脸不能简单分成整张左黑右橙脸，应先填 head 的主色再放实际小色块。
三花不等于白头或白背，generation_plan 的 calico 白底约束不适用于 photo_coat。照片以黑色为主的头部必须 head=黑色，再叠加橙斑和白口鼻。
黑白燕尾服猫应以黑色为 base，再明确白胸/口鼻/爪尖，不能选白底随机黑块。
markings 最多12项，用于真正看见的色块、条纹或斑点：
{"region":"leftFlank","kind":"patch","color":"#cc8833","center":[0.5,0.5],"size":[0.3,0.5],"coverage":0.5}。
kind 仅 patch/stripes/spots。center、size 是部位内归一化二维坐标和半径：center 0~1，size .03~1；coverage .05~.95。
体侧/背/胸/腹坐标横向0后臀1肩颈，纵向0腹底1脊背；脸/头/耳横向0宠物右1宠物左、纵向0下巴1头顶。
腿和爪横向0右1左、纵向0爪尖1腿根；尾横向0尾根1尾尖、纵向0下1上。
脸的v不是照片像素纵坐标：v=.1~.3是鼻口，v=.4~.6是眼旁，v=.7~.9是额头。额头小斑例如 center=[.5,.8],size=[.15,.15]，不得画成鼻头圆斑。
patch 按照片给定位置和面积，不随机生成；stripes/spots 覆盖整部位时 center=[.5,.5],size=[1,1]。
橘虎斑用橙底深橙/棕条纹；斑点犬的头/耳/腿若可见斑点也分别记录，不能只在躯干画几点。
没有明确看到白额纹/白尾尖时不得根据品种或分区预设推断添加。照片中的黑背鞍应记录黑色 back，并保留真实棕色侧腹与白胸腿的边界。
三花可以在同一身体区域叠加多块橙色和黑色色块，并保留照片中真实白区。
generation_plan 仍保留原7键供旧模板使用；calico 必须 color=white、accent=black，不能写 orange/white。
photo_coat 不改变体型、眼睛、姿势或物理尺寸。不确定的细小花纹不要编造。fits_primary=false 时 photo_coat=null。
"""


def validate_photo_coat(value):
    if not isinstance(value, dict) or set(value) != {"version", "base", "regions", "markings"} or type(value["version"]) is not int or value["version"] != 1:
        raise ValueError("照片毛色分区格式无效")
    def color(v):
        return isinstance(v, str) and re.fullmatch(r"#[a-fA-F0-9]{6}", v) is not None
    if not color(value["base"]) or not isinstance(value["regions"], dict) or any(
            key not in REGIONS or not color(v) for key, v in value["regions"].items()):
        raise ValueError("照片毛色区域或颜色无效")
    if not isinstance(value["markings"], list) or len(value["markings"]) > 12:
        raise ValueError("照片花纹数量超出范围")
    for mark in value["markings"]:
        if not isinstance(mark, dict) or set(mark) != {"region", "kind", "color", "center", "size", "coverage"}:
            raise ValueError("照片花纹字段无效")
        if mark["region"] not in REGIONS or mark["kind"] not in ("patch", "stripes", "spots") or not color(mark["color"]):
            raise ValueError("照片花纹部位或类型无效")
        for key, low, high in (("center", 0, 1), ("size", .03, 1)):
            vector = mark[key]
            if not isinstance(vector, list) or len(vector) != 2 or any(type(n) not in (float, int) or not low <= n <= high or not math.isfinite(n) for n in vector):
                raise ValueError("照片花纹位置或面积无效")
        n = mark["coverage"]
        if type(n) not in (float, int) or not .05 <= n <= .95 or not math.isfinite(n):
            raise ValueError("照片花纹覆盖率无效")
    return value


def protect_review_coat(original, proposed, anchors):
    """A visual correction may move marks, but cannot erase already observed stripes/spots."""
    candidate = copy.deepcopy(proposed)
    candidate["base"] = original["base"]
    for region, color in anchors.items():
        if color is not None:
            candidate["regions"][region] = color
    patterns = {m["region"]: m["kind"] for m in original["markings"] if m["kind"] in ("stripes", "spots")}
    if patterns.get("head") == "stripes":
        for region in ("leftFace", "rightFace", "muzzle", "blaze"):
            patterns.setdefault(region, "stripes")
    for mark in candidate["markings"]:
        if mark["region"] in patterns and mark["kind"] == "patch":
            ground = candidate["regions"].get(mark["region"], candidate["regions"].get("head", candidate["base"]))
            brightness = lambda c: sum(int(c[i:i + 2], 16) for i in (1, 3, 5)) / 3
            if brightness(mark["color"]) < brightness(ground) - 10:
                mark["kind"] = patterns[mark["region"]]
    missing = [copy.deepcopy(m) for m in original["markings"] if m["region"] in patterns and not any(
        n["region"] == m["region"] and n["kind"] == m["kind"] for n in candidate["markings"])]
    candidate["markings"] = (missing + candidate["markings"])[:12]
    return validate_photo_coat(candidate)
