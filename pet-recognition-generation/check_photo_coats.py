"""Explicit live/replay regression runner for a manifest of public pet photos."""
import argparse
from contextlib import redirect_stdout
from hashlib import sha256
import html
import io
import json
from pathlib import Path
import shutil

import agent


def main():
    parser = argparse.ArgumentParser(description="公开猫狗照片的识别、毛色对照与实际 GLB 渲染回归")
    parser.add_argument("--samples", type=Path, required=True, help="JSON 数组：id、photo、source、license")
    parser.add_argument("--output", type=Path, required=True)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--live", action="store_true", help="调用 MiMo，产生接口用量；密钥从环境读取")
    mode.add_argument("--replay", type=Path, help="重放目录中的 id-receipt.json，不调用模型")
    parser.add_argument("--library", type=Path, default=Path(".pet-library"))
    parser.add_argument("--chrome", type=Path, default=Path("C:/Program Files/Google/Chrome/Application/chrome.exe"))
    args = parser.parse_args()
    out = args.output.resolve()
    out.mkdir(parents=True, exist_ok=True)
    samples = json.loads(args.samples.read_text(encoding="utf-8"))
    results = []
    rows = []
    for sample in samples:
        sample_id = sample["id"]
        if not isinstance(sample_id, str) or not sample_id.isascii() or not sample_id.replace("-", "").isalnum():
            raise ValueError("样本 id 只能是 ASCII 字母、数字或短横线")
        photo = Path(sample["photo"]).resolve()
        output = io.StringIO()
        receipt = args.replay / (sample_id + "-receipt.json") if args.replay else None
        with redirect_stdout(output):
            agent.generate(argparse.Namespace(library=args.library, photo=photo, receipt=receipt, output_dir=out, chrome=args.chrome))
        result = json.loads(output.getvalue().splitlines()[-1])
        run = Path(result["run"])
        data = (run / "pet.glb").read_bytes()
        if len(data) > 2_500_000 or sha256(data).hexdigest() != result["sha256"]:
            raise ValueError("导出模型超出预算或摘要不一致")
        result.update(id=sample_id, bytes=len(data), source=sample.get("source"), license=sample.get("license"))
        results.append(result)
        (out / "results.json").write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
        source_name = sample_id + photo.suffix.lower()
        if photo != out / source_name:
            shutil.copyfile(photo, out / source_name)
        images = [source_name] + [(run.relative_to(out) / file).as_posix() for file in ("front.png", "side.png", "preview.png")]
        cells = "".join('<td><img src="' + html.escape(name, quote=True) + '"></td>' for name in images)
        credit = html.escape(str(sample.get("source", "")), quote=True)
        rows.append('<tr><th>' + html.escape(sample_id) + '<br><a href="' + credit + '">照片来源</a></th>' + cells + '</tr>')
        print(f"PASS {sample_id}: {result['status']}, {len(data)} bytes, mode={result['mode']}", flush=True)
    page = '<!doctype html><meta charset="utf-8"><title>宠物毛色照片回归</title><style>body{font:16px system-ui;background:#f7f3eb;color:#25372c;margin:24px}table{width:100%;table-layout:fixed}th,td{padding:8px}th:first-child{width:110px}img{width:100%;max-height:360px;object-fit:contain}a{color:#355d49}table{min-width:900px}.table{overflow:auto}</style><h1>宠物毛色照片回归</h1><p>mode=' + ("live_mimo：含一次视觉对照及最多一次重绘" if args.live else "replay：重放已保存回执，本次不调用模型") + '。卡通体型保持不变；背面、细碎斑纹仍有近似。</p><div class="table"><table><thead><tr><th>样本</th><th>原照片</th><th>正面</th><th>侧面</th><th>组合视角</th></tr></thead><tbody>' + ''.join(rows) + '</tbody></table></div>'
    (out / "index.html").write_text(page, encoding="utf-8")


if __name__ == "__main__":
    main()
