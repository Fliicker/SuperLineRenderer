import mapboxgl from "mapbox-gl";
import { mat4 } from "gl-matrix";
import axios from "axios";

export default class SuperLineLayer {
  id = "highlight";
  type = "custom";
  maxVertexCount = 64 * 64;
  positionTextureSize = Math.ceil(Math.sqrt(this.maxVertexCount));
  positionArray = new Float32Array(this.maxVertexCount * 4);
  vertexCount = 0;
  linePixelLength = 20;

  onAdd(map, gl) {
    this.map = map;
    this.init(gl)
  }

  /** @param { WebGL2RenderingContext } gl */
  async init(gl) {

    this.gl = gl

    enableAllExtensions(gl);

    this.lineShader = await createShader(gl, "/shader/line.glsl");
    this.showShader = await createShader(gl, "/shader/show.glsl");

    this.positionTexture = createTexture2D(
      gl,
      this.positionTextureSize,
      this.positionTextureSize,
      gl.RGBA32F,
      gl.RGBA,
      gl.FLOAT,
      this.positionArray
    );
  }

  /** @param { WebGL2RenderingContext } gl */
  render(gl, matrix) {

    if (!this.lineShader) return

    const mapCenterLngLat = mapboxgl.MercatorCoordinate.fromLngLat(
      this.map.transform._center.toArray()
    );

    const mapCenter = [mapCenterLngLat.x, mapCenterLngLat.y]
    const relativeMat = mat4.translate([], matrix, [mapCenter[0], mapCenter[1], 0])
    const mapPosX = encodeFloatToDouble(mapCenter[0])
    const mapPosY = encodeFloatToDouble(mapCenter[1])


    // calculate line width in mercator units
    const zoom = this.map.getZoom();
    const worldSize = 512 * Math.pow(2, zoom);
    const mercatorUnitsPerPixel = 1 / worldSize
    const lineWidthInMercatorUnits = this.linePixelLength * mercatorUnitsPerPixel;

    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    // gl.useProgram(this.showShader)

    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.positionTexture)
    // gl.uniform1i(gl.getUniformLocation(this.showShader, "showTexture"), 0)
    // gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)

    gl.useProgram(this.lineShader)
    gl.uniformMatrix4fv(gl.getUniformLocation(this.lineShader, "uMatrix"), false, matrix)
    gl.uniform1f(gl.getUniformLocation(this.lineShader, "uPixelInMercator"), lineWidthInMercatorUnits);
    gl.uniform1i(gl.getUniformLocation(this.lineShader, "lineTexture"), 0)
    gl.uniform1i(gl.getUniformLocation(this.lineShader, "vertexCount"), this.vertexCount + 1)
    gl.uniformMatrix4fv(gl.getUniformLocation(this.lineShader, 'uRelativeEyeMatrix'), false, relativeMat)
    gl.uniform2fv(gl.getUniformLocation(this.lineShader, 'uCenterPosHigh'), new Float32Array([mapPosX[0], mapPosY[0]]))
    gl.uniform2fv(gl.getUniformLocation(this.lineShader, 'uCenterPosLow'),  new Float32Array([mapPosX[1], mapPosY[1]]))

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, (this.vertexCount + 1) * 2 + 2)
    // gl.drawArrays(gl.LINE_STRIP, 0, this.vertexCount + 1)

    gl.bindTexture(gl.TEXTURE_2D, null)
  }

  confirmCurrentPoint() {

    if (this.vertexCount + 1 === this.maxVertexCount) {
      console.warn("Vertex array is full, cannot add more points");
      return;
    }

    this.currentPointConfirmed = true
  }

  updateCurrentPoint(mercatorCoords) {

    if (this.currentPointConfirmed) {
      this.vertexCount++;
      this.currentPointConfirmed = false
    }

    const gl = this.gl

    const [highX, lowX] = encodeFloatToDouble(mercatorCoords.x)
    const [highY, lowY] = encodeFloatToDouble(mercatorCoords.y)

    this.positionArray[this.vertexCount * 2] = highX;
    this.positionArray[this.vertexCount * 2 + 1] = highY;
    this.positionArray[this.vertexCount * 2 + 2] = lowX;
    this.positionArray[this.vertexCount * 2 + 3] = lowY;

    const xOffset = this.vertexCount % this.positionTextureSize;
    const yOffset = Math.floor(this.vertexCount / this.positionTextureSize);

    setTexturePixel(
      gl,
      this.positionTexture,
      xOffset,
      yOffset,
      gl.RGBA,
      gl.FLOAT,
      new Float32Array([highX, highY, lowX, lowY])
    );

    this.map.triggerRepaint();
  }

  clearPoints() {

    const gl = this.gl

    this.positionArray.fill(0)
    this.vertexCount = 0
    this.currentPointConfirmed = false

    gl.bindTexture(gl.TEXTURE_2D, this.positionTexture);
    gl.texSubImage2D(
      gl.TEXTURE_2D,
      0,             // mip level
      0, 0,          // xoffset, yoffset
      this.positionTextureSize,
      this.positionTextureSize,
      gl.RGBA,
      gl.FLOAT,
      new Float32Array(this.maxVertexCount * 4)
    );
    gl.bindTexture(gl.TEXTURE_2D, null)
  }


}

