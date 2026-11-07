"""Render the existing PetStudio and candidate library through local Chrome."""
import base64
from contextlib import contextmanager
from functools import partial
from hashlib import sha256
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import subprocess
import tempfile
import threading
import time
import urllib.request

from websockets.sync.client import connect


@contextmanager
def browser(handler, run, chrome):
    if not chrome.is_file():
        raise ValueError("找不到 Chrome，请通过 --chrome 指定")
    with ThreadingHTTPServer(("127.0.0.1", 0), handler) as server:
        worker = threading.Thread(target=server.serve_forever, daemon=True)
        worker.start()
        try:
            with tempfile.TemporaryDirectory(prefix="chrome-", dir=run) as profile:
                process = subprocess.Popen([
                    str(chrome), "--headless=new", "--no-first-run", "--disable-background-networking",
                    "--disable-extensions", "--use-angle=swiftshader-webgl", "--enable-unsafe-swiftshader",
                    "--remote-debugging-port=0", "--user-data-dir=" + profile, "about:blank",
                ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                try:
                    portfile = Path(profile) / "DevToolsActivePort"
                    for _ in range(100):
                        if portfile.exists() and portfile.stat().st_size:
                            break
                        if process.poll() is not None:
                            raise RuntimeError("Chrome 提前退出")
                        time.sleep(.1)
                    port = portfile.read_text().splitlines()[0]
                    with urllib.request.urlopen(f"http://127.0.0.1:{port}/json/list", timeout=5) as response:
                        pages = json.load(response)
                    address = next(page["webSocketDebuggerUrl"] for page in pages if page["type"] == "page")
                    with connect(address, max_size=40_000_000) as socket:
                        sequence = 0

                        def send(method, params=None):
                            nonlocal sequence
                            sequence += 1
                            socket.send(json.dumps({"id": sequence, "method": method, "params": params or {}}))
                            while True:
                                response = json.loads(socket.recv(timeout=90))
                                if response.get("id") == sequence:
                                    if "error" in response:
                                        raise RuntimeError(str(response["error"]))
                                    return response.get("result", {})

                        def evaluate(expression):
                            result = send("Runtime.evaluate", {
                                "expression": expression, "awaitPromise": True, "returnByValue": True,
                            })
                            if "exceptionDetails" in result:
                                raise RuntimeError("预览页面执行失败")
                            return result.get("result", {}).get("value")

                        send("Page.enable")
                        send("Emulation.setDeviceMetricsOverride", {
                            "width": 1000, "height": 1000, "deviceScaleFactor": 1, "mobile": False,
                        })
                        send("Page.navigate", {"url": f"http://127.0.0.1:{server.server_port}/"})
                        yield evaluate, send
                        send("Browser.close")
                finally:
                    if process.poll() is None:
                        try:
                            process.wait(timeout=3)
                        except subprocess.TimeoutExpired:
                            process.terminate()
                            process.wait(timeout=10)
        finally:
            server.shutdown()
            worker.join()


def wait_ready(evaluate, condition):
    for _ in range(200):
        if evaluate(condition):
            return
        time.sleep(.15)
    raise RuntimeError("三维页面加载超时")


def capture(send, path):
    time.sleep(.4)
    path.write_bytes(base64.b64decode(send("Page.captureScreenshot", {"format": "png"})["data"]))


def render_template(studio, run, params, chrome):
    from server import Handler
    from storage import inspect_glb

    with browser(Handler, run, chrome) as (evaluate, send):
        wait_ready(evaluate, "!!window.petStudio")
        result = evaluate("""(async () => {
          await window.petStudio.apply(PARAMS);
          const style = document.createElement('style');
          style.textContent = 'header,.intro,.panel,.right-panel,footer,.viewer-bottom{display:none!important}main{padding:0;margin:0;max-width:none}.workspace{display:block;border:0;margin:0}.viewer-shell{width:100vw;height:100vh;min-height:0;border:0;background:#f5efe3}';
          document.head.appendChild(style);
          document.querySelector('.tag').textContent = 'MiMo 识图 · 主模板';
          return await window.petStudio.save();
        })()""".replace("PARAMS", json.dumps(params)))
        model_path = (studio / result["file"]).resolve()
        if model_path.parent != (studio / "Variants").resolve():
            raise ValueError("导出路径不在 Variants")
        data = model_path.read_bytes()
        digest = sha256(data).hexdigest()
        if digest != result["sha256"] or not inspect_glb(data, params).get("skins"):
            raise ValueError("主模板 GLB 校验失败")
        for angle, filename in (("threeQuarter", "preview.png"), ("front", "front.png"), ("side", "side.png")):
            evaluate("window.petStudio.setView(" + json.dumps(angle) + ")")
            capture(send, run / filename)
        (run / "pet.glb").write_bytes(data)
    return {"model": "pet.glb", "preview": "preview.png", "params": params, "sha256": digest}


def render_fallback(selection, run, asset_id, chrome):
    handler = partial(SimpleHTTPRequestHandler, directory=str(selection))
    with browser(handler, run, chrome) as (evaluate, send):
        wait_ready(evaluate, "window.modelReady === true")
        if evaluate("window.renderErrors.length"):
            raise RuntimeError("备选素材预览加载失败")
        evaluate("""(() => {
          const asset = document.querySelector('[data-model=' + ID + ']');
          if (!asset || !asset.querySelector('canvas')) throw Error('missing model');
          document.querySelectorAll('article').forEach(card => {
            if (card !== asset.closest('article')) card.remove();
          });
          const style = document.createElement('style');
          style.textContent = 'h1,p,article section{display:none}main{padding:0;max-width:none}#grid{display:block}article{border-radius:0}.model{height:100vh}';
          document.head.appendChild(style);
        })()""".replace("ID", json.dumps(asset_id)))
        capture(send, run / "preview.png")
