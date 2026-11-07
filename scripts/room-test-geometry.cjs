const world = require('../src/world/demo-world.json');
const manifest = require('../src/world/asset-manifest.json');
const background = manifest.assets.find(asset => asset.asset_id === world.background_id);

function objectCenter(object, position = { x: object.position_x, y: object.position_y }) {
  const asset = manifest.assets.find(asset => asset.asset_id === object.asset_id);
  const anchor = object.anchor ?? asset.default_anchor;
  const [left, top, right, bottom] = asset.alpha_bounds ?? [0, 0, asset.width, asset.height];
  const height = object.size.width * background.width / background.height * asset.height / asset.width;
  return {
    x: position.x + ((left + right) / 2 / asset.width - anchor.x) * object.size.width,
    y: position.y + ((top + bottom) / 2 / asset.height - anchor.y) * height,
  };
}

module.exports = { background, objectCenter };
