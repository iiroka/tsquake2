/*
 * Copyright (C) 1997-2001 Id Software, Inc.
 * Copyright (C) 2016-2017 Daniel Gibson
 *
 * This program is free software; you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation; either version 2 of the License, or (at
 * your option) any later version.
 *
 * This program is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 *
 * See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program; if not, write to the Free Software
 * Foundation, Inc., 59 Temple Place - Suite 330, Boston, MA
 * 02111-1307, USA.
 *
 * =======================================================================
 *
 * OpenGL3 refresher: Handling shaders
 *
 * =======================================================================
 */

import * as MAIN from "./webgl_main"
import { Com_Printf } from "../../common/clientserver";

function CompileShader(gl: WebGL2RenderingContext, shaderType: GLenum, shaderSrc: string, shaderSrc2: string | null): WebGLShader | null {
	let shader = gl.createShader(shaderType);
    if (shader == null) {
        return null
    }

	// const char* sources[2] = { shaderSrc, shaderSrc2 };
	// int numSources = shaderSrc2 != NULL ? 2 : 1;
    let source = shaderSrc
    if (shaderSrc2 != null)
        source += shaderSrc2

    gl.shaderSource(shader, source)
	gl.compileShader(shader)
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        let info = gl.getShaderInfoLog(shader)

		let shaderTypeStr = "";
		switch(shaderType)
		{
			case gl.VERTEX_SHADER:   shaderTypeStr = "Vertex"; break;
			case gl.FRAGMENT_SHADER: shaderTypeStr = "Fragment"; break;
			// case gl.GEOMETRY_SHADER: shaderTypeStr = "Geometry"; break;
		}
		Com_Printf(`ERROR: Compiling ${shaderTypeStr} Shader failed: ${info}\n`);
		gl.deleteShader(shader);

		return null
	}

	return shader;
}

function CreateShaderProgram(gl: WebGL2RenderingContext, shaders: WebGLShader[]): WebGLProgram | null
{
	// int i=0;
	let shaderProgram = gl.createProgram();
	if(shaderProgram == null) {
		Com_Printf("ERROR: Couldn't create a new Shader Program!\n");
		return null;
	}

	for (let sh of shaders) {
		gl.attachShader(shaderProgram, sh);
	}

	// make sure all shaders use the same attribute locations for common attributes
	// (so the same VAO can easily be used with different shaders)
	gl.bindAttribLocation(shaderProgram, MAIN.GL3_ATTRIB_POSITION, "position");
	gl.bindAttribLocation(shaderProgram, MAIN.GL3_ATTRIB_TEXCOORD, "texCoord");
	gl.bindAttribLocation(shaderProgram, MAIN.GL3_ATTRIB_LMTEXCOORD, "lmTexCoord");
	gl.bindAttribLocation(shaderProgram, MAIN.GL3_ATTRIB_COLOR, "vertColor");
	gl.bindAttribLocation(shaderProgram, MAIN.GL3_ATTRIB_NORMAL, "normal");
	gl.bindAttribLocation(shaderProgram, MAIN.GL3_ATTRIB_LIGHTFLAGS, "lightFlags");

	// the following line is not necessary/implicit (as there's only one output)
	// glBindFragDataLocation(shaderProgram, 0, "outColor"); XXX would this even be here?

	gl.linkProgram(shaderProgram);

    if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {

		let bufPtr = gl.getProgramInfoLog(shaderProgram)
		Com_Printf(`ERROR: Linking shader program failed: ${bufPtr}\n`);

		gl.deleteProgram(shaderProgram);

		return null
	}

	// for(i=0; i<numShaders; ++i)
	// {
	// 	// after linking, they don't need to be attached anymore.
	// 	// no idea  why they even are, if they don't have to..
	// 	glDetachShader(shaderProgram, shaders[i]);
	// }

	return shaderProgram;
}

// ############## shaders for 2D rendering (HUD, menus, console, videos, ..) #####################

const vertexSrc2D = `#version 300 es

in vec2 position; // GL3_ATTRIB_POSITION
in vec2 texCoord; // GL3_ATTRIB_TEXCOORD

// for UBO shared between 2D shaders
layout (std140) uniform uni2D
{
    mat4 trans;
};

out vec2 passTexCoord;

void main()
{
    gl_Position = trans * vec4(position, 0.0, 1.0);
    passTexCoord = texCoord;
}
`

const fragmentSrc2D = `#version 300 es
precision highp float;

in vec2 passTexCoord;

// for UBO shared between all shaders (incl. 2D)
layout (std140) uniform uniCommon
{
    float gamma;
    float intensity;
    float intensity2D; // for HUD, menu etc

    vec4 color;
};

uniform sampler2D tex;

out vec4 outColor;

void main()
{
    vec4 texel = texture(tex, passTexCoord);
    // the gl1 renderer used glAlphaFunc(GL_GREATER, 0.666);
    // and glEnable(GL_ALPHA_TEST); for 2D rendering
    // this should do the same
    if(texel.a <= 0.666)
        discard;

    // apply gamma correction and intensity
    texel.rgb *= intensity2D;
    outColor.rgb = pow(texel.rgb, vec3(gamma));
    outColor.a = texel.a; // I think alpha shouldn't be modified by gamma and intensity
}
`

