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

vec2 fetchPosLowByIndex(sampler2D texture, int index) {
    ivec2 uv = indexToUV(texture, index);
    vec2 pos = texelFetch(texture, uv, 0).ba;
    return pos;
}

float epsilon(float x) {
    return 0.00001 * x;
}

#ifdef VERTEX_SHADER

uniform mat4 uMatrix;
uniform float uPixelInMercator;
uniform int vertexCount;
uniform sampler2D lineTexture;
uniform mat4 uRelativeEyeMatrix;
uniform vec2 uCenterPosHigh;
uniform vec2 uCenterPosLow;

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

vec2 translate(vec2 high, vec2 low) {
    vec2 highDiff = high - uCenterPosHigh;
    vec2 lowDiff = low - uCenterPosLow;
    return highDiff + lowDiff;
}

vec2 getAccurateVertex(int vertexIndex) {
    vec2 vertexPosHigh = fetchPosByIndex(lineTexture, vertexIndex);
    vec2 vertexPosLow = fetchPosLowByIndex(lineTexture, vertexIndex);
    vec2 translatedPos = translate(vertexPosHigh, vertexPosLow);

    return translatedPos;
}

void main() {

    int vertexIndex = int(gl_VertexID / 2);
    int parity = (gl_VertexID % 2) * 2 - 1;

    // Fetch the position of current vertex
    vec2 vertexPos = getAccurateVertex(vertexIndex);

    mercatorPosition = vec2(0.0);
    vec2 offset = vec2(0.0);

    if(vertexIndex == 0) {
        // Fetch the position of next vertex
        vec2 vertexPosNext = getAccurateVertex(vertexIndex + 1);

        vec2 basis = calcOrthonormalBasis(vertexPosNext - vertexPos);
        offset = basis * uPixelInMercator;

    } else if(vertexIndex == vertexCount - 1) {
        // Fetch the position of last vertex
        vec2 vertexPosLast = getAccurateVertex(vertexIndex - 1);

        vec2 basis = calcOrthonormalBasis(vertexPos - vertexPosLast);
        offset = basis * uPixelInMercator;

    } else {

        vec2 vertexPosNext = getAccurateVertex(vertexIndex + 1);
        vec2 vertexPosLast = getAccurateVertex(vertexIndex - 1);

        vec2 v1 = calcBasis(vertexPos - vertexPosLast);
        vec2 v2 = calcBasis(vertexPosNext - vertexPos);
        vec2 basis = calcOrthonormalBasis(v1 + v2);

        float sinTheta = length(cross(vec3(v1, 0.0), vec3(basis, 0.0))) / (length(v1) * length(basis));

        float length = uPixelInMercator / max(sinTheta, epsilon(1.0));
        offset = basis * length;
    }

    mercatorPosition = vertexPos + float(parity) * offset;
    // mercatorPosition = fetchPosByIndex(lineTexture, vertexIndex) + float(parity) * offset;
    vertexArea = float(vertexIndex);
    gl_Position = uRelativeEyeMatrix * vec4(mercatorPosition, 0.0, 1.0);
}

#endif

#ifdef FRAGMENT_SHADER

in vec2 mercatorPosition;
in float vertexArea;

uniform float uPixelInMercator;
uniform sampler2D lineTexture;
uniform vec2 uCenterPosHigh;
uniform vec2 uCenterPosLow;

out vec4 fragColor;

float distanceToLineSegment(vec2 P, vec2 A, vec2 B) {
    vec2 AP = P - A;
    vec2 AB = B - A;
    float l2 = dot(AB, AB); // AB 长度的平方

    float t = clamp(dot(AP, AB) / l2, 0.0, 1.0); // 投影参数 t ∈ [0, 1]
    vec2 Q = A + t * AB; // 最近点 Q
    return distance(P, Q); // 返回距离
}

vec2 translate(vec2 high, vec2 low) {
    vec2 highDiff = high - uCenterPosHigh;
    vec2 lowDiff = low - uCenterPosLow;
    return highDiff + lowDiff;
}

vec2 getAccurateVertex(int vertexIndex) {
    vec2 vertexPosHigh = fetchPosByIndex(lineTexture, vertexIndex);
    vec2 vertexPosLow = fetchPosLowByIndex(lineTexture, vertexIndex);
    vec2 translatedPos = translate(vertexPosHigh, vertexPosLow);

    return translatedPos;
}

float getTraveledLength(vec2 P, vec2 A, vec2 B) {
    vec2 AP = P - A;
    vec2 AB = B - A;
    float segLen = length(AB);
    float t = clamp(dot(AP, AB) / dot(AB, AB), 0.0, 1.0);
    // float t = dot(AP, AB) / dot(AB, AB); 
    return segLen * t;
}

void main() {

    int currentVertexIndex = int(floor(vertexArea));
    vec2 currentVertexPos = getAccurateVertex(currentVertexIndex);
    vec2 nextVertexPos = getAccurateVertex(currentVertexIndex + 1);

    float distance = distanceToLineSegment(mercatorPosition, currentVertexPos, nextVertexPos);
    float traveledLength = getTraveledLength(mercatorPosition, currentVertexPos, nextVertexPos);

    float ratio = distance / uPixelInMercator;

    float dashLength = uPixelInMercator * 5.0;
    float dashIndex = floor(traveledLength / dashLength);
    float dashFlag = mod(dashIndex, 2.0); // 0 or 1

    // fragColor = vec4(0.0, 1.0, 0.65, 1.0);

    if(ratio <= 0.6) {
        if(dashFlag < 0.5) {
            fragColor = vec4(0.0, 0.0, 0.0, 1.0);
        } else {
            fragColor = vec4(1.0);
        }
    } else if(ratio < 1.0) {
        fragColor = vec4(0.0, 0.0, 0.0, (1.0 - ratio) / 0.4);
    } else {
        // fragColor = vec4(0.0, 0.0, 0.0, (1.0 - ratio) / 0.1);

    }
}

#endif