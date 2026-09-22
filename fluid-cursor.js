/* ============================================================
   HOME PAGE - FLUID CURSOR
   ------------------------------------------------------------
   A real-time fluid simulation. The cursor injects velocity and
   pink dye into a velocity field; the field then advects, curls
   and dissipates on its own, so the light keeps flowing for a
   moment after the cursor stops.

   Each frame runs the standard "Stable Fluids" pipeline on the
   GPU: curl -> vorticity -> divergence -> pressure solve ->
   gradient subtract -> advect. Every step is a fragment shader
   drawn into a framebuffer.

   Only index.html carries the canvas, so this file is inert
   everywhere else.

   ------------------------------------------------------------
   The solver here is derived from Pavel Dobryakov's
   WebGL-Fluid-Simulation, retuned for a soft, dim palette on a
   dark page. Its licence follows, and must stay with this file.

   https://github.com/PavelDoGreat/WebGL-Fluid-Simulation

   MIT License

   Copyright (c) 2017 Pavel Dobryakov

   Permission is hereby granted, free of charge, to any person obtaining a copy
   of this software and associated documentation files (the "Software"), to deal
   in the Software without restriction, including without limitation the rights
   to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   copies of the Software, and to permit persons to whom the Software is
   furnished to do so, subject to the following conditions:

   The above copyright notice and this permission notice shall be included in all
   copies or substantial portions of the Software.

   THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
   SOFTWARE.
   ============================================================ */