// 2D color only rendering, GL3_Draw_Fill(), GL3_Draw_FadeScreen()
const vertexSrc2Dcolor = `#version 300 es

in vec2 position; // GL3_ATTRIB_POSITION

// for UBO shared between 2D shaders
layout (std140) uniform uni2D
{
    mat4 trans;
};

void main()
{
    gl_Position = trans * vec4(position, 0.0, 1.0);
}
`

const fragmentSrc2Dcolor = `#version 300 es
precision highp float;

// for UBO shared between all shaders (incl. 2D)
layout (std140) uniform uniCommon
{
    float gamma;
    float intensity;
    float intensity2D; // for HUD, menus etc

    vec4 color;
};

out vec4 outColor;

void main()
{
    vec3 col = color.rgb * intensity2D;
    outColor.rgb = pow(col, vec3(gamma));
    outColor.a = color.a;
}
`

// ############## shaders for 3D rendering #####################

const vertexCommon3D = `#version 300 es

in vec3 position;   // GL3_ATTRIB_POSITION
in vec2 texCoord;   // GL3_ATTRIB_TEXCOORD
in vec2 lmTexCoord; // GL3_ATTRIB_LMTEXCOORD
in vec4 vertColor;  // GL3_ATTRIB_COLOR
in vec3 normal;     // GL3_ATTRIB_NORMAL
in uint lightFlags; // GL3_ATTRIB_LIGHTFLAGS

out vec2 passTexCoord;

// for UBO shared between all 3D shaders
layout (std140) uniform uni3D
{
    mat4 transProj;
    mat4 transView;
    mat4 transModel;

    float scroll; // for SURF_FLOWING
    float time;
    float alpha;
    float overbrightbits;
    float particleFadeFactor;
    float _pad_1; // AMDs legacy windows driver needs this, otherwise uni3D has wrong size
    float _pad_2;
    float _pad_3;
};
`

const fragmentCommon3D = `#version 300 es
precision highp float;

in vec2 passTexCoord;

out vec4 outColor;

// for UBO shared between all shaders (incl. 2D)
layout (std140) uniform uniCommon
{
    float gamma; // this is 1.0/vid_gamma
    float intensity;
    float intensity2D; // for HUD, menus etc

    vec4 color; // really?

};
// for UBO shared between all 3D shaders
layout (std140) uniform uni3D
{
    mat4 transProj;
    mat4 transView;
    mat4 transModel;

    float scroll; // for SURF_FLOWING
    float time;
    float alpha;
    float overbrightbits;
    float particleFadeFactor;
    float _pad_1; // AMDs legacy windows driver needs this, otherwise uni3D has wrong size
    float _pad_2;
    float _pad_3;
};
`

const vertexSrc3D = `

// it gets attributes and uniforms from vertexCommon3D

void main()
{
    passTexCoord = texCoord;
    gl_Position = transProj * transView * transModel * vec4(position, 1.0);
}
`

const vertexSrc3Dflow = `

// it gets attributes and uniforms from vertexCommon3D

void main()
{
    passTexCoord = texCoord + vec2(scroll, 0);
    gl_Position = transProj * transView * transModel * vec4(position, 1.0);
}
`

const vertexSrc3Dlm = `

// it gets attributes and uniforms from vertexCommon3D

out vec2 passLMcoord;
out vec3 passWorldCoord;
out vec3 passNormal;
flat out uint passLightFlags;

void main()
{
    passTexCoord = texCoord;
    passLMcoord = lmTexCoord;
    vec4 worldCoord = transModel * vec4(position, 1.0);
    passWorldCoord = worldCoord.xyz;
    vec4 worldNormal = transModel * vec4(normal, 0.0f);
    passNormal = normalize(worldNormal.xyz);
    passLightFlags = lightFlags;

    gl_Position = transProj * transView * worldCoord;
}
`

const vertexSrc3DlmFlow = `

// it gets attributes and uniforms from vertexCommon3D

out vec2 passLMcoord;
out vec3 passWorldCoord;
out vec3 passNormal;
flat out uint passLightFlags;

void main()
{
    passTexCoord = texCoord + vec2(scroll, 0);
    passLMcoord = lmTexCoord;
    vec4 worldCoord = transModel * vec4(position, 1.0);
    passWorldCoord = worldCoord.xyz;
    vec4 worldNormal = transModel * vec4(normal, 0.0f);
    passNormal = normalize(worldNormal.xyz);
    passLightFlags = lightFlags;

    gl_Position = transProj * transView * worldCoord;
}
`

