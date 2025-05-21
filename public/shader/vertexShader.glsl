#version 300 es

uniform mat4 u_matrix;
layout(location = 0) in vec2 a_positionHigh;
layout(location = 1) in vec2 a_positionLow;
uniform vec2 u_centerPosHigh;
uniform vec2 u_centerPosLow;

// vec4[] vertices = vec4[4](vec4(-1.0, -1.0, 0.0, 0.0), vec4(1.0, -1.0, 1.0, 0.0), vec4(-1.0, 1.0, 0.0, 1.0), vec4(1.0, 1.0, 1.0, 1.0));
vec2 translate(vec2 high, vec2 low) {
  vec2 highDiff = high - u_centerPosHigh;
  vec2 lowDiff = low - u_centerPosLow;
  return highDiff + lowDiff;
}

void main() {
  vec2 translated = translate(a_positionHigh, a_positionLow);
  gl_Position = u_matrix * vec4(translated.xy, 0.0, 1.0f);
  // gl_Position = vec4(vertices[gl_VertexID].xy, 0.0, 1.0);
}