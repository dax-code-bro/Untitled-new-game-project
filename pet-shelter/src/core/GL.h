// Minimal OpenGL 3.3 core loader (generated list, no external GLAD needed).
// Functions are loaded through GLFW at startup: call ps::loadGL() after
// creating the context. Names are macro-mapped to psgl_* pointers so they
// never clash with the system OpenGL library.
#pragma once
#include <cstddef>
#include <cstdint>

#if defined(_WIN32) && !defined(APIENTRY)
#define PSGL_APIENTRY __stdcall
#elif defined(_WIN32)
#define PSGL_APIENTRY APIENTRY
#else
#define PSGL_APIENTRY
#endif

typedef unsigned int GLenum;
typedef unsigned char GLboolean;
typedef unsigned int GLbitfield;
typedef int GLint;
typedef unsigned int GLuint;
typedef int GLsizei;
typedef float GLfloat;
typedef double GLdouble;
typedef char GLchar;
typedef unsigned char GLubyte;
typedef std::ptrdiff_t GLsizeiptr;
typedef std::ptrdiff_t GLintptr;

#define GL_FALSE 0
#define GL_TRUE 1
#define GL_NONE 0
#define GL_ZERO 0
#define GL_ONE 1
#define GL_POINTS 0x0000
#define GL_LINES 0x0001
#define GL_TRIANGLES 0x0004
#define GL_TRIANGLE_STRIP 0x0005
#define GL_DEPTH_BUFFER_BIT 0x00000100
#define GL_COLOR_BUFFER_BIT 0x00004000
#define GL_LESS 0x0201
#define GL_LEQUAL 0x0203
#define GL_ALWAYS 0x0207
#define GL_SRC_ALPHA 0x0302
#define GL_ONE_MINUS_SRC_ALPHA 0x0303
#define GL_FRONT 0x0404
#define GL_BACK 0x0405
#define GL_CULL_FACE 0x0B44
#define GL_DEPTH_TEST 0x0B71
#define GL_BLEND 0x0BE2
#define GL_SCISSOR_TEST 0x0C11
#define GL_UNPACK_ALIGNMENT 0x0CF5
#define GL_PACK_ALIGNMENT 0x0D05
#define GL_TEXTURE_2D 0x0DE1
#define GL_TEXTURE_BORDER_COLOR 0x1004
#define GL_UNSIGNED_BYTE 0x1401
#define GL_UNSIGNED_SHORT 0x1403
#define GL_UNSIGNED_INT 0x1405
#define GL_FLOAT 0x1406
#define GL_HALF_FLOAT 0x140B
#define GL_DEPTH_COMPONENT 0x1902
#define GL_RED 0x1903
#define GL_RGB 0x1907
#define GL_RGBA 0x1908
#define GL_VENDOR 0x1F00
#define GL_RENDERER 0x1F01
#define GL_VERSION 0x1F02
#define GL_NEAREST 0x2600
#define GL_LINEAR 0x2601
#define GL_LINEAR_MIPMAP_LINEAR 0x2703
#define GL_TEXTURE_MAG_FILTER 0x2800
#define GL_TEXTURE_MIN_FILTER 0x2801
#define GL_TEXTURE_WRAP_S 0x2802
#define GL_TEXTURE_WRAP_T 0x2803
#define GL_REPEAT 0x2901
#define GL_POLYGON_OFFSET_FILL 0x8037
#define GL_RGBA8 0x8058
#define GL_CLAMP_TO_BORDER 0x812D
#define GL_CLAMP_TO_EDGE 0x812F
#define GL_TEXTURE_BASE_LEVEL 0x813C
#define GL_TEXTURE_MAX_LEVEL 0x813D
#define GL_DEPTH_COMPONENT24 0x81A6
#define GL_R16F 0x822D
#define GL_RG 0x8227
#define GL_RG16F 0x822F
#define GL_TEXTURE0 0x84C0
#define GL_TEXTURE_COMPARE_MODE 0x884C
#define GL_TEXTURE_COMPARE_FUNC 0x884D
#define GL_COMPARE_REF_TO_TEXTURE 0x884E
#define GL_RGBA16F 0x881A
#define GL_RGB16F 0x881B
#define GL_ARRAY_BUFFER 0x8892
#define GL_ELEMENT_ARRAY_BUFFER 0x8893
#define GL_STREAM_DRAW 0x88E0
#define GL_STATIC_DRAW 0x88E4
#define GL_DYNAMIC_DRAW 0x88E8
#define GL_FRAGMENT_SHADER 0x8B30
#define GL_VERTEX_SHADER 0x8B31
#define GL_COMPILE_STATUS 0x8B81
#define GL_LINK_STATUS 0x8B82
#define GL_INFO_LOG_LENGTH 0x8B84
#define GL_READ_FRAMEBUFFER 0x8CA8
#define GL_DRAW_FRAMEBUFFER 0x8CA9
#define GL_DEPTH_COMPONENT32F 0x8CAC
#define GL_FRAMEBUFFER_COMPLETE 0x8CD5
#define GL_COLOR_ATTACHMENT0 0x8CE0
#define GL_DEPTH_ATTACHMENT 0x8D00
#define GL_FRAMEBUFFER 0x8D40

