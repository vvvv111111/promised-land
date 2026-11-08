"""Offline contract tests. Studio/render modules below are explicit test doubles."""
import argparse
from contextlib import redirect_stdout
from hashlib import sha256
import io
import json
from pathlib import Path
import tempfile
import types
import unittest
from unittest.mock import patch

import agent


class DiagnosticTests(unittest.TestCase):
    def test_diagnostic_excludes_paths_provider_text_and_secrets(self):
        error = PermissionError("/private/photo.jpg secret-key provider-body")
        self.assertEqual(agent.failure_diagnostic(error, "render"), {"stage": "render", "kind": "PermissionError", "reason": "unknown"})
        self.assertEqual(agent.failure_diagnostic(RuntimeError("Chrome 提前退出 private-data"), "secret-stage"),
                         {"stage": "input", "kind": "RuntimeError", "reason": "chrome_exit"})


class RegionalTests(unittest.TestCase):
    def setUp(self):
        root = Path(__file__).resolve().parent.parent / ".room-qa"
        root.mkdir(exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(prefix="pet-regional-", dir=root)
        self.addCleanup(self.temp.cleanup)
        self.library = Path(self.temp.name)
        self.studio = self.library / "outputs" / "PetStudio"
        self.studio.mkdir(parents=True)
        self.manifest = self.library / "outputs" / "Pet_Visual_Library" / "library_manifest.json"
        self.manifest.parent.mkdir()

    def provision(self):
        for name in ("server.py", "storage.py", "web/regional-masks.mjs"):
            file = self.studio / name
            file.parent.mkdir(parents=True, exist_ok=True)
            file.touch()
        patterns = {}
        for name, preset in agent.REGIONAL_PRESETS.items():
            species, asset = preset["catalog"]
            patterns.setdefault(species, {})[asset] = {
                "status": "regional_mask", "runtime": "PetStudio", "runtime_pattern": name}
        self.manifest.write_text(json.dumps({"patterns": patterns}), encoding="utf-8-sig")
        return patterns

    def plan(self, name):
        pet, color, accent = agent.REGIONAL_PRESETS[name]["appearance"]
        return dict(pet=pet, color=color, accent=accent, pattern=name, scale=1, amount=.5, seed=0)

    def test_capability_dependencies_and_catalog(self):
        self.assertEqual(agent.capabilities(self.library), {"primaryAvailable": False, "regionalPresets": [], "photoCoatAvailable": False})
        patterns = self.provision()
        self.assertEqual(list(agent.regional_presets(self.library, self.studio)), list(agent.REGIONAL_PRESETS))
        patterns["Dog"]["SaddleWhiteChestLegs"]["runtime"] = "other"
        self.manifest.write_text(json.dumps({"patterns": patterns}), encoding="utf-8")
        self.assertEqual(list(agent.regional_presets(self.library, self.studio)), ["bicolor_white"])
        for value in ("broken", "null", '{"patterns": []}', '{"patterns":{"Cat":null}}'):
            self.manifest.write_text(value, encoding="utf-8")
            self.assertEqual(agent.regional_presets(self.library, self.studio), {})
        self.provision()
        for name in ("web/regional-masks.mjs", "server.py", "storage.py"):
            (self.studio / name).unlink()
            self.assertEqual(agent.regional_presets(self.library, self.studio), {})
            (self.studio / name).touch()

    def test_prompt_only_advertises_enabled_presets(self):
        self.assertEqual(agent.recognition_prompt({}), agent.PROMPT)
        preset = {"bicolor_white": agent.REGIONAL_PRESETS["bicolor_white"]}
        prompt = agent.recognition_prompt(preset)
        self.assertIn("bicolor_white", prompt)
        self.assertNotIn("saddle_white", prompt)
        self.assertIn("scale=1", prompt)
        fallback = agent.recognition_prompt(agent.REGIONAL_PRESETS, primary=False)
        self.assertNotIn("bicolor_white", fallback)
        self.assertIn("fits_primary", fallback)

    def test_strict_parameter_contract(self):
        for name in agent.REGIONAL_PRESETS:
            plan = self.plan(name)
            self.assertEqual(agent.validate_appearance(plan, plan["pet"], agent.REGIONAL_PRESETS), plan)
            with self.assertRaises(ValueError):
                agent.validate_appearance(plan, plan["pet"], {})
            changes = {"pet": "dog" if plan["pet"] == "cat" else "cat", "color": "orange",
                       "accent": "cream", "scale": 1.01, "amount": .51, "seed": 1}
            for key, value in changes.items():
                with self.subTest(name=name, key=key), self.assertRaises(ValueError):
                    agent.validate_appearance({**plan, key: value}, plan["pet"], agent.REGIONAL_PRESETS)
        ordinary = {**self.plan("bicolor_white"), "pattern": "patches", "scale": .8, "seed": 42}
        self.assertEqual(agent.validate_appearance(ordinary, "cat", {}), ordinary)
        for key, value in (("scale", float("nan")), ("amount", True), ("seed", .5), ("pattern", []), ("color", "red")):
            with self.subTest(key=key), self.assertRaises(ValueError):
                agent.validate_appearance({**ordinary, key: value}, "cat", {})
        for value in ("loss", [""], ["a" * 501], ["a"] * 21, [1]):
            with self.assertRaises(ValueError):
                agent.mapping_losses(value)

    def test_replay_records_params_and_losses_after_studio_validation(self):
        self.provision()
        # An installed primary template works without the optional fallback library.
        photo = self.library / "test.png"
        photo.write_bytes(b"offline receipt fixture")
        receipt_path = self.library / "receipt.json"
        server = types.ModuleType("server")
        server.validate = lambda params: dict(params)
        renderer = types.ModuleType("render")
        renderer.render_template = lambda studio, run, params, chrome: {"model": "pet.glb", "sha256": "test-double"}
        args = argparse.Namespace(library=self.library, photo=photo, receipt=receipt_path, output_dir=None, chrome=Path("unused"))
        for name in agent.REGIONAL_PRESETS:
            plan = self.plan(name)
            receipt = {"input_type": "image_url/base64", "response_id": "offline-test", "image_sha256": sha256(photo.read_bytes()).hexdigest(),
                       "recognition": {"species": plan["pet"], "template_fit": {"fits_primary": True, "reason": "fixture", "fallback_id": None},
                                       "generation_plan": plan, "mapping_losses": ["Fixture approximation"]}}
            receipt_path.write_text(json.dumps(receipt), encoding="utf-8")
            output = io.StringIO()
            with patch.dict("sys.modules", {"server": server, "render": renderer}), patch.object(agent.sys, "path", list(agent.sys.path)), redirect_stdout(output):
                agent.generate(args)
            result = json.loads(output.getvalue())
            self.assertEqual(result["params"], plan)
            self.assertEqual(result["regional_preset"], agent.REGIONAL_PRESETS[name]["catalog"][1])
            self.assertEqual(result["mapping_losses"], ["Fixture approximation"])
            self.assertTrue(result["appearance_changed"])
            server.validate = lambda params: {**params, "pattern": "patches"}
            with patch.dict("sys.modules", {"server": server, "render": renderer}), patch.object(agent.sys, "path", list(agent.sys.path)), self.assertRaises(ValueError):
                agent.generate(args)
            def mutate(params):
                params["pattern"] = "patches"
                return params
            server.validate = mutate
            with patch.dict("sys.modules", {"server": server, "render": renderer}), patch.object(agent.sys, "path", list(agent.sys.path)), self.assertRaises(ValueError):
                agent.generate(args)
            server.validate = lambda params: dict(params)


if __name__ == "__main__":
    unittest.main()
