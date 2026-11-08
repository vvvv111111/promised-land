"""Serve version-checked photo-coat extensions without modifying the external library."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent
APP_ANCHORS = (
    "async function bake(target,params){",
    "const key=JSON.stringify(params);",
    "},params);",
    "target.wrapper.userData={appearance:{...params},generator:",
    "window.petStudio={",
)
BAKE_ANCHORS = ("ctx=context(params)", "   paint(x,y,z,h,e,tail,l,detail,front,ctx,out);")


def photo_coat_available(studio):
    try:
        app = (studio / "web" / "app.js").read_text(encoding="utf-8")
        bake = (studio / "web" / "bake-core.mjs").read_text(encoding="utf-8")
        return all(app.count(anchor) == 1 for anchor in APP_ANCHORS) and all(bake.count(anchor) == 1 for anchor in BAKE_ANCHORS)
    except OSError:
        return False


def photo_coat_handler(base, studio):
    if not photo_coat_available(studio):
        raise ValueError("当前 PetStudio 版本不支持照片分区着色")
    app = (studio / "web" / "app.js").read_text(encoding="utf-8")
    app = "import {validatePhotoCoat} from './photo-coat.mjs';\nlet photoCoat=null;\n" + app
    app = app.replace("const key=JSON.stringify(params);", "const key=JSON.stringify({params,photoCoat});")
    app = app.replace("},params);", "},{...params,photoCoat});")
    app = app.replace("target.wrapper.userData={appearance:{...params},generator:", "target.wrapper.userData={appearance:{...params},...(photoCoat?{photoCoat}:{}),generator:")
    app = app.replace("window.petStudio={", "window.petStudio={setPhotoCoat:value=>{photoCoat=validatePhotoCoat(value);},")
    bake = (studio / "web" / "bake-core.mjs").read_text(encoding="utf-8")
    bake = "import {createCoatContext,paintPhotoCoat} from './photo-coat.mjs';\n" + bake
    bake = bake.replace("ctx=context(params)", "ctx=params.photoCoat?createCoatContext(params.photoCoat,params.pet):context(params)")
    bake = bake.replace("   paint(x,y,z,h,e,tail,l,detail,front,ctx,out);", "   (params.photoCoat?paintPhotoCoat:paint)(x,y,z,h,e,tail,l,detail,front,ctx,out);")
    assets = {"/app.js": app.encode("utf-8"), "/bake-core.mjs": bake.encode("utf-8"), "/photo-coat.mjs": (ROOT / "photo-coat.mjs").read_bytes()}
    class Handler(base):
        def do_GET(self):
            resource = assets.get(self.path.split("?", 1)[0])
            if resource is None:
                return super().do_GET()
            try:
                self.local()
                return self.reply(200, resource, "application/javascript; charset=utf-8")
            except (ValueError, OSError):
                return self.reply(400, {"error": "非法的本地素材请求"})
    return Handler
