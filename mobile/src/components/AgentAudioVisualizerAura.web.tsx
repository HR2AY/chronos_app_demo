/**
 * Web adaptation of LiveKit Agents UI AgentAudioVisualizerAura.
 * Aura shader copyright (c) 2026 UNCRN LLC, PolyForm Non-Resale 1.0.0.
 * Renderer implementation is local so this component can run inside Expo Web.
 */
import { useEffect, useMemo, useRef } from "react";
import type { AgentAudioVisualizerAuraProps, AuraAgentState } from "./AgentAudioVisualizerAura";

const fragmentShader = `
precision highp float;
uniform vec2 iResolution;
uniform float iTime;
uniform float uSpeed;
uniform float uBlur;
uniform float uScale;
uniform float uFrequency;
uniform float uAmplitude;
uniform float uMix;
uniform float uColorShift;
uniform float uMode;
uniform vec3 uColor;
const float TAU = 6.283185;

vec2 randFibo(vec2 p) {
  p = fract(p * vec2(443.897, 441.423));
  p += dot(p, p.yx + 19.19);
  return fract((p.xx + p.yx) * p.xy);
}
vec3 tonemap(vec3 x) { x *= 4.0; return x / (1.0 + x); }
float luma(vec3 color) { return dot(color, vec3(0.299, 0.587, 0.114)); }
vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}
vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}
float sdCircle(vec2 st, float r) { return length(st) - r; }
vec2 turb(vec2 pos, float t, float it) {
  mat2 rotation = mat2(0.6, -0.25, 0.25, 0.9);
  mat2 layerRotation = mat2(0.6, -0.8, 0.8, 0.6);
  float frequency = mix(2.0, 15.0, uFrequency);
  float amplitude = uAmplitude;
  float animTime = t * 0.1 * uSpeed;
  for(int i = 0; i < 4; i++) {
    vec2 rotatedPos = pos * rotation;
    vec2 wave = sin(frequency * rotatedPos + float(i) * animTime + it);
    pos += (amplitude / frequency) * rotation[0] * wave;
    rotation *= layerRotation;
    amplitude *= mix(1.0, max(wave.x, wave.y), 0.1);
    frequency *= 1.4;
  }
  return pos;
}

void main() {
  vec2 uv = gl_FragCoord.xy / iResolution.xy;
  vec3 pp = vec3(0.0);
  vec3 bloom = vec3(0.0);
  vec2 pos = uv - 0.5;
  vec2 prevPos = turb(pos, iTime * 0.5, -1.0 / 36.0);
  for(float i = 1.0; i < 37.0; i++) {
    float iter = i / 36.0;
    vec2 st = turb(pos, iTime * 0.5, iter * mix(1.0, TAU, 0.5));
    float d = abs(sdCircle(st, uScale));
    float pd = distance(st, prevPos);
    prevPos = st;
    float dynamicBlur = exp2(pd * 2.0 * 1.442695) - 1.0;
    float ds = smoothstep(0.0, uBlur * 0.05 + max(dynamicBlur, 0.001), d);
    vec3 color = uColor;
    if(uColorShift > 0.01) {
      vec3 hsv = rgb2hsv(color);
      hsv.x = fract(hsv.x + (1.0 - iter) * uColorShift * 0.3);
      color = hsv2rgb(hsv);
    }
    float invd = 1.0 / max(d + dynamicBlur, 0.001);
    pp += (ds - 1.0) * color;
    bloom += clamp(invd, 0.0, 250.0) * color;
  }
  pp /= 36.0;
  vec3 color;
  if(uMode < 0.5) {
    bloom = bloom / (bloom + 2e4);
    color = -pp * 1.2;
    color += (randFibo(gl_FragCoord.xy).x - 0.5) / 255.0;
    color = tonemap(color);
    float alpha = luma(color) * uMix;
    gl_FragColor = vec4(color * uMix, alpha);
  } else {
    color = -pp + (randFibo(gl_FragCoord.xy).x - 0.5) / 255.0;
    float brightness = length(color);
    vec3 direction = brightness > 0.0 ? color / brightness : color;
    float mapped = (brightness * 2.0) / (1.0 + brightness * 2.0);
    color = direction * mapped;
    float gray = dot(color, vec3(0.2, 0.5, 0.1));
    color = clamp(mix(vec3(gray), color, 3.0), 0.0, 1.0);
    gl_FragColor = vec4(color, mapped * clamp(uMix, 1.0, 2.0));
  }
}`;

const vertexShader = `
attribute vec2 position;
void main() { gl_Position = vec4(position, 0.0, 1.0); }
`;

type AuraParameters = { speed: number; scale: number; amplitude: number; frequency: number; brightness: number };

