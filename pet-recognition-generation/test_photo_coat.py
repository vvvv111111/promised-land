import copy
import argparse
from contextlib import redirect_stdout
from hashlib import sha256
import io
import json
from pathlib import Path
import unittest
import types
from unittest.mock import patch

import agent
from photo_coat import validate_photo_coat, protect_review_coat
from studio_runtime import photo_coat_available, photo_coat_handler, APP_ANCHORS, BAKE_ANCHORS
import test_agent


class PhotoCoatTests(unittest.TestCase):
    setUp = test_agent.RegionalTests.setUp
    provision = test_agent.RegionalTests.provision
    plan = test_agent.RegionalTests.plan

    def test_visual_correction_cannot_turn_tabby_stripes_into_a_solid_patch(self):
        stripe = {"region": "head", "kind": "stripes", "color": "#884422", "center": [.5, .8], "size": [.3, .2], "coverage": .4}
        initial = {"version": 1, "base": "#dd9944", "regions": {}, "markings": [stripe]}
        proposed = {**initial, "markings": [{**stripe, "kind": "patch"}]}
        final = protect_review_coat(initial, proposed, {})
        self.assertEqual(final["markings"][0]["kind"], "stripes")
        self.assertEqual(proposed["markings"][0]["kind"], "patch")
        final = protect_review_coat(initial, {**initial, "markings": []}, {})
        self.assertEqual(final["markings"], initial["markings"])
        face = protect_review_coat(initial, {**initial, "markings": [{**stripe, "region": "leftFace", "kind": "patch"}]}, {})
        self.assertEqual(face["markings"][-1]["kind"], "stripes")
        white = protect_review_coat(initial, {**initial, "markings": [{**stripe, "region": "leftFace", "kind": "patch", "color": "#ffffff"}]}, {})
        self.assertEqual(white["markings"][-1]["kind"], "patch")
    def test_bounded_coat_contract(self):
        coat = {"version": 1, "base": "#151515", "regions": {"chest": "#ffffff", "paws": "#ffffff"}, "markings": []}
        self.assertEqual(validate_photo_coat(coat), coat)
        for key, value in (("base", "https://bad"), ("regions", {"unknown": "#ffffff"}), ("version", True), ("markings", [{}])):
            with self.subTest(key=key), self.assertRaises(ValueError):
                validate_photo_coat({**coat, key: value})
        prompt = agent.recognition_prompt({}, True, True)
        self.assertIn("photo_coat", prompt)
        self.assertNotIn("photo_coat", agent.recognition_prompt({}, False, True))

    def test_studio_overlay_is_version_checked_and_library_unchanged(self):
        self.provision()
        app = "\n".join(APP_ANCHORS)
        bake = "\n".join(BAKE_ANCHORS)
        (self.studio / "web" / "app.js").write_text(app, encoding="utf-8")
        (self.studio / "web" / "bake-core.mjs").write_text(bake, encoding="utf-8")
        self.assertTrue(photo_coat_available(self.studio))
        self.assertIsInstance(photo_coat_handler(type("Handler", (), {}), self.studio), type)
        self.assertEqual((self.studio / "web" / "app.js").read_text(encoding="utf-8"), app)
        (self.studio / "web" / "app.js").write_text("incompatible", encoding="utf-8")
        self.assertFalse(photo_coat_available(self.studio))
        with self.assertRaises(ValueError):
            photo_coat_handler(object, self.studio)

    def test_invalid_recognition_gets_one_bounded_repair(self):
        recognition = {"species": "cat", "template_fit": {"fits_primary": True}, "generation_plan": self.plan("bicolor_white"), "photo_coat": None, "mapping_losses": []}
        corrected = copy.deepcopy(recognition)
        corrected["photo_coat"] = {"version": 1, "base": "#151515", "regions": {"chest": "#ffffff"}, "markings": []}
        responses = [recognition, corrected]
        calls = []
        class Response:
            def __init__(self, data): self.data = data
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def read(self): return json.dumps(self.data).encode()
        class Opener:
            def open(self, request, timeout):
                calls.append(json.loads(request.data))
                return Response({"id": "fixture", "choices": [{"finish_reason": "stop", "message": {"content": json.dumps(responses.pop(0))}}]})
        with patch("agent.urllib.request.build_opener", return_value=Opener()):
            result = agent.recognize(b"fixture", "image/jpeg", "test-key", True, agent.REGIONAL_PRESETS, True)
        self.assertEqual(len(calls), 2)
        self.assertIn("validation_repair", result)
        self.assertEqual(result["recognition"]["photo_coat"], corrected["photo_coat"])
        self.assertEqual(len(calls[1]["messages"]), 3)

    def test_live_review_corrects_once_and_receipt_replay_keeps_final_coat(self):
        self.provision()
        (self.studio / "web" / "app.js").write_text("\n".join(APP_ANCHORS), encoding="utf-8")
        (self.studio / "web" / "bake-core.mjs").write_text("\n".join(BAKE_ANCHORS), encoding="utf-8")
        photo = self.library / "photo.jpg"
        photo.write_bytes(b"public-photo-fixture")
        initial = {"version": 1, "base": "#151515", "regions": {}, "markings": []}
        final = {**initial, "regions": {"chest": "#ffffff"}}
        receipt = {"input_type": "image_url/base64", "response_id": "fixture", "image_sha256": sha256(photo.read_bytes()).hexdigest(),
                   "recognition": {"species": "cat", "template_fit": {"fits_primary": True, "fallback_id": None, "reason": "fixture"},
                                   "generation_plan": {**self.plan("bicolor_white"), "pattern": "patches"}, "photo_coat": initial, "mapping_losses": []}}
        server = types.ModuleType("server")
        server.validate = lambda params: dict(params)
        renderer = types.ModuleType("render")
        renderer.render_template = unittest.mock.Mock(return_value={"model": "pet.glb", "sha256": "fixture"})
        review = {"matches": False, "issues": ["Missing white chest"], "photo_coat": final, "response_id": "review-fixture"}
        args = argparse.Namespace(library=self.library, photo=photo, receipt=None, output_dir=None, chrome=Path("unused"))
        output = io.StringIO()
        with patch.dict("sys.modules", {"server": server, "render": renderer}), patch.object(agent.sys, "path", list(agent.sys.path)), patch.dict("os.environ", {"MIMO_API_KEY": "fixture"}), patch.object(agent, "recognize", return_value=receipt), patch.object(agent, "review_photo_coat", return_value=review) as reviewer, redirect_stdout(output):
            agent.generate(args)
        result = json.loads(output.getvalue())
        self.assertEqual(renderer.render_template.call_count, 2)
        self.assertEqual(reviewer.call_count, 1)
        self.assertEqual(result["photo_coat"], final)
        args.receipt = Path(result["run"]) / "recognition.json"
        saved = json.loads(args.receipt.read_text(encoding="utf-8"))
        self.assertEqual(saved["recognition"]["photo_coat"], final)
        self.assertEqual(saved["initial_photo_coat"], initial)
        output = io.StringIO()
        renderer.render_template.reset_mock()
        with patch.dict("sys.modules", {"server": server, "render": renderer}), patch.object(agent.sys, "path", list(agent.sys.path)), patch.object(agent, "review_photo_coat") as reviewer, redirect_stdout(output):
            agent.generate(args)
        self.assertEqual(renderer.render_template.call_count, 1)
        reviewer.assert_not_called()
        self.assertEqual(json.loads(output.getvalue())["photo_coat"], final)

    def test_visual_review_preserves_base_and_photo_color_anchors(self):
        run = self.library
        for name in ("review-front.png", "review-side.png"):
            (run / name).write_bytes(b"rendered-fixture")
        coat = {"version": 1, "base": "#222222", "regions": {"head": "#222222"}, "markings": []}
        review = {"matches": False, "issues": ["Wrong head color"], "anchors": {"head": "#121212", "back": "#222222", "chest": "#ffffff", "paws": None},
                  "photo_coat": {"version": 1, "base": "#ffffff", "regions": {"head": "#ffffff"}, "markings": []}}
        result = ({"id": "review-fixture"}, {"message": {"content": json.dumps(review)}})
        with patch.object(agent, "mimo_completion", return_value=result) as complete:
            actual = agent.review_photo_coat(b"photo", "image/jpeg", "fixture", coat, {"pet": "cat"}, run)
        self.assertEqual(complete.call_count, 1)
        self.assertEqual(actual["photo_coat"]["base"], coat["base"])
        self.assertEqual(actual["photo_coat"]["regions"]["head"], "#121212")
        self.assertEqual(actual["photo_coat"]["regions"]["chest"], "#ffffff")
        self.assertEqual(len([c for c in complete.call_args.args[0]["messages"][0]["content"] if c["type"] == "image_url"]), 3)


if __name__ == "__main__":
    unittest.main()
