precision highp float;
precision highp int;
precision highp sampler2D;

ivec2 indexToUV(sampler2D texture, int index) {

    int dim = textureSize(texture, 0).x;
    int x = index % dim;
    int y = index / dim;

    return ivec2(x, y);
}

vec2 fetchPosByIndex(sampler2D texture, int index) {
    ivec2 uv = indexToUV(texture, index);
    vec2 pos = texelFetch(texture, uv, 0).rg;
    return pos;
}

#ifdef VERTEX_SHADER

uniform mat4 uMatrix;
uniform float uPixelInMercator;
uniform int vertexCount;
uniform sampler2D lineTexture;

out vec2 mercatorPosition;
out float vertexArea;

vec2 calcBasis(vec2 vector) {
    float length = length(vector);
    return vector / length;
}

vec2 calcOrthonormalBasis(vec2 vector) {
    vec2 normal = vec2(vector.y, -vector.x);
    return calcBasis(normal);
}

void main() {

    int vertexIndex = int(gl_VertexID / 2);
    int parity = (gl_VertexID % 2) * 2 - 1;

    // fetch the position of current vertex
    vec2 vertexPos = fetchPosByIndex(lineTexture, vertexIndex);

    mercatorPosition = vec2(0.0);
    vec2 offset = vec2(0.0);

    if(vertexIndex == 0) {
        // fetch the position of next vertex
        vec2 vertexPosNext = fetchPosByIndex(lineTexture, vertexIndex + 1);

        vec2 basis = calcOrthonormalBasis(vertexPosNext - vertexPos);
        offset = basis * uPixelInMercator;

    } else if(vertexIndex == vertexCount - 1) {
        // fetch the position of last vertex
        vec2 vertexPosLast = fetchPosByIndex(lineTexture, vertexIndex - 1);

        vec2 basis = calcOrthonormalBasis(vertexPos - vertexPosLast);
        offset = basis * uPixelInMercator;

    } else {

        vec2 vertexPosNext = fetchPosByIndex(lineTexture, vertexIndex + 1);
        vec2 vertexPosLast = fetchPosByIndex(lineTexture, vertexIndex - 1);

        vec2 v1 = calcBasis(vertexPos - vertexPosLast);
        vec2 v2 = calcBasis(vertexPosNext - vertexPos);
        vec2 basis = calcOrthonormalBasis(v1 + v2);

        float sinTheta = length(cross(vec3(v1, 0.0), vec3(basis, 0.0))) / (length(v1) * length(basis));

        float length = uPixelInMercator / max(sinTheta, 0.00001);
        offset = basis * length;
    }

    mercatorPosition = vertexPos + float(parity) * offset;
    vertexArea = float(vertexIndex);
    gl_Position = uMatrix * vec4(mercatorPosition, 0.0, 1.0);
}

#endif

#ifdef FRAGMENT_SHADER

in vec2 mercatorPosition;
in float vertexArea;

uniform float uPixelInMercator;
uniform sampler2D lineTexture;

out vec4 fragColor;

float distanceToLineSegment(vec2 P, vec2 A, vec2 B) {
    vec2 AP = P - A;
    vec2 AB = B - A;
    float l2 = dot(AB, AB); // AB 长度的平方
    
    float t = clamp(dot(AP, AB) / l2, 0.0, 1.0); // 投影参数 t ∈ [0, 1]
    vec2 Q = A + t * AB; // 最近点 Q
    return distance(P, Q); // 返回距离
}

void main() {

    int currentVertexIndex = int(floor(vertexArea));
    vec2 currentVertexPos = fetchPosByIndex(lineTexture, currentVertexIndex);
    vec2 nextVertexPos = fetchPosByIndex(lineTexture, currentVertexIndex + 1);

    float distance = distanceToLineSegment(mercatorPosition, currentVertexPos, nextVertexPos);
    float ratio = distance / uPixelInMercator;
 
    if(ratio <= 0.3) {
        fragColor = vec4(0.0, 0.52, 1.0, 1.0);
    } else {
        fragColor = vec4(0.0, 0.52, 1.0, (1.0 - ratio) / 0.7);
    }
}

#endif