const fragmentSrc3D = `

// it gets attributes and uniforms from fragmentCommon3D

uniform sampler2D tex;

void main()
{
    vec4 texel = texture(tex, passTexCoord);

    // apply intensity and gamma
    texel.rgb *= intensity;
    outColor.rgb = pow(texel.rgb, vec3(gamma));
    outColor.a = texel.a*alpha; // I think alpha shouldn't be modified by gamma and intensity
}
`

const fragmentSrc3Dwater = `

// it gets attributes and uniforms from fragmentCommon3D

uniform sampler2D tex;

void main()
{
    vec2 tc = passTexCoord;
    tc.s += sin( passTexCoord.t*0.125 + time ) * 4.0;
    tc.s += scroll;
    tc.t += sin( passTexCoord.s*0.125 + time ) * 4.0;
    tc *= 1.0/64.0; // do this last

    vec4 texel = texture(tex, tc);

    // apply intensity and gamma
    texel.rgb *= intensity*0.5;
    outColor.rgb = pow(texel.rgb, vec3(gamma));
    outColor.a = texel.a*alpha; // I think alpha shouldn't be modified by gamma and intensity
}
`

const fragmentSrc3Dlm = `

// it gets attributes and uniforms from fragmentCommon3D

struct DynLight { // gl3UniDynLight in C
    vec3 lightOrigin;
    float _pad;
    //vec3 lightColor;
    //float lightIntensity;
    vec4 lightColor; // .a is intensity; this way it also works on OSX...
    // (otherwise lightIntensity always contained 1 there)
};

layout (std140) uniform uniLights
{
    DynLight dynLights[32];
    uint numDynLights;
    uint _pad1; uint _pad2; uint _pad3; // FFS, AMD!
};

uniform sampler2D tex;

uniform sampler2D lightmap0;
uniform sampler2D lightmap1;
uniform sampler2D lightmap2;
uniform sampler2D lightmap3;

uniform vec4 lmScales[4];

in vec2 passLMcoord;
in vec3 passWorldCoord;
in vec3 passNormal;
flat in uint passLightFlags;

void main()
{
    vec4 texel = texture(tex, passTexCoord);

    // apply intensity
    texel.rgb *= intensity;

    // apply lightmap
    vec4 lmTex = texture(lightmap0, passLMcoord) * lmScales[0];
    lmTex     += texture(lightmap1, passLMcoord) * lmScales[1];
    lmTex     += texture(lightmap2, passLMcoord) * lmScales[2];
    lmTex     += texture(lightmap3, passLMcoord) * lmScales[3];

    if(passLightFlags != 0u)
    {
        // TODO: or is hardcoding 32 better?
        for(uint i=0u; i<numDynLights; ++i)
        {
            // I made the following up, it's probably not too cool..
            // it basically checks if the light is on the right side of the surface
            // and, if it is, sets intensity according to distance between light and pixel on surface

            // dyn light number i does not affect this plane, just skip it
            if((passLightFlags & (1u << i)) == 0u)  continue;

            float intens = dynLights[i].lightColor.a;

            vec3 lightToPos = dynLights[i].lightOrigin - passWorldCoord;
            float distLightToPos = length(lightToPos);
            float fact = max(0.0, intens - distLightToPos - 52.0);

            // move the light source a bit further above the surface
            // => helps if the lightsource is so close to the surface (e.g. grenades, rockets)
            //    that the dot product below would return 0
            // (light sources that are below the surface are filtered out by lightFlags)
            lightToPos += passNormal*32.0;

            // also factor in angle between light and point on surface
            fact *= max(0.0, dot(passNormal, normalize(lightToPos)));


            lmTex.rgb += dynLights[i].lightColor.rgb * fact * (1.0/256.0);
        }
    }

    lmTex.rgb *= overbrightbits;
    outColor = lmTex*texel;
    outColor.rgb = pow(outColor.rgb, vec3(gamma)); // apply gamma correction to result

    outColor.a = 1.0; // lightmaps aren't used with translucent surfaces
}
`

const fragmentSrc3Dcolor = `

// it gets attributes and uniforms from fragmentCommon3D

void main()
{
    vec4 texel = color;

    // apply gamma correction and intensity
    // texel.rgb *= intensity; TODO: use intensity here? (this is used for beams)
    outColor.rgb = pow(texel.rgb, vec3(gamma));
    outColor.a = texel.a*alpha; // I think alpha shouldn't be modified by gamma and intensity
}
`