// Helpers //////////////////////////////////////////////////////////////////////////////////////////////////////

function encodeFloatToDouble(value) {
  let result = new Float32Array(2);
  result[0] = value;
  result[1] = value - result[0];
  return result;
}

/**
 * @param {WebGL2RenderingContext} gl
 */
function enableAllExtensions(gl) {
  const extensions = gl.getSupportedExtensions();
  extensions.forEach((ext) => {
    gl.getExtension(ext);
    // console.log('Enabled extensions: ', ext)
  });
}

/**
 * @param {WebGL2RenderingContext} gl
 * @param {string} url
 */
async function createShader(gl, url) {
  let shaderCode = "";
  await axios.get(url).then((response) => (shaderCode += response.data));
  const vertexShaderStage = compileShader(gl, shaderCode, gl.VERTEX_SHADER);
  const fragmentShaderStage = compileShader(gl, shaderCode, gl.FRAGMENT_SHADER);

  const shader = gl.createProgram();
  gl.attachShader(shader, vertexShaderStage);
  gl.attachShader(shader, fragmentShaderStage);
  gl.linkProgram(shader);
  if (!gl.getProgramParameter(shader, gl.LINK_STATUS)) {
    console.error(
      "An error occurred linking shader stages: " + gl.getProgramInfoLog(shader)
    );
  }

  return shader;

  function compileShader(gl, source, type) {
    const versionDefinition = "#version 300 es\n";
    const module = gl.createShader(type);
    if (type === gl.VERTEX_SHADER)
      source = versionDefinition + "#define VERTEX_SHADER\n" + source;
    else if (type === gl.FRAGMENT_SHADER)
      source = versionDefinition + "#define FRAGMENT_SHADER\n" + source;

    gl.shaderSource(module, source);
    gl.compileShader(module);
    if (!gl.getShaderParameter(module, gl.COMPILE_STATUS)) {
      console.error(
        "An error occurred compiling the shader module: " +
        gl.getShaderInfoLog(module)
      );
      gl.deleteShader(module);
      return null;
    }

    return module;
  }
}

/**
 * @param { WebGL2RenderingContext } gl
 * @param { WebGLTexture[] } [ textures ]
 * @param { WebGLRenderbuffer } [ depthTexture ]
 * @param { WebGLRenderbuffer } [ renderBuffer ]
 * @returns { WebGLFramebuffer }
 */
function createFrameBuffer(gl, textures, depthTexture, renderBuffer) {
  const frameBuffer = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuffer);

  textures?.forEach((texture, index) => {
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0 + index,
      gl.TEXTURE_2D,
      texture,
      0
    );
  });

  if (depthTexture) {
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.DEPTH_ATTACHMENT,
      gl.TEXTURE_2D,
      depthTexture,
      0
    );
  }

  if (renderBuffer) {
    gl.framebufferRenderbuffer(
      gl.FRAMEBUFFER,
      gl.DEPTH_STENCIL_ATTACHMENT,
      gl.RENDERBUFFER,
      renderBuffer
    );
  }

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
    console.error("Framebuffer is not complete");
  }

  return frameBuffer;
}

