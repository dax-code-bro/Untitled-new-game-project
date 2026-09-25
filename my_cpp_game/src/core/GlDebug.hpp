#pragma once

namespace game::core {

/* KHR_debug output (core since 4.3). Every GL error the driver reports is
 * printed once per distinct message and counted, so a test can assert a
 * frame produced none -- the thing WebGL could never tell us, and why the
 * web engine lost draws to invalid-operation errors nobody saw. */
void installGlDebug();
int  glDebugErrorCount();

} // namespace game::core
