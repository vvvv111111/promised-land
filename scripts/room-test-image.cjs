exports.imageDifference = async (page, first, second) => page.evaluate(async ([a, b]) => {
  const read = async source => {
    const image = new Image(); image.src = 'data:image/png;base64,' + source; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
    const context = canvas.getContext('2d'); context.drawImage(image, 0, 0);
    return context.getImageData(0, 0, image.width, image.height).data;
  };
  const x = await read(a), y = await read(b);
  if (x.length !== y.length) return Infinity;
  let sum = 0; for (let i = 0; i < x.length; i++) sum += Math.abs(x[i] - y[i]);
  return sum / x.length;
}, [first.toString('base64'), second.toString('base64')]);