const fragmentSrc3Dsky = `

// it gets attributes and uniforms from fragmentCommon3D

uniform sampler2D tex;

void main()
{
    vec4 texel = texture(tex, passTexCoord);

    // TODO: something about GL_BLEND vs GL_ALPHATEST etc

    // apply gamma correction
    // texel.rgb *= intensity; // TODO: really no intensity for sky?
    outColor.rgb = pow(texel.rgb, vec3(gamma));
    outColor.a = texel.a*alpha; // I think alpha shouldn't be modified by gamma and intensity
}
`

const fragmentSrc3Dsprite = `

// it gets attributes and uniforms from fragmentCommon3D

uniform sampler2D tex;

void main()
{
    vec4 texel = texture(tex, passTexCoord);

    // apply gamma correction and intensity
    texel.rgb *= intensity;
    outColor.rgb = pow(texel.rgb, vec3(gamma));
    outColor.a = texel.a*alpha; // I think alpha shouldn't be modified by gamma and intensity
}
`

const fragmentSrc3DspriteAlpha = `

// it gets attributes and uniforms from fragmentCommon3D

uniform sampler2D tex;

void main()
{
    vec4 texel = texture(tex, passTexCoord);

    if(texel.a <= 0.666)
        discard;

    // apply gamma correction and intensity
    texel.rgb *= intensity;
    outColor.rgb = pow(texel.rgb, vec3(gamma));
    outColor.a = texel.a*alpha; // I think alpha shouldn't be modified by gamma and intensity
}
`

const vertexSrc3Dwater = `

// it gets attributes and uniforms from vertexCommon3D
void main()
{
    passTexCoord = texCoord;

    gl_Position = transProj * transView * transModel * vec4(position, 1.0);
}
`

const vertexSrcAlias = `

// it gets attributes and uniforms from vertexCommon3D

out vec4 passColor;

void main()
{
    passColor = vertColor*overbrightbits;
    passTexCoord = texCoord;
    gl_Position = transProj * transView * transModel * vec4(position, 1.0);
}
`

const fragmentSrcAlias = `

// it gets attributes and uniforms from fragmentCommon3D

uniform sampler2D tex;

in vec4 passColor;

void main()
{
    vec4 texel = texture(tex, passTexCoord);

    // apply gamma correction and intensity
    texel.rgb *= intensity;
    texel.a *= alpha; // is alpha even used here?
    texel *= min(vec4(1.5), passColor);

    outColor.rgb = pow(texel.rgb, vec3(gamma));
    outColor.a = texel.a; // I think alpha shouldn't be modified by gamma and intensity
}
`

const fragmentSrcAliasColor = `

// it gets attributes and uniforms from fragmentCommon3D

in vec4 passColor;

void main()
{
    vec4 texel = passColor;

    // apply gamma correction and intensity
    // texel.rgb *= intensity; // TODO: color-only rendering probably shouldn't use intensity?
    texel.a *= alpha; // is alpha even used here?
    outColor.rgb = pow(texel.rgb, vec3(gamma));
    outColor.a = texel.a; // I think alpha shouldn't be modified by gamma and intensity
}
`

const vertexSrcParticles = `

// it gets attributes and uniforms from vertexCommon3D

out vec4 passColor;

void main()
{
    passColor = vertColor;
    gl_Position = transProj * transView * transModel * vec4(position, 1.0);

    // abusing texCoord for pointSize, pointDist for particles
    float pointDist = texCoord.y*0.1; // with factor 0.1 it looks good.

    gl_PointSize = texCoord.x/pointDist;
}
`

const fragmentSrcParticles = `

// it gets attributes and uniforms from fragmentCommon3D

in vec4 passColor;

void main()
{
    vec2 offsetFromCenter = 2.0*(gl_PointCoord - vec2(0.5, 0.5)); // normalize so offset is between 0 and 1 instead 0 and 0.5
    float distSquared = dot(offsetFromCenter, offsetFromCenter);
    if(distSquared > 1.0) // this makes sure the particle is round
        discard;

    vec4 texel = passColor;

    // apply gamma correction and intensity
    //texel.rgb *= intensity; TODO: intensity? Probably not?
    outColor.rgb = pow(texel.rgb, vec3(gamma));

    // I want the particles to fade out towards the edge, the following seems to look nice
    texel.a *= min(1.0, particleFadeFactor*(1.0 - distSquared));

    outColor.a = texel.a; // I think alpha shouldn't be modified by gamma and intensity
}
`

const fragmentSrcParticlesSquare = `

// it gets attributes and uniforms from fragmentCommon3D

in vec4 passColor;

void main()
{
    // outColor = passColor;
    // so far we didn't use gamma correction for square particles, but this way
    // uniCommon is referenced so hopefully Intels Ivy Bridge HD4000 GPU driver
    // for Windows stops shitting itself (see https://github.com/yquake2/yquake2/issues/391)
    outColor.rgb = pow(passColor.rgb, vec3(gamma));
    outColor.a = passColor.a;
}
`
const GL3_BINDINGPOINT_UNICOMMON = 0
const GL3_BINDINGPOINT_UNI2D = 1
const GL3_BINDINGPOINT_UNI3D = 2 
const GL3_BINDINGPOINT_UNILIGHTS = 3

