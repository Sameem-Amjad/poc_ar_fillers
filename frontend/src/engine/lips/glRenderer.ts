// WebGL2 lip renderer.
//
// Pipeline (all warp math in video/frame pixel space):
//   1. base    — source frame → offscreen FBO (identity quad)
//   2. warp    — dense grid mesh re-samples the source around the mouth;
//                continuous geometry → zero seams, GPU bilinear quality
//   3. composite — FBO → canvas with cover/contain + mirror transform, plus
//                photometric enhancement inside a feathered lip mask:
//                  · vibrance  — deepens the patient's own lip color
//                  · gloss     — amplifies highlights already present in the
//                                scene lighting (adaptive, no fixed tint)
//                  · border    — faint contact shadow at the vermillion border
//
// The feathered mask is rasterized from the *warped* lip contours on a small
// 2D canvas each frame (fill outer ring, punch out the mouth opening, blur).
// Feathering is what sells the realism — there is never a hard seam.

import type { WarpGrid, Point2 } from './warp';

export interface PhotometricParams {
  gloss: number;
  vibrance: number;
  border: number;
}

export interface RenderState {
  grid: WarpGrid | null;
  outerRing: Point2[] | null;
  innerRing: Point2[] | null;
  photo: PhotometricParams;
  mirror: boolean;
  fit: 'cover' | 'contain';
}

const VS_FRAME = `#version 300 es
layout(location=0) in vec2 aUV;
out vec2 vUV;
void main() {
  vUV = aUV;
  gl_Position = vec4(aUV * 2.0 - 1.0, 0.0, 1.0);
}`;

const FS_FRAME = `#version 300 es
precision mediump float;
in vec2 vUV;
out vec4 frag;
uniform sampler2D uTex;
void main() { frag = vec4(texture(uTex, vUV).rgb, 1.0); }`;

const VS_WARP = `#version 300 es
layout(location=0) in vec2 aPos;  // warped position, frame px
layout(location=1) in vec2 aUV;   // source sample, frame uv
out vec2 vUV;
uniform vec2 uFrameSize;
void main() {
  vUV = aUV;
  vec2 clip = aPos / uFrameSize * 2.0 - 1.0;
  gl_Position = vec4(clip, 0.0, 1.0);
}`;

const VS_COMPOSITE = `#version 300 es
layout(location=0) in vec2 aUV;   // canvas uv, y-down
out vec2 vUV;
void main() {
  vUV = aUV;
  gl_Position = vec4(aUV.x * 2.0 - 1.0, 1.0 - aUV.y * 2.0, 0.0, 1.0);
}`;