/**
 * @param { WebGL2RenderingContext } gl
 * @param { number } width
 * @param { number } height
 * @param { number } internalFormat
 * @param { number } format
 * @param { number } type
 * @param { ArrayBufferTypes | ImageBitmap } [ resource ]
 */
function createTexture2D(
  gl,
  width,
  height,
  internalFormat,
  format,
  type,
  resource,
  generateMips = false
) {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);

  // Set texture parameters
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(
    gl.TEXTURE_2D,
    gl.TEXTURE_MIN_FILTER,
    generateMips ? gl.LINEAR_MIPMAP_LINEAR : gl.NEAREST
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    internalFormat,
    width,
    height,
    0,
    format,
    type,
    resource ? resource : null
  );

  gl.bindTexture(gl.TEXTURE_2D, null);

  return texture;
}

/**
 * @param { WebGL2RenderingContext } gl
 * @param { number } xOffset
 * @param { number } yOffset
 * @param { number } internalFormat
 * @param { number } format
 * @param { number } type
 * @param { ArrayBufferTypes } array
 */
function setTexturePixel(gl, texture, xOffset, yOffset, format, type, data) {
  // Bind the texture
  gl.bindTexture(gl.TEXTURE_2D, texture);

  // Set texture parameters
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

  // Upload texture data
  gl.texSubImage2D(
    gl.TEXTURE_2D,
    0,
    xOffset,
    yOffset,
    1,
    1,
    format,
    type,
    data
  );

  // Unbind the texture
  gl.bindTexture(gl.TEXTURE_2D, null);
}

/**
 * @param { WebGL2RenderingContext } gl
 * @param { number } width
 * @param { number } height
 * @param { number } internalFormat
 * @param { number } format
 * @param { number } type
 * @param { ArrayBufferTypes } array
 */
function fillTexture2DByArray(
  gl,
  texture,
  width,
  height,
  internalFormat,
  format,
  type,
  array
) {
  // Bind the texture
  gl.bindTexture(gl.TEXTURE_2D, texture);

  // Set texture parameters
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

  // Upload texture data
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    internalFormat,
    width,
    height,
    0,
    format,
    type,
    array
  );

  // Unbind the texture
  gl.bindTexture(gl.TEXTURE_2D, null);
}

/**
 * @param { WebGL2RenderingContext } gl
 * @param { number } [ width ]
 * @param { number } [ height ]
 * @returns { WebGLRenderbuffer }
 */
function createRenderBuffer(gl, width, height) {
  const bufferWidth = width || gl.canvas.width * window.devicePixelRatio;
  const bufferHeight = height || gl.canvas.height * window.devicePixelRatio;

  const renderBuffer = gl.createRenderbuffer();
  gl.bindRenderbuffer(gl.RENDERBUFFER, renderBuffer);
  gl.renderbufferStorage(
    gl.RENDERBUFFER,
    gl.DEPTH_STENCIL,
    bufferWidth,
    bufferHeight
  );
  gl.bindRenderbuffer(gl.RENDERBUFFER, null);

  return renderBuffer;
}

// Helper function to get WebGL error messages
function getWebGLErrorMessage(gl, error) {
  switch (error) {
    case gl.NO_ERROR:
      return "NO_ERROR";
    case gl.INVALID_ENUM:
      return "INVALID_ENUM";
    case gl.INVALID_VALUE:
      return "INVALID_VALUE";
    case gl.INVALID_OPERATION:
      return "INVALID_OPERATION";
    case gl.OUT_OF_MEMORY:
      return "OUT_OF_MEMORY";
    case gl.CONTEXT_LOST_WEBGL:
      return "CONTEXT_LOST_WEBGL";
    default:
      return "UNKNOWN_ERROR";
  }
}

async function loadImage(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const blob = await response.blob();
    const imageBitmap = await createImageBitmap(blob, {
      imageOrientation: "flipY",
      premultiplyAlpha: "none",
      colorSpaceConversion: "default",
    });
    return imageBitmap;
  } catch (error) {
    console.error(`Error loading image (url: ${url})`, error);
    throw error;
  }
}
function getMaxMipLevel(width, height) {
  return Math.floor(Math.log2(Math.max(width, height)));
}