function initShader2D(gl: WebGL2RenderingContext, shaderInfo: MAIN.gl3ShaderInfo_t, vertSrc: string, fragSrc: string): boolean {
	// GLuint shaders2D[2] = {0};
	// GLuint prog = 0;

	if (shaderInfo.shaderProgram != null) {
		Com_Printf( "WARNING: calling initShader2D for gl3ShaderInfo_t that already has a shaderProgram!\n");
		gl.deleteProgram(shaderInfo.shaderProgram);
	}

	//shaderInfo->uniColor = shaderInfo->uniProjMatrix = shaderInfo->uniModelViewMatrix = -1;
	shaderInfo.shaderProgram = null;
	shaderInfo.uniLmScales = null;

    let shaders2D: WebGLShader[] = [null,null]
	shaders2D[0] = CompileShader(gl, gl.VERTEX_SHADER, vertSrc, null);
	if(shaders2D[0] == null)  return false;

	shaders2D[1] = CompileShader(gl, gl.FRAGMENT_SHADER, fragSrc, null);
	if(shaders2D[1] == null) {
		gl.deleteShader(shaders2D[0]);
		return false;
	}

	let prog = CreateShaderProgram(gl, shaders2D);

	// I think the shaders aren't needed anymore once they're linked into the program
	gl.deleteShader(shaders2D[0]);
	gl.deleteShader(shaders2D[1]);

	if(prog == 0) {
		return false;
	}

	shaderInfo.shaderProgram = prog;
    MAIN.gl3state.UseProgram(gl, prog)

	// Bind the buffer object to the uniform blocks
	let blockIndex = gl.getUniformBlockIndex(prog, "uniCommon");
	if (blockIndex != gl.INVALID_INDEX) {
		const blockSize = gl.getActiveUniformBlockParameter(prog, blockIndex, gl.UNIFORM_BLOCK_DATA_SIZE);
		if(blockSize != MAIN.gl3UniCommon_size * 4) {
			Com_Printf(`WARNING: OpenGL driver disagrees with us about UBO size of 'uniCommon': ${blockSize} vs ${MAIN.gl3UniCommon_size * 4}\n`);
			gl.deleteProgram(prog);
			return false;
		}

		gl.uniformBlockBinding(prog, blockIndex, GL3_BINDINGPOINT_UNICOMMON);
	} else {
		Com_Printf("WARNING: Couldn't find uniform block index 'uniCommon'\n");
        gl.deleteProgram(prog);
		return false;
	}
	blockIndex = gl.getUniformBlockIndex(prog, "uni2D");
	if (blockIndex != gl.INVALID_INDEX) {
		const blockSize = gl.getActiveUniformBlockParameter(prog, blockIndex, gl.UNIFORM_BLOCK_DATA_SIZE);
		if(blockSize != MAIN.gl3Uni2D_size * 4) {
			Com_Printf(`WARNING: OpenGL driver disagrees with us about UBO size of 'uni2D': ${blockSize} vs ${MAIN.gl3Uni2D_size * 4}\n`);
			gl.deleteProgram(prog);
			return false;
		}

		gl.uniformBlockBinding(prog, blockIndex, GL3_BINDINGPOINT_UNI2D);
	} else {
		Com_Printf("WARNING: Couldn't find uniform block index 'uni2D'\n");
        gl.deleteProgram(prog);
		return false;
	}

	return true;
}

