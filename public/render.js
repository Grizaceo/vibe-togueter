// Generic primitive renderer. Games describe WHAT to draw; this draws it.
// Primitives: {t:'rect',x,y,w,h,color,rot?} {t:'circle',x,y,r,color,fill?}
//   {t:'text',x,y,text,size?,color?,align?} {t:'line',x1,y1,x2,y2,color?,w?}
//   {t:'sprite',x,y,w,h,src,rot?}

const spriteCache = new Map();
function sprite(src) {
  let img = spriteCache.get(src);
  if (!img) { img = new Image(); img.src = src; spriteCache.set(src, img); }
  return img;
}

export function drawFrame(ctx, view, canvas, world) {
  const W = world?.w || 1280, H = world?.h || 720;
  ctx.save();
  ctx.fillStyle = view.bg || '#111';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const s = Math.min(canvas.width / W, canvas.height / H);
  ctx.translate((canvas.width - W * s) / 2, (canvas.height - H * s) / 2);
  ctx.scale(s, s);

  for (const p of view.layers || []) drawPrim(ctx, p);
  for (const p of view.hud || []) drawPrim(ctx, p);
  ctx.restore();
}

function drawPrim(ctx, p) {
  switch (p.t) {
    case 'rect':
      ctx.save();
      if (p.rot) { ctx.translate(p.x + p.w / 2, p.y + p.h / 2); ctx.rotate(p.rot); ctx.translate(-p.x - p.w / 2, -p.y - p.h / 2); }
      ctx.fillStyle = p.color || '#fff';
      ctx.fillRect(p.x, p.y, p.w, p.h);
      ctx.restore();
      break;
    case 'circle':
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      if (p.fill === false) { ctx.strokeStyle = p.color || '#fff'; ctx.lineWidth = p.w || 2; ctx.stroke(); }
      else { ctx.fillStyle = p.color || '#fff'; ctx.fill(); }
      break;
    case 'line':
      ctx.beginPath();
      ctx.moveTo(p.x1, p.y1); ctx.lineTo(p.x2, p.y2);
      ctx.strokeStyle = p.color || '#fff'; ctx.lineWidth = p.w || 2; ctx.stroke();
      break;
    case 'text':
      ctx.fillStyle = p.color || '#fff';
      ctx.font = `${p.size || 20}px system-ui, sans-serif`;
      ctx.textAlign = p.align || 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(p.text ?? ''), p.x, p.y);
      break;
    case 'sprite': {
      const img = sprite(p.src);
      if (!img.complete) break;
      ctx.save();
      if (p.rot) { ctx.translate(p.x + p.w / 2, p.y + p.h / 2); ctx.rotate(p.rot); ctx.translate(-p.x - p.w / 2, -p.y - p.h / 2); }
      ctx.drawImage(img, p.x, p.y, p.w, p.h);
      ctx.restore();
      break;
    }
  }
}