(function () {
    "use strict";

    var canvas = document.getElementById("fluid-canvas");
    if (!canvas) return;

    /* No pointer to push the fluid with, or the visitor asked for
       less motion: leave the page completely alone. */
    if (window.matchMedia("(hover: none), (pointer: coarse)").matches ||
        window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        canvas.remove();
        return;
    }

    /* ---------- tuning ---------------------------------------
       The numbers that decide how the effect feels. Everything
       below this block is machinery. */
    var config = {
        SIM_RESOLUTION: 128,        /* velocity field detail */
        DYE_RESOLUTION: 640,        /* visible dye detail */
        DENSITY_DISSIPATION: 1.6,   /* higher = trail fades sooner */
        VELOCITY_DISSIPATION: 0.25, /* higher = flow calms sooner */
        PRESSURE: 0.8,
        PRESSURE_ITERATIONS: 18,
        CURL: 26,                   /* swirl strength */
        SPLAT_RADIUS: 0.22,
        SPLAT_FORCE: 5600,
        IDLE_SECONDS: 3.5           /* stop simulating once it has faded */
    };

    var pointer = { x: 0, y: 0, dx: 0, dy: 0, down: false, moved: false, color: { r: 0, g: 0, b: 0 } };

    /* ---------- context -------------------------------------- */

    var glCtx = getContext(canvas);
    if (!glCtx) return;                       /* no WebGL, no effect, no error */
    var gl = glCtx.gl;
    var ext = glCtx.ext;

    if (isMobileSized()) {
        config.DYE_RESOLUTION = 512;
        config.PRESSURE_ITERATIONS = 14;
    }

    function getContext(canvasEl) {
        var params = {
            alpha: true,
            depth: false,
            stencil: false,
            antialias: false,
            preserveDrawingBuffer: false,
            premultipliedAlpha: true
        };

        var context = canvasEl.getContext("webgl2", params);
        var isWebGL2 = !!context;
        if (!isWebGL2) {
            context = canvasEl.getContext("webgl", params) ||
                      canvasEl.getContext("experimental-webgl", params);
        }
        if (!context) return null;

        var halfFloat, supportLinearFiltering;
        if (isWebGL2) {
            context.getExtension("EXT_color_buffer_float");
            supportLinearFiltering = context.getExtension("OES_texture_float_linear");
        } else {
            halfFloat = context.getExtension("OES_texture_half_float");
            supportLinearFiltering = context.getExtension("OES_texture_half_float_linear");
        }

        context.clearColor(0.0, 0.0, 0.0, 0.0);

        var halfFloatTexType = isWebGL2 ? context.HALF_FLOAT : (halfFloat && halfFloat.HALF_FLOAT_OES);
        if (!halfFloatTexType) return null;

        var formatRGBA, formatRG, formatR;
        if (isWebGL2) {
            formatRGBA = getSupportedFormat(context, context.RGBA16F, context.RGBA, halfFloatTexType);
            formatRG = getSupportedFormat(context, context.RG16F, context.RG, halfFloatTexType);
            formatR = getSupportedFormat(context, context.R16F, context.RED, halfFloatTexType);
        } else {
            formatRGBA = getSupportedFormat(context, context.RGBA, context.RGBA, halfFloatTexType);
            formatRG = formatRGBA;
            formatR = formatRGBA;
        }
        if (!formatRGBA) return null;

        return {
            gl: context,
            ext: {
                formatRGBA: formatRGBA,
                formatRG: formatRG || formatRGBA,
                formatR: formatR || formatRGBA,
                halfFloatTexType: halfFloatTexType,
                supportLinearFiltering: supportLinearFiltering
            }
        };
    }

    /* Some drivers advertise a format but cannot render to it, so
       the only trustworthy check is to build one and ask. */
    function getSupportedFormat(context, internalFormat, format, type) {
        if (!supportRenderTextureFormat(context, internalFormat, format, type)) {
            if (!context.RG16F) return null;   /* WebGL1: nothing to fall back to */
            switch (internalFormat) {
                case context.R16F:  return getSupportedFormat(context, context.RG16F, context.RG, type);
                case context.RG16F: return getSupportedFormat(context, context.RGBA16F, context.RGBA, type);
                default: return null;
            }
        }
        return { internalFormat: internalFormat, format: format };
    }

    function supportRenderTextureFormat(context, internalFormat, format, type) {
        var texture = context.createTexture();
        context.bindTexture(context.TEXTURE_2D, texture);
        context.texParameteri(context.TEXTURE_2D, context.TEXTURE_MIN_FILTER, context.NEAREST);
        context.texParameteri(context.TEXTURE_2D, context.TEXTURE_MAG_FILTER, context.NEAREST);
        context.texParameteri(context.TEXTURE_2D, context.TEXTURE_WRAP_S, context.CLAMP_TO_EDGE);
        context.texParameteri(context.TEXTURE_2D, context.TEXTURE_WRAP_T, context.CLAMP_TO_EDGE);
        context.texImage2D(context.TEXTURE_2D, 0, internalFormat, 4, 4, 0, format, type, null);

        var fbo = context.createFramebuffer();
        context.bindFramebuffer(context.FRAMEBUFFER, fbo);
        context.framebufferTexture2D(context.FRAMEBUFFER, context.COLOR_ATTACHMENT0, context.TEXTURE_2D, texture, 0);
        var status = context.checkFramebufferStatus(context.FRAMEBUFFER);

        context.bindFramebuffer(context.FRAMEBUFFER, null);
        context.deleteFramebuffer(fbo);
        context.deleteTexture(texture);
        return status === context.FRAMEBUFFER_COMPLETE;
    }

    /* ---------- shader plumbing ------------------------------ */

    function compileShader(type, source) {
        var shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            console.warn("fluid-cursor shader:", gl.getShaderInfoLog(shader));
        }
        return shader;
    }

    function Program(vertexShader, fragmentShader) {
        this.program = gl.createProgram();
        gl.attachShader(this.program, vertexShader);
        gl.attachShader(this.program, fragmentShader);
        /* Pin the quad to location 0 so one shared buffer serves every pass. */
        gl.bindAttribLocation(this.program, 0, "aPosition");
        gl.linkProgram(this.program);
        if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
            console.warn("fluid-cursor link:", gl.getProgramInfoLog(this.program));
        }

        this.uniforms = {};
        var count = gl.getProgramParameter(this.program, gl.ACTIVE_UNIFORMS);
        for (var i = 0; i < count; i++) {
            var name = gl.getActiveUniform(this.program, i).name;
            this.uniforms[name] = gl.getUniformLocation(this.program, name);
        }
    }

    Program.prototype.bind = function () {
        gl.useProgram(this.program);
    };

    var baseVertexShader = compileShader(gl.VERTEX_SHADER, [
        "precision highp float;",
        "attribute vec2 aPosition;",
        "varying vec2 vUv;",
        "varying vec2 vL;",
        "varying vec2 vR;",
        "varying vec2 vT;",
        "varying vec2 vB;",
        "uniform vec2 texelSize;",
        "void main () {",
        "    vUv = aPosition * 0.5 + 0.5;",
        "    vL = vUv - vec2(texelSize.x, 0.0);",
        "    vR = vUv + vec2(texelSize.x, 0.0);",
        "    vT = vUv + vec2(0.0, texelSize.y);",
        "    vB = vUv - vec2(0.0, texelSize.y);",
        "    gl_Position = vec4(aPosition, 0.0, 1.0);",
        "}"
    ].join("\n"));

    var clearShader = compileShader(gl.FRAGMENT_SHADER, [
        "precision mediump float;",
        "precision mediump sampler2D;",
        "varying highp vec2 vUv;",
        "uniform sampler2D uTexture;",
        "uniform float value;",
        "void main () { gl_FragColor = value * texture2D(uTexture, vUv); }"
    ].join("\n"));

    /* Alpha carries the brightest channel, so bare areas of the
       canvas stay transparent and the page shows through. */
    var displayShader = compileShader(gl.FRAGMENT_SHADER, [
        "precision highp float;",
        "precision highp sampler2D;",
        "varying vec2 vUv;",
        "uniform sampler2D uTexture;",
        "void main () {",
        "    vec3 c = texture2D(uTexture, vUv).rgb;",
        "    float a = max(c.r, max(c.g, c.b));",
        "    gl_FragColor = vec4(c, a);",
        "}"
    ].join("\n"));

    /* A gaussian blob of colour and force stamped in at the cursor. */
    var splatShader = compileShader(gl.FRAGMENT_SHADER, [
        "precision highp float;",
        "precision highp sampler2D;",
        "varying vec2 vUv;",
        "uniform sampler2D uTarget;",
        "uniform float aspectRatio;",
        "uniform vec3 color;",
        "uniform vec2 point;",
        "uniform float radius;",
        "void main () {",
        "    vec2 p = vUv - point.xy;",
        "    p.x *= aspectRatio;",
        "    vec3 splat = exp(-dot(p, p) / radius) * color;",
        "    vec3 base = texture2D(uTarget, vUv).xyz;",
        "    gl_FragColor = vec4(base + splat, 1.0);",
        "}"
    ].join("\n"));

    /* Walk backwards along the velocity field and pick up whatever
       was there - this is what makes the dye flow. */
    var advectionShader = compileShader(gl.FRAGMENT_SHADER, [
        "precision highp float;",
        "precision highp sampler2D;",
        "varying vec2 vUv;",
        "uniform sampler2D uVelocity;",
        "uniform sampler2D uSource;",
        "uniform vec2 texelSize;",
        "uniform vec2 dyeTexelSize;",
        "uniform float dt;",
        "uniform float dissipation;",
        ext.supportLinearFiltering ? "" : "#define MANUAL_FILTERING",
        "vec4 bilerp (sampler2D sam, vec2 uv, vec2 tsize) {",
        "    vec2 st = uv / tsize - 0.5;",
        "    vec2 iuv = floor(st);",
        "    vec2 fuv = fract(st);",
        "    vec4 a = texture2D(sam, (iuv + vec2(0.5, 0.5)) * tsize);",
        "    vec4 b = texture2D(sam, (iuv + vec2(1.5, 0.5)) * tsize);",
        "    vec4 c = texture2D(sam, (iuv + vec2(0.5, 1.5)) * tsize);",
        "    vec4 d = texture2D(sam, (iuv + vec2(1.5, 1.5)) * tsize);",
        "    return mix(mix(a, b, fuv.x), mix(c, d, fuv.x), fuv.y);",
        "}",
        "void main () {",
        "#ifdef MANUAL_FILTERING",
        "    vec2 coord = vUv - dt * bilerp(uVelocity, vUv, texelSize).xy * texelSize;",
        "    vec4 result = bilerp(uSource, coord, dyeTexelSize);",
        "#else",
        "    vec2 coord = vUv - dt * texture2D(uVelocity, vUv).xy * texelSize;",
        "    vec4 result = texture2D(uSource, coord);",
        "#endif",
        "    float decay = 1.0 + dissipation * dt;",
        "    gl_FragColor = result / decay;",
        "}"
    ].join("\n"));

    var divergenceShader = compileShader(gl.FRAGMENT_SHADER, [
        "precision mediump float;",
        "precision mediump sampler2D;",
        "varying highp vec2 vUv;",
        "varying highp vec2 vL;",
        "varying highp vec2 vR;",
        "varying highp vec2 vT;",
        "varying highp vec2 vB;",
        "uniform sampler2D uVelocity;",
        "void main () {",
        "    float L = texture2D(uVelocity, vL).x;",
        "    float R = texture2D(uVelocity, vR).x;",
        "    float T = texture2D(uVelocity, vT).y;",
        "    float B = texture2D(uVelocity, vB).y;",
        "    vec2 C = texture2D(uVelocity, vUv).xy;",
        "    if (vL.x < 0.0) { L = -C.x; }",
        "    if (vR.x > 1.0) { R = -C.x; }",
        "    if (vT.y > 1.0) { T = -C.y; }",
        "    if (vB.y < 0.0) { B = -C.y; }",
        "    float div = 0.5 * (R - L + T - B);",
        "    gl_FragColor = vec4(div, 0.0, 0.0, 1.0);",
        "}"
    ].join("\n"));

    var curlShader = compileShader(gl.FRAGMENT_SHADER, [
        "precision mediump float;",
        "precision mediump sampler2D;",
        "varying highp vec2 vUv;",
        "varying highp vec2 vL;",
        "varying highp vec2 vR;",
        "varying highp vec2 vT;",
        "varying highp vec2 vB;",
        "uniform sampler2D uVelocity;",
        "void main () {",
        "    float L = texture2D(uVelocity, vL).y;",
        "    float R = texture2D(uVelocity, vR).y;",
        "    float T = texture2D(uVelocity, vT).x;",
        "    float B = texture2D(uVelocity, vB).x;",
        "    float vorticity = R - L - T + B;",
        "    gl_FragColor = vec4(0.5 * vorticity, 0.0, 0.0, 1.0);",
        "}"
    ].join("\n"));

    /* Feeds the small curls back into the velocity field, which is
       what stops the flow collapsing into a dull blur. */
    var vorticityShader = compileShader(gl.FRAGMENT_SHADER, [
        "precision highp float;",
        "precision highp sampler2D;",
        "varying vec2 vUv;",
        "varying vec2 vL;",
        "varying vec2 vR;",
        "varying vec2 vT;",
        "varying vec2 vB;",
        "uniform sampler2D uVelocity;",
        "uniform sampler2D uCurl;",
        "uniform float curl;",
        "uniform float dt;",
        "void main () {",
        "    float L = texture2D(uCurl, vL).x;",
        "    float R = texture2D(uCurl, vR).x;",
        "    float T = texture2D(uCurl, vT).x;",
        "    float B = texture2D(uCurl, vB).x;",
        "    float C = texture2D(uCurl, vUv).x;",
        "    vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));",
        "    force /= length(force) + 0.0001;",
        "    force *= curl * C;",
        "    force.y *= -1.0;",
        "    vec2 velocity = texture2D(uVelocity, vUv).xy;",
        "    velocity += force * dt;",
        "    velocity = min(max(velocity, -1000.0), 1000.0);",
        "    gl_FragColor = vec4(velocity, 0.0, 1.0);",
        "}"
    ].join("\n"));

    /* One Jacobi iteration of the pressure solve. */
    var pressureShader = compileShader(gl.FRAGMENT_SHADER, [
        "precision mediump float;",
        "precision mediump sampler2D;",
        "varying highp vec2 vUv;",
        "varying highp vec2 vL;",
        "varying highp vec2 vR;",
        "varying highp vec2 vT;",
        "varying highp vec2 vB;",
        "uniform sampler2D uPressure;",
        "uniform sampler2D uDivergence;",
        "void main () {",
        "    float L = texture2D(uPressure, vL).x;",
        "    float R = texture2D(uPressure, vR).x;",
        "    float T = texture2D(uPressure, vT).x;",
        "    float B = texture2D(uPressure, vB).x;",
        "    float divergence = texture2D(uDivergence, vUv).x;",
        "    float pressure = (L + R + B + T - divergence) * 0.25;",
        "    gl_FragColor = vec4(pressure, 0.0, 0.0, 1.0);",
        "}"
    ].join("\n"));

    /* Subtracting the pressure gradient is what makes the field
       incompressible, and incompressible is what reads as liquid. */
    var gradientSubtractShader = compileShader(gl.FRAGMENT_SHADER, [
        "precision mediump float;",
        "precision mediump sampler2D;",
        "varying highp vec2 vUv;",
        "varying highp vec2 vL;",
        "varying highp vec2 vR;",
        "varying highp vec2 vT;",
        "varying highp vec2 vB;",
        "uniform sampler2D uPressure;",
        "uniform sampler2D uVelocity;",
        "void main () {",
        "    float L = texture2D(uPressure, vL).x;",
        "    float R = texture2D(uPressure, vR).x;",
        "    float T = texture2D(uPressure, vT).x;",
        "    float B = texture2D(uPressure, vB).x;",
        "    vec2 velocity = texture2D(uVelocity, vUv).xy;",
        "    velocity.xy -= vec2(R - L, T - B);",
        "    gl_FragColor = vec4(velocity, 0.0, 1.0);",
        "}"
    ].join("\n"));

    var clearProgram = new Program(baseVertexShader, clearShader);
    var splatProgram = new Program(baseVertexShader, splatShader);
    var advectionProgram = new Program(baseVertexShader, advectionShader);
    var divergenceProgram = new Program(baseVertexShader, divergenceShader);
    var curlProgram = new Program(baseVertexShader, curlShader);
    var vorticityProgram = new Program(baseVertexShader, vorticityShader);
    var pressureProgram = new Program(baseVertexShader, pressureShader);
    var gradienSubtractProgram = new Program(baseVertexShader, gradientSubtractShader);
    var displayProgram = new Program(baseVertexShader, displayShader);

    /* ---------- the fullscreen quad every pass draws ---------- */

    var blit = (function () {
        var buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW);
        var elements = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, elements);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(0);

        return function (target) {
            if (target == null) {
                gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
                gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            } else {
                gl.viewport(0, 0, target.width, target.height);
                gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
            }
            gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
        };
    })();

    /* ---------- framebuffers --------------------------------- */

    var dye, velocity, divergence, curl, pressure;

    function createFBO(w, h, internalFormat, format, type, param) {
        gl.activeTexture(gl.TEXTURE0);
        var texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, param);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, param);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, format, type, null);

        var fbo = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
        gl.viewport(0, 0, w, h);
        gl.clear(gl.COLOR_BUFFER_BIT);

        return {
            texture: texture,
            fbo: fbo,
            width: w,
            height: h,
            texelSizeX: 1.0 / w,
            texelSizeY: 1.0 / h,
            attach: function (id) {
                gl.activeTexture(gl.TEXTURE0 + id);
                gl.bindTexture(gl.TEXTURE_2D, texture);
                return id;
            }
        };
    }

    /* Most passes read a field and write the same field, which a
       single buffer cannot do - hence read/write pairs. */
    function createDoubleFBO(w, h, internalFormat, format, type, param) {
        return {
            read: createFBO(w, h, internalFormat, format, type, param),
            write: createFBO(w, h, internalFormat, format, type, param),
            width: w,
            height: h,
            texelSizeX: 1.0 / w,
            texelSizeY: 1.0 / h,
            swap: function () {
                var temp = this.read;
                this.read = this.write;
                this.write = temp;
            }
        };
    }

    /* Resizing recreates every buffer, so the old ones have to go
       back explicitly - GPU textures are not reachable by the JS
       garbage collector, and a few drags of a window corner would
       otherwise strand tens of megabytes of video memory. */
    function disposeFramebuffers() {
        [dye, velocity, pressure].forEach(function (pair) {
            if (!pair) return;
            [pair.read, pair.write].forEach(deleteFBO);
        });
        deleteFBO(divergence);
        deleteFBO(curl);
    }

    function deleteFBO(target) {
        if (!target) return;
        gl.deleteTexture(target.texture);
        gl.deleteFramebuffer(target.fbo);
    }

    function initFramebuffers() {
        disposeFramebuffers();

        var simRes = getResolution(config.SIM_RESOLUTION);
        var dyeRes = getResolution(config.DYE_RESOLUTION);
        var texType = ext.halfFloatTexType;
        var rgba = ext.formatRGBA;
        var rg = ext.formatRG;
        var r = ext.formatR;
        var filtering = ext.supportLinearFiltering ? gl.LINEAR : gl.NEAREST;

        gl.disable(gl.BLEND);

        dye = createDoubleFBO(dyeRes.width, dyeRes.height, rgba.internalFormat, rgba.format, texType, filtering);
        velocity = createDoubleFBO(simRes.width, simRes.height, rg.internalFormat, rg.format, texType, filtering);
        divergence = createFBO(simRes.width, simRes.height, r.internalFormat, r.format, texType, gl.NEAREST);
        curl = createFBO(simRes.width, simRes.height, r.internalFormat, r.format, texType, gl.NEAREST);
        pressure = createDoubleFBO(simRes.width, simRes.height, r.internalFormat, r.format, texType, gl.NEAREST);
    }

    function getResolution(resolution) {
        var aspectRatio = gl.drawingBufferWidth / gl.drawingBufferHeight;
        if (aspectRatio < 1) aspectRatio = 1.0 / aspectRatio;
        var min = Math.round(resolution);
        var max = Math.round(resolution * aspectRatio);
        if (gl.drawingBufferWidth > gl.drawingBufferHeight) {
            return { width: max, height: min };
        }
        return { width: min, height: max };
    }

    function isMobileSized() {
        return window.innerWidth < 900;
    }

    function resizeCanvas() {
        /* Capping the pixel ratio matters: this is a per-pixel
           simulation, and a 3x retina buffer costs 9x the work. */
        var ratio = Math.min(window.devicePixelRatio || 1, 2);
        var width = Math.floor(canvas.clientWidth * ratio);
        var height = Math.floor(canvas.clientHeight * ratio);
        if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
            return true;
        }
        return false;
    }

    /* ---------- the simulation step -------------------------- */

    function step(dt) {
        gl.disable(gl.BLEND);

        curlProgram.bind();
        gl.uniform2f(curlProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
        gl.uniform1i(curlProgram.uniforms.uVelocity, velocity.read.attach(0));
        blit(curl);

        vorticityProgram.bind();
        gl.uniform2f(vorticityProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
        gl.uniform1i(vorticityProgram.uniforms.uVelocity, velocity.read.attach(0));
        gl.uniform1i(vorticityProgram.uniforms.uCurl, curl.attach(1));
        gl.uniform1f(vorticityProgram.uniforms.curl, config.CURL);
        gl.uniform1f(vorticityProgram.uniforms.dt, dt);
        blit(velocity.write);
        velocity.swap();

        divergenceProgram.bind();
        gl.uniform2f(divergenceProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
        gl.uniform1i(divergenceProgram.uniforms.uVelocity, velocity.read.attach(0));
        blit(divergence);

        /* Fade the previous pressure rather than zeroing it: a warm
           start makes the few Jacobi passes below go further. */
        clearProgram.bind();
        gl.uniform1i(clearProgram.uniforms.uTexture, pressure.read.attach(0));
        gl.uniform1f(clearProgram.uniforms.value, config.PRESSURE);
        blit(pressure.write);
        pressure.swap();

        pressureProgram.bind();
        gl.uniform2f(pressureProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
        gl.uniform1i(pressureProgram.uniforms.uDivergence, divergence.attach(0));
        for (var i = 0; i < config.PRESSURE_ITERATIONS; i++) {
            gl.uniform1i(pressureProgram.uniforms.uPressure, pressure.read.attach(1));
            blit(pressure.write);
            pressure.swap();
        }

        gradienSubtractProgram.bind();
        gl.uniform2f(gradienSubtractProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
        gl.uniform1i(gradienSubtractProgram.uniforms.uPressure, pressure.read.attach(0));
        gl.uniform1i(gradienSubtractProgram.uniforms.uVelocity, velocity.read.attach(1));
        blit(velocity.write);
        velocity.swap();

        advectionProgram.bind();
        gl.uniform2f(advectionProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
        if (!ext.supportLinearFiltering) {
            gl.uniform2f(advectionProgram.uniforms.dyeTexelSize, velocity.texelSizeX, velocity.texelSizeY);
        }
        var velocityId = velocity.read.attach(0);
        gl.uniform1i(advectionProgram.uniforms.uVelocity, velocityId);
        gl.uniform1i(advectionProgram.uniforms.uSource, velocityId);
        gl.uniform1f(advectionProgram.uniforms.dt, dt);
        gl.uniform1f(advectionProgram.uniforms.dissipation, config.VELOCITY_DISSIPATION);
        blit(velocity.write);
        velocity.swap();

        if (!ext.supportLinearFiltering) {
            gl.uniform2f(advectionProgram.uniforms.dyeTexelSize, dye.texelSizeX, dye.texelSizeY);
        }
        gl.uniform1i(advectionProgram.uniforms.uVelocity, velocity.read.attach(0));
        gl.uniform1i(advectionProgram.uniforms.uSource, dye.read.attach(1));
        gl.uniform1f(advectionProgram.uniforms.dissipation, config.DENSITY_DISSIPATION);
        blit(dye.write);
        dye.swap();
    }

    function render() {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
        gl.clear(gl.COLOR_BUFFER_BIT);

        displayProgram.bind();
        gl.uniform1i(displayProgram.uniforms.uTexture, dye.read.attach(0));
        blit(null);
    }

    /* ---------- cursor input --------------------------------- */

    function splat(x, y, dx, dy, color) {
        splatProgram.bind();
        gl.uniform1i(splatProgram.uniforms.uTarget, velocity.read.attach(0));
        gl.uniform1f(splatProgram.uniforms.aspectRatio, canvas.width / canvas.height);
        gl.uniform2f(splatProgram.uniforms.point, x, y);
        gl.uniform3f(splatProgram.uniforms.color, dx, dy, 0.0);
        gl.uniform1f(splatProgram.uniforms.radius, correctRadius(config.SPLAT_RADIUS / 100.0));
        blit(velocity.write);
        velocity.swap();

        gl.uniform1i(splatProgram.uniforms.uTarget, dye.read.attach(0));
        gl.uniform3f(splatProgram.uniforms.color, color.r, color.g, color.b);
        blit(dye.write);
        dye.swap();
    }

    /* Keeps the blob round on wide screens instead of stretching it. */
    function correctRadius(radius) {
        var aspectRatio = canvas.width / canvas.height;
        if (aspectRatio > 1) return radius * aspectRatio;
        return radius;
    }

    /* Soft designer pink, with just enough hue drift that repeated
       passes over the same spot do not look flat. Saturation is well
       under the amber it replaced: pink only reads as pink when it
       carries some white, otherwise it turns into neon magenta. */
    function dyeColor() {
        var hue = 0.895 + Math.random() * 0.045;      /* roughly 322deg to 338deg */
        var c = HSVtoRGB(hue, 0.62, 1.0);
        c.r *= 0.11;
        c.g *= 0.11;
        c.b *= 0.11;
        return c;
    }

    function HSVtoRGB(h, s, v) {
        var i = Math.floor(h * 6);
        var f = h * 6 - i;
        var p = v * (1 - s);
        var q = v * (1 - f * s);
        var t = v * (1 - (1 - f) * s);
        var r, g, b;
        switch (i % 6) {
            case 0: r = v; g = t; b = p; break;
            case 1: r = q; g = v; b = p; break;
            case 2: r = p; g = v; b = t; break;
            case 3: r = p; g = q; b = v; break;
            case 4: r = t; g = p; b = v; break;
            default: r = v; g = p; b = q; break;
        }
        return { r: r, g: g, b: b };
    }

    var lastInputTime = 0;
    var running = false;
    var lastFrameTime = Date.now();

    window.addEventListener("mousemove", function (event) {
        /* The canvas is fixed to the whole viewport, so viewport
           coords are the canvas coords - no getBoundingClientRect
           per event, which would force layout on every mouse move. */
        var x = event.clientX / window.innerWidth;
        var y = 1.0 - event.clientY / window.innerHeight;   /* GL's origin is bottom-left */

        if (!pointer.moved) {
            /* First sighting: seed the position so the opening splat
               is not a shove from the corner of the screen. */
            pointer.x = x;
            pointer.y = y;
            pointer.moved = true;
        }

        pointer.dx = (x - pointer.x) * config.SPLAT_FORCE;
        pointer.dy = (y - pointer.y) * config.SPLAT_FORCE;
        pointer.x = x;
        pointer.y = y;
        pointer.color = dyeColor();

        if (Math.abs(pointer.dx) > 0 || Math.abs(pointer.dy) > 0) {
            splat(pointer.x, pointer.y, pointer.dx, pointer.dy, pointer.color);
        }

        lastInputTime = Date.now();
        start();
    }, { passive: true });

    /* ---------- the loop ------------------------------------- */

    function frame() {
        if (!running) return;

        var now = Date.now();
        var dt = Math.min((now - lastFrameTime) / 1000, 0.016666);
        lastFrameTime = now;

        if (resizeCanvas()) initFramebuffers();
        step(dt);
        render();

        /* The whole point of stopping: an idle fluid sim would keep
           a laptop GPU busy for nothing. Once the dye has had time
           to dissipate, park the loop until the mouse moves again. */
        if (now - lastInputTime > config.IDLE_SECONDS * 1000) {
            running = false;
            return;
        }
        requestAnimationFrame(frame);
    }

    function start() {
        if (running || document.hidden) return;
        running = true;
        lastFrameTime = Date.now();
        requestAnimationFrame(frame);
    }

    document.addEventListener("visibilitychange", function () {
        if (document.hidden) {
            running = false;
        } else {
            lastInputTime = Date.now();
            start();
        }
    });

    resizeCanvas();
    initFramebuffers();
    render();
})();