function initShader3D(gl: WebGL2RenderingContext, shaderInfo: MAIN.gl3ShaderInfo_t, vertSrc: string, fragSrc: string): boolean {
// 	GLuint shaders3D[2] = {0};
// 	GLuint prog = 0;
// 	int i=0;

	if(shaderInfo.shaderProgram != null) {
		Com_Printf("WARNING: calling initShader3D for gl3ShaderInfo_t that already has a shaderProgram!\n");
		gl.deleteProgram(shaderInfo.shaderProgram);
	}

	shaderInfo.shaderProgram = null;
	shaderInfo.uniLmScales = null;

	let shaders3D: WebGLShader[] = [null,null]
	shaders3D[0] = CompileShader(gl, gl.VERTEX_SHADER, vertexCommon3D, vertSrc);
	if (shaders3D[0] == null)  return false;

	shaders3D[1] = CompileShader(gl, gl.FRAGMENT_SHADER, fragmentCommon3D, fragSrc);
	if (shaders3D[1] == null) {
		gl.deleteShader(shaders3D[0]);
		return false;
	}

	let prog = CreateShaderProgram(gl, shaders3D);

	if (prog == 0) {
		gl.deleteShader(shaders3D[0]);
		gl.deleteShader(shaders3D[1]);
		return false;
	}

	MAIN.gl3state.UseProgram(gl, prog)

	// Bind the buffer object to the uniform blocks
	let blockIndex = gl.getUniformBlockIndex(prog, "uniCommon");
	if (blockIndex != gl.INVALID_INDEX) {
		const blockSize = gl.getActiveUniformBlockParameter(prog, blockIndex, gl.UNIFORM_BLOCK_DATA_SIZE);
		if(blockSize != MAIN.gl3UniCommon_size * 4) {
			Com_Printf(`WARNING: OpenGL driver disagrees with us about UBO size of 'uniCommon': ${blockSize} vs ${MAIN.gl3UniCommon_size * 4}\n`);
			gl.deleteShader(shaders3D[0]);
			gl.deleteShader(shaders3D[1]);
			gl.deleteProgram(prog);
			return false;
		}

		gl.uniformBlockBinding(prog, blockIndex, GL3_BINDINGPOINT_UNICOMMON);
	}
	else
	{
		Com_Printf("WARNING: Couldn't find uniform block index 'uniCommon'\n");
		gl.deleteShader(shaders3D[0]);
		gl.deleteShader(shaders3D[1]);
        gl.deleteProgram(prog);
		return false;
	}

	blockIndex = gl.getUniformBlockIndex(prog, "uni3D");
	if (blockIndex != gl.INVALID_INDEX) {
		const blockSize = gl.getActiveUniformBlockParameter(prog, blockIndex, gl.UNIFORM_BLOCK_DATA_SIZE);
		if(blockSize != MAIN.gl3Uni3D_size * 4) {
			Com_Printf(`WARNING: OpenGL driver disagrees with us about UBO size of 'uni3D': ${blockSize} vs ${MAIN.gl3Uni3D_size * 4}\n`);
			gl.deleteShader(shaders3D[0]);
			gl.deleteShader(shaders3D[1]);
			gl.deleteProgram(prog);
			return false;
		}

		gl.uniformBlockBinding(prog, blockIndex, GL3_BINDINGPOINT_UNI3D);
	}
	else
	{
		Com_Printf("WARNING: Couldn't find uniform block index 'uni3D'\n");
		gl.deleteShader(shaders3D[0]);
		gl.deleteShader(shaders3D[1]);
		gl.deleteProgram(prog);
		return false;
	}

	blockIndex = gl.getUniformBlockIndex(prog, "uniLights");
	if (blockIndex != gl.INVALID_INDEX) {
		const blockSize = gl.getActiveUniformBlockParameter(prog, blockIndex, gl.UNIFORM_BLOCK_DATA_SIZE);
		if(blockSize != MAIN.gl3UniLights_size * 4) {
			Com_Printf(`WARNING: OpenGL driver disagrees with us about UBO size of 'uniLights': ${blockSize} vs ${MAIN.gl3UniLights_size * 4}\n`);
			gl.deleteShader(shaders3D[0]);
			gl.deleteShader(shaders3D[1]);
			gl.deleteProgram(prog);
			return false;
		}

		gl.uniformBlockBinding(prog, blockIndex, GL3_BINDINGPOINT_UNILIGHTS);
	}
	// else: as uniLights is only used in the LM shaders, it's ok if it's missing

	// make sure texture is GL_TEXTURE0
	let texLoc = gl.getUniformLocation(prog, "tex");
	if( texLoc != -1) {
		gl.uniform1i(texLoc, 0);
	}

	// ..  and the 4 lightmap texture use GL_TEXTURE1..4
	for(let i=0; i<4; ++i) {
		let lmName = `lightmap${i}`;
		let lmLoc = gl.getUniformLocation(prog, lmName);
		if (lmLoc != -1) {
			gl.uniform1i(lmLoc, i+1); // lightmap0 belongs to GL_TEXTURE1, lightmap1 to GL_TEXTURE2 etc
		}
	}

	let lmScalesLoc = gl.getUniformLocation(prog, "lmScales");
	shaderInfo.uniLmScales = lmScalesLoc;
	if (lmScalesLoc != null) {
		for (let i = 0; i < 4; i++) {
			shaderInfo.lmScales[i] = 1
		}
		for (let i = 4; i < 16; i++) {
			shaderInfo.lmScales[i] = 0
		}
		gl.uniform4fv(lmScalesLoc, shaderInfo.lmScales);
	}

	shaderInfo.shaderProgram = prog;

	// I think the shaders aren't needed anymore once they're linked into the program
// 	glDeleteShader(shaders3D[0]);
// 	glDeleteShader(shaders3D[1]);

	return true;
}

