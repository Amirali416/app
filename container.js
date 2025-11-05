class Container {
  static instances = []

  constructor({
    borderRadius = 48,
    type = 'rounded',
    tintOpacity = 0.2
  } = {}) {
    this.borderRadius = borderRadius
    this.type = type
    this.tintOpacity = tintOpacity
    this.children = []
    this.element = this.createDOMElement()
    this.initGlass()
    Container.instances.push(this)
  }

  createDOMElement() {
    const container = document.createElement('div')
    container.className = `glass-container glass-container-${this.type}`
    container.style.borderRadius = `${this.borderRadius}px`
    return container
  }

  initGlass() {
    const canvas = document.createElement('canvas')
    canvas.className = 'glass-canvas'
    this.element.appendChild(canvas)

    const tintOverlay = document.createElement('div')
    tintOverlay.className = 'glass-tint'
    tintOverlay.style.opacity = this.tintOpacity
    this.element.appendChild(tintOverlay)

    this.canvas = canvas
    this.tintOverlay = tintOverlay
    
    this.setupWebGL()
    this.setupResizeObserver()
  }

  setupWebGL() {
    const gl = this.canvas.getContext('webgl2')
    if (!gl) {
      console.error('WebGL 2.0 not supported')
      return
    }

    const vertexShaderSource = `#version 300 es
      in vec4 a_position;
      in vec2 a_texCoord;
      out vec2 v_texCoord;
      
      void main() {
        gl_Position = a_position;
        v_texCoord = a_texCoord;
      }
    `

    const fragmentShaderSource = `#version 300 es
      precision highp float;
      
      in vec2 v_texCoord;
      out vec4 outColor;
      
      uniform sampler2D u_texture;
      uniform vec2 u_resolution;
      uniform float u_borderRadius;
      uniform float u_edgeIntensity;
      uniform float u_rimIntensity;
      uniform float u_baseIntensity;
      uniform float u_blurRadius;
      uniform int u_shapeType;
      
      float sdRoundedBox(vec2 p, vec2 b, float r) {
        vec2 d = abs(p) - b + r;
        return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - r;
      }
      
      float sdCircle(vec2 p, float r) {
        return length(p) - r;
      }
      
      void main() {
        vec2 center = u_resolution * 0.5;
        vec2 pos = gl_FragCoord.xy - center;
        
        float dist = 0.0;
        if (u_shapeType == 0) {
          // Rounded rectangle
          dist = sdRoundedBox(pos, u_resolution * 0.5 - u_borderRadius, u_borderRadius);
        } else if (u_shapeType == 1) {
          // Circle
          dist = sdCircle(pos, min(u_resolution.x, u_resolution.y) * 0.5);
        } else {
          // Pill
          float radiusY = u_resolution.y * 0.5;
          dist = sdRoundedBox(pos, vec2(u_resolution.x * 0.5 - radiusY, 0.0), radiusY);
        }
        
        if (dist > 0.0) {
          discard;
        }
        
        // Gaussian blur sampling
        vec4 color = vec4(0.0);
        float totalWeight = 0.0;
        float blurSize = u_blurRadius / u_resolution.y;
        
        for (float x = -3.0; x <= 3.0; x += 1.0) {
          for (float y = -3.0; y <= 3.0; y += 1.0) {
            vec2 offset = vec2(x, y) * blurSize;
            float weight = exp(-(x*x + y*y) / (2.0 * 1.5 * 1.5));
            color += texture(u_texture, v_texCoord + offset) * weight;
            totalWeight += weight;
          }
        }
        color /= totalWeight;
        
        // Edge distortion
        float normalizedDist = abs(dist) / (u_borderRadius + 1.0);
        float edgeFactor = smoothstep(0.0, 0.2, normalizedDist);
        vec2 distortion = normalize(pos) * u_edgeIntensity * edgeFactor;
        
        vec4 refracted = texture(u_texture, v_texCoord + distortion / u_resolution);
        color = mix(color, refracted, edgeFactor);
        
        // Rim lighting
        float rimFactor = 1.0 - smoothstep(-2.0, 2.0, dist);
        color.rgb += vec3(1.0) * u_rimIntensity * rimFactor;
        
        outColor = color;
      }
    `

    const vertexShader = this.createShader(gl, gl.VERTEX_SHADER, vertexShaderSource)
    const fragmentShader = this.createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource)
    
    const program = gl.createProgram()
    gl.attachShader(program, vertexShader)
    gl.attachShader(program, fragmentShader)
    gl.linkProgram(program)

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('Program link failed:', gl.getProgramInfoLog(program))
      return
    }

    // Setup geometry
    const positions = new Float32Array([
      -1, -1, 0, 1,
       1, -1, 1, 1,
      -1,  1, 0, 0,
       1,  1, 1, 0
    ])

    const positionBuffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW)

    const positionLoc = gl.getAttribLocation(program, 'a_position')
    const texCoordLoc = gl.getAttribLocation(program, 'a_texCoord')

    const vao = gl.createVertexArray()
    gl.bindVertexArray(vao)
    
    gl.enableVertexAttribArray(positionLoc)
    gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 16, 0)
    
    gl.enableVertexAttribArray(texCoordLoc)
    gl.vertexAttribPointer(texCoordLoc, 2, gl.FLOAT, false, 16, 8)

    // Create texture
    const texture = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)

    this.gl_refs = {
      gl, program, vao, texture,
      resolutionLoc: gl.getUniformLocation(program, 'u_resolution'),
      borderRadiusLoc: gl.getUniformLocation(program, 'u_borderRadius'),
      edgeIntensityLoc: gl.getUniformLocation(program, 'u_edgeIntensity'),
      rimIntensityLoc: gl.getUniformLocation(program, 'u_rimIntensity'),
      baseIntensityLoc: gl.getUniformLocation(program, 'u_baseIntensity'),
      blurRadiusLoc: gl.getUniformLocation(program, 'u_blurRadius'),
      shapeTypeLoc: gl.getUniformLocation(program, 'u_shapeType')
    }

    this.captureBackground()
  }

  createShader(gl, type, source) {
    const shader = gl.createShader(type)
    gl.shaderSource(shader, source)
    gl.compileShader(shader)
    
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('Shader compile failed:', gl.getShaderInfoLog(shader))
      gl.deleteShader(shader)
      return null
    }
    
    return shader
  }

  async captureBackground() {
    if (!window.html2canvas) {
      setTimeout(() => this.captureBackground(), 100)
      return
    }

    try {
      const canvas = await html2canvas(document.body, {
        backgroundColor: null,
        scale: 0.5
      })

      const gl = this.gl_refs.gl
      gl.bindTexture(gl.TEXTURE_2D, this.gl_refs.texture)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas)
      
      this.render()
    } catch (e) {
      console.error('Background capture failed:', e)
    }
  }

  render() {
    if (!this.gl_refs || !this.gl_refs.gl) return

    const gl = this.gl_refs.gl
    const rect = this.canvas.getBoundingClientRect()
    
    this.canvas.width = rect.width
    this.canvas.height = rect.height
    
    gl.viewport(0, 0, rect.width, rect.height)
    gl.useProgram(this.gl_refs.program)
    gl.bindVertexArray(this.gl_refs.vao)
    
    gl.uniform2f(this.gl_refs.resolutionLoc, rect.width, rect.height)
    gl.uniform1f(this.gl_refs.borderRadiusLoc, this.borderRadius)
    gl.uniform1f(this.gl_refs.edgeIntensityLoc, window.glassControls?.edgeIntensity || 0.02)
    gl.uniform1f(this.gl_refs.rimIntensityLoc, window.glassControls?.rimIntensity || 0.08)
    gl.uniform1f(this.gl_refs.baseIntensityLoc, window.glassControls?.baseIntensity || 0.01)
    gl.uniform1f(this.gl_refs.blurRadiusLoc, window.glassControls?.blurRadius || 7.0)
    
    const shapeType = this.type === 'circle' ? 1 : this.type === 'pill' ? 2 : 0
    gl.uniform1i(this.gl_refs.shapeTypeLoc, shapeType)
    
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  }

  setupResizeObserver() {
    const observer = new ResizeObserver(() => {
      this.render()
    })
    observer.observe(this.element)
  }

  addChild(child) {
    this.children.push(child)
    if (child.element) {
      this.element.appendChild(child.element)
    } else {
      this.element.appendChild(child)
    }
  }

  removeChild(child) {
    const index = this.children.indexOf(child)
    if (index > -1) {
      this.children.splice(index, 1)
      if (child.element) {
        this.element.removeChild(child.element)
      } else {
        this.element.removeChild(child)
      }
    }
  }

  updateSizeFromDOM() {
    this.render()
  }
}

// Global glass controls
window.glassControls = {
  edgeIntensity: 0.02,
  rimIntensity: 0.08,
  baseIntensity: 0.01,
  blurRadius: 7.0,
  tintOpacity: 0.2
}