const FS_COMPOSITE = `#version 300 es
precision mediump float;
in vec2 vUV;
out vec4 frag;
uniform sampler2D uFrame;
uniform sampler2D uMask;
uniform vec2 uCanvasSize;
uniform vec2 uFrameSize;
uniform float uScale;
uniform vec2 uOffset;
uniform float uMirror;
uniform vec4 uMaskRect;   // origin.xy, size.zw in frame px
uniform float uGloss;
uniform float uVibrance;
uniform float uBorder;
uniform vec3 uBg;

void main() {
  vec2 cpx = vUV * uCanvasSize;
  vec2 fpx = (cpx - uOffset) / uScale;
  if (uMirror > 0.5) fpx.x = uFrameSize.x - fpx.x;
  vec2 fuv = fpx / uFrameSize;
  if (fuv.x < 0.0 || fuv.x > 1.0 || fuv.y < 0.0 || fuv.y > 1.0) {
    frag = vec4(uBg, 1.0);
    return;
  }
  vec3 col = texture(uFrame, fuv).rgb;

  vec2 muv = (fpx - uMaskRect.xy) / uMaskRect.zw;
  float m = 0.0;
  if (muv.x > 0.0 && muv.x < 1.0 && muv.y > 0.0 && muv.y < 1.0) {
    m = texture(uMask, muv).a;
  }

  if (m > 0.002) {
    float luma = dot(col, vec3(0.299, 0.587, 0.114));
    vec3 saturated = clamp(mix(vec3(luma), col, 1.0 + uVibrance * 2.2), 0.0, 1.0);
    col = mix(col, saturated, m);
    float hl = smoothstep(0.60, 0.92, luma);
    col += uGloss * m * hl * (vec3(1.0) - col);
    float band = m * (1.0 - m) * 4.0;
    col *= 1.0 - uBorder * band * 0.10;
  }
  frag = vec4(col, 1.0);
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    throw new Error(`Shader compile failed: ${gl.getShaderInfoLog(s)}`);
  }
  return s;
}

function link(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const p = gl.createProgram()!;
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error(`Program link failed: ${gl.getProgramInfoLog(p)}`);
  }
  return p;
}

const MASK_SIZE = 384;
const BG_COLOR: [number, number, number] = [0.059, 0.067, 0.086]; // #0f1116

export class LipRenderer {
  private gl: WebGL2RenderingContext;
  private progFrame: WebGLProgram;
  private progWarp: WebGLProgram;
  private progComposite: WebGLProgram;

  private quadBuf: WebGLBuffer;
  private warpPosBuf: WebGLBuffer;
  private warpUVBuf: WebGLBuffer;
  private warpIdxBuf: WebGLBuffer;
  private warpIdxCount = 0;

  private videoTex: WebGLTexture;
  private maskTex: WebGLTexture;
  private fboTex: WebGLTexture;
  private fbo: WebGLFramebuffer;

  private frameW = 0;
  private frameH = 0;

  private maskCanvas: HTMLCanvasElement;
  private maskBlurCanvas: HTMLCanvasElement;
  private maskRect: [number, number, number, number] = [0, 0, 1, 1];

  // Cached display transform (updated each render) for overlay mapping.
  private viewScale = 1;
  private viewOffset: [number, number] = [0, 0];
  private lastMirror = false;

  private canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance',
    });
    if (!gl) throw new Error('WebGL2 not supported');
    this.gl = gl;

    this.progFrame = link(gl, VS_FRAME, FS_FRAME);
    this.progWarp = link(gl, VS_WARP, FS_FRAME);
    this.progComposite = link(gl, VS_COMPOSITE, FS_COMPOSITE);

    this.quadBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);

    this.warpPosBuf = gl.createBuffer()!;
    this.warpUVBuf = gl.createBuffer()!;
    this.warpIdxBuf = gl.createBuffer()!;

    this.videoTex = this.makeTexture();
    this.maskTex = this.makeTexture();
    this.fboTex = this.makeTexture();
    this.fbo = gl.createFramebuffer()!;

    this.maskCanvas = document.createElement('canvas');
    this.maskCanvas.width = this.maskCanvas.height = MASK_SIZE;
    this.maskBlurCanvas = document.createElement('canvas');
    this.maskBlurCanvas.width = this.maskBlurCanvas.height = MASK_SIZE;

    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);
  }

  private makeTexture(): WebGLTexture {
    const { gl } = this;
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  // Set the working frame size (video or photo dimensions). Re-allocates the FBO.
  setSourceSize(w: number, h: number): void {
    if (w === this.frameW && h === this.frameH) return;
    this.frameW = w;
    this.frameH = h;
    const { gl } = this;
    gl.bindTexture(gl.TEXTURE_2D, this.fboTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.fboTex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  resize(cssW: number, cssH: number, dpr: number): void {
    const w = Math.round(cssW * Math.min(dpr, 2));
    const h = Math.round(cssH * Math.min(dpr, 2));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  uploadFrame(src: TexImageSource): void {
    const { gl } = this;
    gl.bindTexture(gl.TEXTURE_2D, this.videoTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
  }

  render(state: RenderState): void {
    const { gl } = this;
    if (this.frameW === 0) return;

    // ── Pass 1: source → FBO ──
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.viewport(0, 0, this.frameW, this.frameH);
    gl.useProgram(this.progFrame);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.videoTex);
    gl.uniform1i(gl.getUniformLocation(this.progFrame, 'uTex'), 0);
    this.drawQuad(0);

    // ── Pass 2: warp grid → FBO ──
    if (state.grid) {
      const g = state.grid;
      gl.useProgram(this.progWarp);
      gl.uniform2f(gl.getUniformLocation(this.progWarp, 'uFrameSize'), this.frameW, this.frameH);
      gl.uniform1i(gl.getUniformLocation(this.progWarp, 'uTex'), 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, this.warpPosBuf);
      gl.bufferData(gl.ARRAY_BUFFER, g.dst, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

      // UVs: source positions normalized to frame
      const uv = new Float32Array(g.src.length);
      for (let i = 0; i < g.src.length; i += 2) {
        uv[i] = g.src[i] / this.frameW;
        uv[i + 1] = g.src[i + 1] / this.frameH;
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, this.warpUVBuf);
      gl.bufferData(gl.ARRAY_BUFFER, uv, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.warpIdxBuf);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, g.indices, gl.DYNAMIC_DRAW);
      this.warpIdxCount = g.indices.length;
      gl.drawElements(gl.TRIANGLES, this.warpIdxCount, gl.UNSIGNED_SHORT, 0);
      gl.disableVertexAttribArray(1);
    }

    // ── Mask ──
    const hasMask = !!(state.outerRing && state.innerRing) &&
      (state.photo.gloss > 0 || state.photo.vibrance > 0 || state.photo.border > 0);
    if (hasMask) {
      this.rasterizeMask(state.outerRing!, state.innerRing!);
    }

    // ── Pass 3: composite → canvas ──
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.progComposite);

    const cw = this.canvas.width;
    const ch = this.canvas.height;
    const scale = state.fit === 'cover'
      ? Math.max(cw / this.frameW, ch / this.frameH)
      : Math.min(cw / this.frameW, ch / this.frameH);
    const offX = (cw - this.frameW * scale) / 2;
    const offY = (ch - this.frameH * scale) / 2;
    this.viewScale = scale;
    this.viewOffset = [offX, offY];
    this.lastMirror = state.mirror;

    const u = (n: string) => gl.getUniformLocation(this.progComposite, n);
    gl.uniform2f(u('uCanvasSize'), cw, ch);
    gl.uniform2f(u('uFrameSize'), this.frameW, this.frameH);
    gl.uniform1f(u('uScale'), scale);
    gl.uniform2f(u('uOffset'), offX, offY);
    gl.uniform1f(u('uMirror'), state.mirror ? 1 : 0);
    gl.uniform4f(u('uMaskRect'), ...this.maskRect);
    gl.uniform1f(u('uGloss'), hasMask ? state.photo.gloss : 0);
    gl.uniform1f(u('uVibrance'), hasMask ? state.photo.vibrance : 0);
    gl.uniform1f(u('uBorder'), hasMask ? state.photo.border : 0);
    gl.uniform3f(u('uBg'), ...BG_COLOR);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.fboTex);
    gl.uniform1i(u('uFrame'), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.maskTex);
    gl.uniform1i(u('uMask'), 1);
    gl.activeTexture(gl.TEXTURE0);

    this.drawQuad(0);
  }

  private drawQuad(loc: number): void {
    const { gl } = this;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  private rasterizeMask(outer: Point2[], inner: Point2[]): void {
    // Mask rect: bbox of the warped outer ring + margin for the feather bleed.
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of outer) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    }
    const margin = Math.max(maxX - minX, maxY - minY) * 0.3;
    minX -= margin; minY -= margin; maxX += margin; maxY += margin;
    const w = maxX - minX;
    const h = maxY - minY;
    this.maskRect = [minX, minY, w, h];

    const ctx = this.maskCanvas.getContext('2d')!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, MASK_SIZE, MASK_SIZE);
    ctx.setTransform(MASK_SIZE / w, 0, 0, MASK_SIZE / h, -minX * (MASK_SIZE / w), -minY * (MASK_SIZE / h));

    const path = (ring: Point2[]) => {
      ctx.beginPath();
      ctx.moveTo(ring[0].x, ring[0].y);
      for (let i = 1; i < ring.length; i++) ctx.lineTo(ring[i].x, ring[i].y);
      ctx.closePath();
    };

    ctx.fillStyle = '#fff';
    path(outer);
    ctx.fill();
    // Punch out the mouth opening so teeth never receive enhancement.
    ctx.globalCompositeOperation = 'destination-out';
    path(inner);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';

    // Feather: blur into the second canvas. Radius ≈ 5% of lip height on the
    // mask scale — soft enough that no seam is ever visible.
    const bctx = this.maskBlurCanvas.getContext('2d')!;
    bctx.setTransform(1, 0, 0, 1, 0, 0);
    bctx.clearRect(0, 0, MASK_SIZE, MASK_SIZE);
    bctx.filter = `blur(${Math.round(MASK_SIZE * 0.022)}px)`;
    bctx.drawImage(this.maskCanvas, 0, 0);
    bctx.filter = 'none';

    const { gl } = this;
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.maskTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.maskBlurCanvas);
    gl.activeTexture(gl.TEXTURE0);
  }

  // Clear the visible canvas to the backdrop color. Used when a mode switch
  // leaves no active source — otherwise the last rendered frame stays visible.
  clear(): void {
    const { gl } = this;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(...BG_COLOR, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  // Map a frame-space point to CSS pixel coordinates (for HTML/2D overlays).
  frameToCss(p: Point2): Point2 {
    const dpr = this.canvas.width / (this.canvas.clientWidth || 1);
    const fx = this.lastMirror ? this.frameW - p.x : p.x;
    return {
      x: (this.viewOffset[0] + fx * this.viewScale) / dpr,
      y: (this.viewOffset[1] + p.y * this.viewScale) / dpr,
    };
  }

  // Must be called synchronously after render() (drawing buffer is not
  // preserved). Crops to the frame content so contain-mode letterbox bars
  // never appear in saved captures.
  captureDataURL(quality = 0.9): string {
    const x = Math.max(0, Math.round(this.viewOffset[0]));
    const y = Math.max(0, Math.round(this.viewOffset[1]));
    const w = Math.min(this.canvas.width - x, Math.round(this.frameW * this.viewScale));
    const h = Math.min(this.canvas.height - y, Math.round(this.frameH * this.viewScale));
    if (w <= 0 || h <= 0) return this.canvas.toDataURL('image/jpeg', quality);

    const crop = document.createElement('canvas');
    crop.width = w;
    crop.height = h;
    crop.getContext('2d')!.drawImage(this.canvas, x, y, w, h, 0, 0, w, h);
    return crop.toDataURL('image/jpeg', quality);
  }

  dispose(): void {
    const { gl } = this;
    gl.deleteProgram(this.progFrame);
    gl.deleteProgram(this.progWarp);
    gl.deleteProgram(this.progComposite);
    gl.deleteBuffer(this.quadBuf);
    gl.deleteBuffer(this.warpPosBuf);
    gl.deleteBuffer(this.warpUVBuf);
    gl.deleteBuffer(this.warpIdxBuf);
    gl.deleteTexture(this.videoTex);
    gl.deleteTexture(this.maskTex);
    gl.deleteTexture(this.fboTex);
    gl.deleteFramebuffer(this.fbo);
  }
}