function initUBOs(gl: WebGL2RenderingContext) {
	MAIN.gl3state.uniCommonData.gamma = 1.0/MAIN.vid_gamma.float;
	MAIN.gl3state.uniCommonData.intensity = MAIN.gl3_intensity.float;
	MAIN.gl3state.uniCommonData.intensity2D = MAIN.gl3_intensity_2D.float;
	MAIN.gl3state.uniCommonData.color = [1, 1, 1, 1]

    MAIN.gl3state.uniCommonUBO = gl.createBuffer()
	gl.bindBuffer(gl.UNIFORM_BUFFER, MAIN.gl3state.uniCommonUBO);
	gl.bindBufferBase(gl.UNIFORM_BUFFER, GL3_BINDINGPOINT_UNICOMMON, MAIN.gl3state.uniCommonUBO);
    gl.bufferData(gl.UNIFORM_BUFFER, MAIN.gl3state.uniCommonData.data, gl.DYNAMIC_DRAW)

	// the matrix will be set to something more useful later, before being used
	// gl3state.uni2DData.transMat4 = HMM_Mat4();

    MAIN.gl3state.uni2DUBO = gl.createBuffer()
	gl.bindBuffer(gl.UNIFORM_BUFFER, MAIN.gl3state.uni2DUBO);
	gl.bindBufferBase(gl.UNIFORM_BUFFER, GL3_BINDINGPOINT_UNI2D, MAIN.gl3state.uni2DUBO);
    gl.bufferData(gl.UNIFORM_BUFFER, MAIN.gl3state.uni2DData.data, gl.DYNAMIC_DRAW)

	// the matrices will be set to something more useful later, before being used
	// gl3state.uni3DData.transProjMat4 = HMM_Mat4();
	// gl3state.uni3DData.transViewMat4 = HMM_Mat4();
	MAIN.gl3state.uni3DData.transModelMat4 = MAIN.gl3_identityMat4;
	MAIN.gl3state.uni3DData.scroll = 0.0;
	MAIN.gl3state.uni3DData.time = 0.0;
	MAIN.gl3state.uni3DData.alpha = 1.0;
	// gl3_overbrightbits 0 means "no scaling" which is equivalent to multiplying with 1
	MAIN.gl3state.uni3DData.overbrightbits = (MAIN.gl3_overbrightbits.float <= 0.0) ? 1.0 : MAIN.gl3_overbrightbits.float;
	MAIN.gl3state.uni3DData.particleFadeFactor = MAIN.gl3_particle_fade_factor.float;

    MAIN.gl3state.uni3DUBO = gl.createBuffer()
	gl.bindBuffer(gl.UNIFORM_BUFFER, MAIN.gl3state.uni3DUBO);
	gl.bindBufferBase(gl.UNIFORM_BUFFER, GL3_BINDINGPOINT_UNI3D, MAIN.gl3state.uni3DUBO);
	gl.bufferData(gl.UNIFORM_BUFFER, MAIN.gl3state.uni3DData.data, gl.DYNAMIC_DRAW);

    MAIN.gl3state.uniLightsUBO = gl.createBuffer()
	gl.bindBuffer(gl.UNIFORM_BUFFER, MAIN.gl3state.uniLightsUBO);
	gl.bindBufferBase(gl.UNIFORM_BUFFER, GL3_BINDINGPOINT_UNILIGHTS, MAIN.gl3state.uniLightsUBO);
	gl.bufferData(gl.UNIFORM_BUFFER, MAIN.gl3state.uniLightsData.data, gl.DYNAMIC_DRAW);

	MAIN.gl3state.currentUBO = MAIN.gl3state.uniLightsUBO;
}


