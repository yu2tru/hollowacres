// Single full-screen pass for colour grading, vignette, grain, damage/chill
// overlays, fades and the CCTV look. Runs in linear space before tonemapping.
export const GradeShader = {
  uniforms: {
    tDiffuse: { value: null }, uTime: { value: 0 },
    uVignette: { value: 0.35 }, uGrain: { value: 0.03 }, uSat: { value: 1.0 },
    uTint: { value: [1, 1, 1] }, uHurt: { value: 0 }, uChill: { value: 0 }, uLowHealth: { value: 0 },
    uFade: { value: 0 }, uCCTV: { value: 0 }, uNV: { value: 1 }, uAspect: { value: 1.7 }, uExposure: { value: 1 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uTime, uVignette, uGrain, uSat, uHurt, uChill, uLowHealth, uFade, uCCTV, uNV, uAspect, uExposure;
    uniform vec3 uTint; varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)) + uTime * 37.0) * 43758.5453); }
    void main(){
      vec2 uv = vUv;
      if (uCCTV > 0.5) {
        vec2 c = uv - 0.5; float r2 = dot(c,c); uv = 0.5 + c * (1.0 + r2 * 0.18);
        if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { gl_FragColor = vec4(0.0,0.0,0.0,1.0); return; }
        uv.x += (hash(vec2(floor(uv.y*240.0), 1.0)) - 0.5) * 0.002;
      }
      vec3 col = texture2D(tDiffuse, uv).rgb * uExposure;
      float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(lum), col, uSat * (1.0 - uLowHealth * 0.6));
      col *= uTint;
      if (uCCTV > 0.5) {
        float l = dot(col, vec3(0.3,0.59,0.11)) * uNV;
        l = l / (1.0 + l * 0.4);
        col = vec3(l * 0.75, l * 1.0, l * 0.8);
        col += (hash(uv * 600.0) - 0.5) * 0.12;
        col *= 0.85 + 0.15 * sin(uv.y * 900.0);
        col *= 0.9 + 0.1 * sin(uTime * 60.0);
      }
      vec2 d = (vUv - 0.5) * vec2(uAspect, 1.0);
      float vig = smoothstep(0.35, 1.25, length(d));
      col *= 1.0 - vig * (uVignette + uLowHealth * 0.4);
      // hurt: red pulses at edges
      col = mix(col, col * vec3(1.6, 0.25, 0.2) + vec3(0.06, 0.0, 0.0), clamp(uHurt * vig * 2.2, 0.0, 0.85));
      // chill: frost creeping in
      float frost = smoothstep(0.55, 1.1, length(d) + (hash(floor(vUv*80.0)) - 0.5) * 0.12);
      col = mix(col, vec3(0.45, 0.6, 0.85) * (lum + 0.1), clamp(uChill * frost * 1.4, 0.0, 0.8));
      col += (hash(vUv * 900.0) - 0.5) * uGrain * (0.3 + lum);
      col *= 1.0 - uFade;
      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }`,
};