const stateParameters: Record<AuraAgentState, AuraParameters> = {
  disconnected: { speed: 10, scale: 0.2, amplitude: 1.2, frequency: 0.4, brightness: 1 },
  failed: { speed: 10, scale: 0.2, amplitude: 1.2, frequency: 0.4, brightness: 1 },
  idle: { speed: 10, scale: 0.2, amplitude: 1.2, frequency: 0.4, brightness: 1 },
  listening: { speed: 20, scale: 0.3, amplitude: 1, frequency: 0.7, brightness: 1.7 },
  thinking: { speed: 30, scale: 0.3, amplitude: 0.5, frequency: 1, brightness: 1.5 },
  connecting: { speed: 30, scale: 0.3, amplitude: 0.5, frequency: 1, brightness: 1.5 },
  initializing: { speed: 30, scale: 0.3, amplitude: 0.5, frequency: 1, brightness: 1.5 },
  speaking: { speed: 70, scale: 0.3, amplitude: 0.75, frequency: 1.25, brightness: 1.5 },
};

function hexToRgb(color: string): [number, number, number] {
  const match = color.match(/^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i);
  if (!match) return [0.12, 0.84, 0.98];
  return [Number.parseInt(match[1], 16) / 255, Number.parseInt(match[2], 16) / 255, Number.parseInt(match[3], 16) / 255];
}

export function AgentAudioVisualizerAura({
  state = "connecting",
  volume = 0,
  size = 224,
  color = "#d4a017",
  colorShift = 0.12,
  themeMode = "light",
}: AgentAudioVisualizerAuraProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const inputRef = useRef({ state, volume: Math.max(0, Math.min(1, volume)) });
  const rgb = useMemo(() => hexToRgb(color), [color]);

  useEffect(() => {
    inputRef.current = { state, volume: Math.max(0, Math.min(1, volume)) };
  }, [state, volume]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const gl = canvas?.getContext("webgl", { alpha: true, premultipliedAlpha: false });
    if (!canvas || !gl) return;

    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.warn("Aura shader compile failed", gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    };
    const vertex = compile(gl.VERTEX_SHADER, vertexShader);
    const fragment = compile(gl.FRAGMENT_SHADER, fragmentShader);
    const program = gl.createProgram();
    if (!vertex || !fragment || !program) return;
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
    gl.useProgram(program);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, "position");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    const uniform = (name: string) => gl.getUniformLocation(program, name);
    const locations = {
      resolution: uniform("iResolution"), time: uniform("iTime"), speed: uniform("uSpeed"), blur: uniform("uBlur"),
      scale: uniform("uScale"), frequency: uniform("uFrequency"), amplitude: uniform("uAmplitude"), mix: uniform("uMix"),
      colorShift: uniform("uColorShift"), mode: uniform("uMode"), color: uniform("uColor"),
    };
    let current = { ...stateParameters[state] };
    let frame = 0;
    const startedAt = performance.now();

    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(canvas.clientWidth * ratio));
      canvas.height = Math.max(1, Math.round(canvas.clientHeight * ratio));
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    const render = (now: number) => {
      const input = inputRef.current;
      const target = { ...stateParameters[input.state] };
      if (input.state === "speaking") target.scale = 0.2 + 0.2 * input.volume;
      const ease = 0.085;
      current.speed += (target.speed - current.speed) * ease;
      current.scale += (target.scale - current.scale) * ease;
      current.amplitude += (target.amplitude - current.amplitude) * ease;
      current.frequency += (target.frequency - current.frequency) * ease;
      current.brightness += (target.brightness - current.brightness) * ease;
      const elapsed = (now - startedAt) / 1000;
      const pulse = input.state === "listening" || input.state === "thinking" || input.state === "connecting" || input.state === "initializing"
        ? 0.35 * Math.sin(elapsed * (input.state === "listening" ? 4 : 7))
        : 0;

      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform2f(locations.resolution, canvas.width, canvas.height);
      gl.uniform1f(locations.time, elapsed);
      gl.uniform1f(locations.speed, current.speed);
      gl.uniform1f(locations.blur, 0.2);
      gl.uniform1f(locations.scale, current.scale);
      gl.uniform1f(locations.frequency, current.frequency);
      gl.uniform1f(locations.amplitude, current.amplitude);
      gl.uniform1f(locations.mix, current.brightness + pulse);
      gl.uniform1f(locations.colorShift, colorShift);
      gl.uniform1f(locations.mode, themeMode === "light" ? 1 : 0);
      gl.uniform3fv(locations.color, rgb);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
    };
  }, [colorShift, rgb, state, themeMode]);

  return (
    <div data-lk-state={state} aria-label={`Agent audio visualizer: ${state}`} style={{ width: size, height: size }}>
      <canvas ref={canvasRef} style={{ display: "block", width: "100%", height: "100%" }} />
    </div>
  );
}

export type { AgentAudioVisualizerAuraProps, AuraAgentState } from "./AgentAudioVisualizerAura";