typedef void (PSGL_APIENTRY *PFN_psglClear)(GLbitfield mask);
extern PFN_psglClear psgl_Clear;
#define glClear psgl_Clear
typedef void (PSGL_APIENTRY *PFN_psglClearColor)(GLfloat r, GLfloat g, GLfloat b, GLfloat a);
extern PFN_psglClearColor psgl_ClearColor;
#define glClearColor psgl_ClearColor
typedef void (PSGL_APIENTRY *PFN_psglClearDepth)(GLdouble d);
extern PFN_psglClearDepth psgl_ClearDepth;
#define glClearDepth psgl_ClearDepth
typedef void (PSGL_APIENTRY *PFN_psglViewport)(GLint x, GLint y, GLsizei w, GLsizei h);
extern PFN_psglViewport psgl_Viewport;
#define glViewport psgl_Viewport
typedef void (PSGL_APIENTRY *PFN_psglEnable)(GLenum cap);
extern PFN_psglEnable psgl_Enable;
#define glEnable psgl_Enable
typedef void (PSGL_APIENTRY *PFN_psglDisable)(GLenum cap);
extern PFN_psglDisable psgl_Disable;
#define glDisable psgl_Disable
typedef void (PSGL_APIENTRY *PFN_psglCullFace)(GLenum mode);
extern PFN_psglCullFace psgl_CullFace;
#define glCullFace psgl_CullFace
typedef void (PSGL_APIENTRY *PFN_psglBlendFunc)(GLenum s, GLenum d);
extern PFN_psglBlendFunc psgl_BlendFunc;
#define glBlendFunc psgl_BlendFunc
typedef void (PSGL_APIENTRY *PFN_psglDepthFunc)(GLenum f);
extern PFN_psglDepthFunc psgl_DepthFunc;
#define glDepthFunc psgl_DepthFunc
typedef void (PSGL_APIENTRY *PFN_psglDepthMask)(GLboolean f);
extern PFN_psglDepthMask psgl_DepthMask;
#define glDepthMask psgl_DepthMask
typedef void (PSGL_APIENTRY *PFN_psglColorMask)(GLboolean r, GLboolean g, GLboolean b, GLboolean a);
extern PFN_psglColorMask psgl_ColorMask;
#define glColorMask psgl_ColorMask
typedef void (PSGL_APIENTRY *PFN_psglPolygonOffset)(GLfloat factor, GLfloat units);
extern PFN_psglPolygonOffset psgl_PolygonOffset;
#define glPolygonOffset psgl_PolygonOffset
typedef void (PSGL_APIENTRY *PFN_psglGenBuffers)(GLsizei n, GLuint* b);
extern PFN_psglGenBuffers psgl_GenBuffers;
#define glGenBuffers psgl_GenBuffers
typedef void (PSGL_APIENTRY *PFN_psglBindBuffer)(GLenum t, GLuint b);
extern PFN_psglBindBuffer psgl_BindBuffer;
#define glBindBuffer psgl_BindBuffer
typedef void (PSGL_APIENTRY *PFN_psglBufferData)(GLenum t, GLsizeiptr size, const void* data, GLenum usage);
extern PFN_psglBufferData psgl_BufferData;
#define glBufferData psgl_BufferData
typedef void (PSGL_APIENTRY *PFN_psglBufferSubData)(GLenum t, GLintptr off, GLsizeiptr size, const void* data);
extern PFN_psglBufferSubData psgl_BufferSubData;
#define glBufferSubData psgl_BufferSubData
typedef void (PSGL_APIENTRY *PFN_psglDeleteBuffers)(GLsizei n, const GLuint* b);
extern PFN_psglDeleteBuffers psgl_DeleteBuffers;
#define glDeleteBuffers psgl_DeleteBuffers
typedef void (PSGL_APIENTRY *PFN_psglGenVertexArrays)(GLsizei n, GLuint* a);
extern PFN_psglGenVertexArrays psgl_GenVertexArrays;
#define glGenVertexArrays psgl_GenVertexArrays
typedef void (PSGL_APIENTRY *PFN_psglBindVertexArray)(GLuint a);
extern PFN_psglBindVertexArray psgl_BindVertexArray;
#define glBindVertexArray psgl_BindVertexArray
typedef void (PSGL_APIENTRY *PFN_psglDeleteVertexArrays)(GLsizei n, const GLuint* a);
extern PFN_psglDeleteVertexArrays psgl_DeleteVertexArrays;
#define glDeleteVertexArrays psgl_DeleteVertexArrays
typedef void (PSGL_APIENTRY *PFN_psglEnableVertexAttribArray)(GLuint i);
extern PFN_psglEnableVertexAttribArray psgl_EnableVertexAttribArray;
#define glEnableVertexAttribArray psgl_EnableVertexAttribArray
typedef void (PSGL_APIENTRY *PFN_psglVertexAttribPointer)(GLuint i, GLint size, GLenum type, GLboolean norm, GLsizei stride, const void* ptr);
extern PFN_psglVertexAttribPointer psgl_VertexAttribPointer;
#define glVertexAttribPointer psgl_VertexAttribPointer
typedef void (PSGL_APIENTRY *PFN_psglVertexAttribDivisor)(GLuint i, GLuint d);
extern PFN_psglVertexAttribDivisor psgl_VertexAttribDivisor;
#define glVertexAttribDivisor psgl_VertexAttribDivisor
typedef void (PSGL_APIENTRY *PFN_psglDrawArrays)(GLenum mode, GLint first, GLsizei count);
extern PFN_psglDrawArrays psgl_DrawArrays;
#define glDrawArrays psgl_DrawArrays
typedef void (PSGL_APIENTRY *PFN_psglDrawElements)(GLenum mode, GLsizei count, GLenum type, const void* idx);
extern PFN_psglDrawElements psgl_DrawElements;
#define glDrawElements psgl_DrawElements
typedef void (PSGL_APIENTRY *PFN_psglDrawElementsInstanced)(GLenum mode, GLsizei count, GLenum type, const void* idx, GLsizei inst);
extern PFN_psglDrawElementsInstanced psgl_DrawElementsInstanced;
#define glDrawElementsInstanced psgl_DrawElementsInstanced
typedef GLuint (PSGL_APIENTRY *PFN_psglCreateShader)(GLenum type);
extern PFN_psglCreateShader psgl_CreateShader;
#define glCreateShader psgl_CreateShader
typedef void (PSGL_APIENTRY *PFN_psglShaderSource)(GLuint s, GLsizei n, const GLchar* const* src, const GLint* len);
extern PFN_psglShaderSource psgl_ShaderSource;
#define glShaderSource psgl_ShaderSource
typedef void (PSGL_APIENTRY *PFN_psglCompileShader)(GLuint s);
extern PFN_psglCompileShader psgl_CompileShader;
#define glCompileShader psgl_CompileShader
typedef void (PSGL_APIENTRY *PFN_psglGetShaderiv)(GLuint s, GLenum p, GLint* v);
extern PFN_psglGetShaderiv psgl_GetShaderiv;
#define glGetShaderiv psgl_GetShaderiv
typedef void (PSGL_APIENTRY *PFN_psglGetShaderInfoLog)(GLuint s, GLsizei max, GLsizei* len, GLchar* log);
extern PFN_psglGetShaderInfoLog psgl_GetShaderInfoLog;
#define glGetShaderInfoLog psgl_GetShaderInfoLog
typedef GLuint (PSGL_APIENTRY *PFN_psglCreateProgram)(void);
extern PFN_psglCreateProgram psgl_CreateProgram;
#define glCreateProgram psgl_CreateProgram
typedef void (PSGL_APIENTRY *PFN_psglAttachShader)(GLuint p, GLuint s);
extern PFN_psglAttachShader psgl_AttachShader;
#define glAttachShader psgl_AttachShader
typedef void (PSGL_APIENTRY *PFN_psglLinkProgram)(GLuint p);
extern PFN_psglLinkProgram psgl_LinkProgram;
#define glLinkProgram psgl_LinkProgram
typedef void (PSGL_APIENTRY *PFN_psglGetProgramiv)(GLuint p, GLenum e, GLint* v);
extern PFN_psglGetProgramiv psgl_GetProgramiv;
#define glGetProgramiv psgl_GetProgramiv
typedef void (PSGL_APIENTRY *PFN_psglGetProgramInfoLog)(GLuint p, GLsizei max, GLsizei* len, GLchar* log);
extern PFN_psglGetProgramInfoLog psgl_GetProgramInfoLog;
#define glGetProgramInfoLog psgl_GetProgramInfoLog
typedef void (PSGL_APIENTRY *PFN_psglDeleteShader)(GLuint s);
extern PFN_psglDeleteShader psgl_DeleteShader;
#define glDeleteShader psgl_DeleteShader
typedef void (PSGL_APIENTRY *PFN_psglDeleteProgram)(GLuint p);
extern PFN_psglDeleteProgram psgl_DeleteProgram;
#define glDeleteProgram psgl_DeleteProgram
typedef void (PSGL_APIENTRY *PFN_psglUseProgram)(GLuint p);
extern PFN_psglUseProgram psgl_UseProgram;
#define glUseProgram psgl_UseProgram
typedef GLint (PSGL_APIENTRY *PFN_psglGetUniformLocation)(GLuint p, const GLchar* name);
extern PFN_psglGetUniformLocation psgl_GetUniformLocation;
#define glGetUniformLocation psgl_GetUniformLocation
typedef void (PSGL_APIENTRY *PFN_psglUniform1i)(GLint l, GLint v);
extern PFN_psglUniform1i psgl_Uniform1i;
#define glUniform1i psgl_Uniform1i
typedef void (PSGL_APIENTRY *PFN_psglUniform1f)(GLint l, GLfloat v);
extern PFN_psglUniform1f psgl_Uniform1f;
#define glUniform1f psgl_Uniform1f
typedef void (PSGL_APIENTRY *PFN_psglUniform2f)(GLint l, GLfloat a, GLfloat b);
extern PFN_psglUniform2f psgl_Uniform2f;
#define glUniform2f psgl_Uniform2f
typedef void (PSGL_APIENTRY *PFN_psglUniform3f)(GLint l, GLfloat a, GLfloat b, GLfloat c);
extern PFN_psglUniform3f psgl_Uniform3f;
#define glUniform3f psgl_Uniform3f
typedef void (PSGL_APIENTRY *PFN_psglUniform4f)(GLint l, GLfloat a, GLfloat b, GLfloat c, GLfloat d);
extern PFN_psglUniform4f psgl_Uniform4f;
#define glUniform4f psgl_Uniform4f
typedef void (PSGL_APIENTRY *PFN_psglUniform3fv)(GLint l, GLsizei n, const GLfloat* v);
extern PFN_psglUniform3fv psgl_Uniform3fv;
#define glUniform3fv psgl_Uniform3fv
typedef void (PSGL_APIENTRY *PFN_psglUniform4fv)(GLint l, GLsizei n, const GLfloat* v);
extern PFN_psglUniform4fv psgl_Uniform4fv;
#define glUniform4fv psgl_Uniform4fv
typedef void (PSGL_APIENTRY *PFN_psglUniformMatrix4fv)(GLint l, GLsizei n, GLboolean t, const GLfloat* v);
extern PFN_psglUniformMatrix4fv psgl_UniformMatrix4fv;
#define glUniformMatrix4fv psgl_UniformMatrix4fv
typedef void (PSGL_APIENTRY *PFN_psglGenTextures)(GLsizei n, GLuint* t);
extern PFN_psglGenTextures psgl_GenTextures;
#define glGenTextures psgl_GenTextures
typedef void (PSGL_APIENTRY *PFN_psglBindTexture)(GLenum target, GLuint t);
extern PFN_psglBindTexture psgl_BindTexture;
#define glBindTexture psgl_BindTexture
typedef void (PSGL_APIENTRY *PFN_psglTexImage2D)(GLenum target, GLint level, GLint ifmt, GLsizei w, GLsizei h, GLint border, GLenum fmt, GLenum type, const void* data);
extern PFN_psglTexImage2D psgl_TexImage2D;
#define glTexImage2D psgl_TexImage2D
typedef void (PSGL_APIENTRY *PFN_psglTexParameteri)(GLenum target, GLenum p, GLint v);
extern PFN_psglTexParameteri psgl_TexParameteri;
#define glTexParameteri psgl_TexParameteri
typedef void (PSGL_APIENTRY *PFN_psglTexParameterfv)(GLenum target, GLenum p, const GLfloat* v);
extern PFN_psglTexParameterfv psgl_TexParameterfv;
#define glTexParameterfv psgl_TexParameterfv
typedef void (PSGL_APIENTRY *PFN_psglActiveTexture)(GLenum t);
extern PFN_psglActiveTexture psgl_ActiveTexture;
#define glActiveTexture psgl_ActiveTexture
typedef void (PSGL_APIENTRY *PFN_psglGenerateMipmap)(GLenum target);
extern PFN_psglGenerateMipmap psgl_GenerateMipmap;
#define glGenerateMipmap psgl_GenerateMipmap
typedef void (PSGL_APIENTRY *PFN_psglDeleteTextures)(GLsizei n, const GLuint* t);
extern PFN_psglDeleteTextures psgl_DeleteTextures;
#define glDeleteTextures psgl_DeleteTextures
typedef void (PSGL_APIENTRY *PFN_psglGenFramebuffers)(GLsizei n, GLuint* f);
extern PFN_psglGenFramebuffers psgl_GenFramebuffers;
#define glGenFramebuffers psgl_GenFramebuffers
typedef void (PSGL_APIENTRY *PFN_psglBindFramebuffer)(GLenum target, GLuint f);
extern PFN_psglBindFramebuffer psgl_BindFramebuffer;
#define glBindFramebuffer psgl_BindFramebuffer
typedef void (PSGL_APIENTRY *PFN_psglFramebufferTexture2D)(GLenum target, GLenum att, GLenum textarget, GLuint tex, GLint level);
extern PFN_psglFramebufferTexture2D psgl_FramebufferTexture2D;
#define glFramebufferTexture2D psgl_FramebufferTexture2D
typedef GLenum (PSGL_APIENTRY *PFN_psglCheckFramebufferStatus)(GLenum target);
extern PFN_psglCheckFramebufferStatus psgl_CheckFramebufferStatus;
#define glCheckFramebufferStatus psgl_CheckFramebufferStatus
typedef void (PSGL_APIENTRY *PFN_psglDeleteFramebuffers)(GLsizei n, const GLuint* f);
extern PFN_psglDeleteFramebuffers psgl_DeleteFramebuffers;
#define glDeleteFramebuffers psgl_DeleteFramebuffers
typedef void (PSGL_APIENTRY *PFN_psglDrawBuffer)(GLenum b);
extern PFN_psglDrawBuffer psgl_DrawBuffer;
#define glDrawBuffer psgl_DrawBuffer
typedef void (PSGL_APIENTRY *PFN_psglReadBuffer)(GLenum b);
extern PFN_psglReadBuffer psgl_ReadBuffer;
#define glReadBuffer psgl_ReadBuffer
typedef void (PSGL_APIENTRY *PFN_psglReadPixels)(GLint x, GLint y, GLsizei w, GLsizei h, GLenum fmt, GLenum type, void* data);
extern PFN_psglReadPixels psgl_ReadPixels;
#define glReadPixels psgl_ReadPixels
typedef void (PSGL_APIENTRY *PFN_psglPixelStorei)(GLenum p, GLint v);
extern PFN_psglPixelStorei psgl_PixelStorei;
#define glPixelStorei psgl_PixelStorei
typedef const GLubyte* (PSGL_APIENTRY *PFN_psglGetString)(GLenum name);
extern PFN_psglGetString psgl_GetString;
#define glGetString psgl_GetString
typedef GLenum (PSGL_APIENTRY *PFN_psglGetError)(void);
extern PFN_psglGetError psgl_GetError;
#define glGetError psgl_GetError

namespace ps {
using GLLoadFn = void* (*)(const char*);
// Returns false (and prints the missing name) if anything failed to load.
bool loadGL(GLLoadFn getProc);
}
