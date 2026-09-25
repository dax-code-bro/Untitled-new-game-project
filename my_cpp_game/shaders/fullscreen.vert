// One triangle that covers the screen, from gl_VertexID alone -- no
// vertex buffer. Core profile still wants a VAO bound; the renderer
// keeps an empty one for exactly this.
out vec2 vUv;
void main() {
    vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
    vUv = p;
    gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
