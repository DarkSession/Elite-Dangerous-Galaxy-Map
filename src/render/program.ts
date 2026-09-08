// Shader compilation and uniform lookup.

/** The error a failed compile or link throws. */
export class ShaderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ShaderError';
  }
}

/** A linked program with its uniform locations already read. */
export interface Program {
  readonly program: WebGLProgram;
  readonly uniforms: Readonly<Record<string, WebGLUniformLocation | null>>;
}

function compile(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
  name: string,
): WebGLShader {
  const shader = gl.createShader(type);
  if (shader === null) throw new ShaderError(`The context gave no shader for ${name}.`);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS) !== true) {
    const log = gl.getShaderInfoLog(shader) ?? 'no log';
    gl.deleteShader(shader);
    throw new ShaderError(`The shader ${name} did not compile: ${log}`);
  }
  return shader;
}

/** Compiles and links one program and reads the uniform locations it names. */
export function createProgram(
  gl: WebGL2RenderingContext,
  name: string,
  vertexSource: string,
  fragmentSource: string,
  uniformNames: readonly string[] = [],
): Program {
  const vertex = compile(gl, gl.VERTEX_SHADER, vertexSource, `${name}.vert`);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentSource, `${name}.frag`);
  const program = gl.createProgram();
  if (program === null)
    throw new ShaderError(`The context gave no program for ${name}.`);
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (gl.getProgramParameter(program, gl.LINK_STATUS) !== true) {
    const log = gl.getProgramInfoLog(program) ?? 'no log';
    gl.deleteProgram(program);
    throw new ShaderError(`The program ${name} did not link: ${log}`);
  }

  const uniforms: Record<string, WebGLUniformLocation | null> = {};
  for (const uniform of uniformNames) {
    uniforms[uniform] = gl.getUniformLocation(program, uniform);
  }
  return { program, uniforms };
}