function createShaders(gl: WebGL2RenderingContext): boolean {
	if(!initShader2D(gl, MAIN.gl3state.si2D, vertexSrc2D, fragmentSrc2D)) {
		Com_Printf( "WARNING: Failed to create shader program for textured 2D rendering!\n");
		return false;
	}
	if(!initShader2D(gl, MAIN.gl3state.si2Dcolor, vertexSrc2Dcolor, fragmentSrc2Dcolor)) {
		Com_Printf( "WARNING: Failed to create shader program for color-only 2D rendering!\n");
		return false;
	}
	if(!initShader3D(gl, MAIN.gl3state.si3Dlm, vertexSrc3Dlm, fragmentSrc3Dlm))
	{
		Com_Printf( "WARNING: Failed to create shader program for textured 3D rendering with lightmap!\n");
		return false;
	}
	if(!initShader3D(gl, MAIN.gl3state.si3Dtrans, vertexSrc3D, fragmentSrc3D)) {
		Com_Printf( "WARNING: Failed to create shader program for rendering translucent 3D things!\n");
		return false;
	}
	if(!initShader3D(gl, MAIN.gl3state.si3DcolorOnly, vertexSrc3D, fragmentSrc3Dcolor)) {
		Com_Printf( "WARNING: Failed to create shader program for flat-colored 3D rendering!\n");
		return false;
	}
	/*
	if(!initShader3D(&gl3state.si3Dlm, vertexSrc3Dlm, fragmentSrc3D))
	{
		R_Printf(PRINT_ALL, "WARNING: Failed to create shader program for blending 3D lightmaps rendering!\n");
		return false;
	}
	*/
	if(!initShader3D(gl, MAIN.gl3state.si3Dturb, vertexSrc3Dwater, fragmentSrc3Dwater)) {
		Com_Printf( "WARNING: Failed to create shader program for water rendering!\n");
		return false;
	}
	if(!initShader3D(gl, MAIN.gl3state.si3DlmFlow, vertexSrc3DlmFlow, fragmentSrc3Dlm)) {
		Com_Printf( "WARNING: Failed to create shader program for scrolling textured 3D rendering with lightmap!\n");
		return false;
	}
	if(!initShader3D(gl, MAIN.gl3state.si3DtransFlow, vertexSrc3Dflow, fragmentSrc3D)) {
		Com_Printf( "WARNING: Failed to create shader program for scrolling textured translucent 3D rendering!\n");
		return false;
	}
	if(!initShader3D(gl, MAIN.gl3state.si3Dsky, vertexSrc3D, fragmentSrc3Dsky)) {
		Com_Printf( "WARNING: Failed to create shader program for sky rendering!\n");
		return false;
	}
	if(!initShader3D(gl, MAIN.gl3state.si3Dsprite, vertexSrc3D, fragmentSrc3Dsprite)) {
		Com_Printf( "WARNING: Failed to create shader program for sprite rendering!\n");
		return false;
	}
	if(!initShader3D(gl, MAIN.gl3state.si3DspriteAlpha, vertexSrc3D, fragmentSrc3DspriteAlpha)) {
		Com_Printf( "WARNING: Failed to create shader program for alpha-tested sprite rendering!\n");
		return false;
	}
	if(!initShader3D(gl, MAIN.gl3state.si3Dalias, vertexSrcAlias, fragmentSrcAlias)) {
		Com_Printf( "WARNING: Failed to create shader program for rendering textured models!\n");
		return false;
	}
	if(!initShader3D(gl, MAIN.gl3state.si3DaliasColor, vertexSrcAlias, fragmentSrcAliasColor)) {
		Com_Printf( "WARNING: Failed to create shader program for rendering flat-colored models!\n");
		return false;
	}

	let particleFrag = fragmentSrcParticles;
	if(MAIN.gl3_particle_square.bool) {
		particleFrag = fragmentSrcParticlesSquare;
	}

	if(!initShader3D(gl, MAIN.gl3state.siParticle, vertexSrcParticles, particleFrag)) {
		Com_Printf( "WARNING: Failed to create shader program for rendering particles!\n");
		return false;
	}

	MAIN.gl3state.currentShaderProgram = null

	return true;
}

export function WebGL_InitShaders(gl: WebGL2RenderingContext): boolean {
	initUBOs(gl);
	return createShaders(gl);
}

function updateUBO(gl: WebGL2RenderingContext, ubo: WebGLBuffer, data: BufferSource) {
	if (MAIN.gl3state.currentUBO != ubo) {
		MAIN.gl3state.currentUBO = ubo;
		gl.bindBuffer(gl.UNIFORM_BUFFER, ubo);
	}

	// http://docs.gl/gl3/glBufferSubData says  "When replacing the entire data store,
	// consider using glBufferSubData rather than completely recreating the data store
	// with glBufferData. This avoids the cost of reallocating the data store."
	// no idea why glBufferData() doesn't just do that when size doesn't change, but whatever..
	// however, it also says glBufferSubData() might cause a stall so I DON'T KNOW!
	// on Linux/nvidia, by just looking at the fps, glBufferData() and glBufferSubData() make no difference
	// TODO: STREAM instead DYNAMIC?

	// this seems to be reasonably fast everywhere.. glMapBuffer() seems to be a bit faster on OSX though..
	gl.bufferData(gl.UNIFORM_BUFFER, data, gl.DYNAMIC_DRAW);
}

export function  WebGL_UpdateUBOCommon(gl: WebGL2RenderingContext) {
	updateUBO(gl, MAIN.gl3state.uniCommonUBO, MAIN.gl3state.uniCommonData.data);
}

export function  WebGL_UpdateUBO2D(gl: WebGL2RenderingContext) {
	updateUBO(gl, MAIN.gl3state.uni2DUBO, MAIN.gl3state.uni2DData.data);
}

export function  WebGL_UpdateUBO3D(gl: WebGL2RenderingContext) {
	updateUBO(gl, MAIN.gl3state.uni3DUBO, MAIN.gl3state.uni3DData.data);
}

export function  WebGL_UpdateUBOLights(gl: WebGL2RenderingContext) {
	updateUBO(gl, MAIN.gl3state.uniLightsUBO, MAIN.gl3state.uniLightsData.data);
}
