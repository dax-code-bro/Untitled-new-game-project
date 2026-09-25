#include "core/Input.h"
#include <GLFW/glfw3.h>
#include <cstring>

namespace ps {

void Input::attach(GLFWwindow* w) { win_ = w; }

void Input::beginFrame() {
    // Latch presses gathered since last frame (so very short taps aren't lost)
    std::memcpy(framePress_, pendingPress_, sizeof framePress_);
    std::memcpy(frameButton_, pendingButton_, sizeof frameButton_);
    std::memset(pendingPress_, 0, sizeof pendingPress_);
    std::memset(pendingButton_, 0, sizeof pendingButton_);
    delta_ = deltaAccum_;
    deltaAccum_ = {0, 0};
    scroll_ = scrollAccum_;
    scrollAccum_ = 0;
    look_ = lookAccum_; lookAccum_ = {0, 0};
    pan_ = panAccum_; panAccum_ = {0, 0};
    twist_ = twistAccum_; twistAccum_ = {0, 0};
}

bool Input::down(int key) const { return key >= 0 && key < kKeys && keys_[key] && !uiWantsKeyboard; }
bool Input::pressed(int key) const { return key >= 0 && key < kKeys && framePress_[key] && !uiWantsKeyboard; }
bool Input::mouseDown(int b) const { return b >= 0 && b < 8 && buttons_[b] && !uiWantsMouse; }
bool Input::mousePressed(int b) const { return b >= 0 && b < 8 && frameButton_[b] && !uiWantsMouse; }

void Input::onKey(int key, int action) {
    if (key < 0 || key >= kKeys) return;
    if (action == GLFW_PRESS) { keys_[key] = true; pendingPress_[key] = true; }
    else if (action == GLFW_RELEASE) keys_[key] = false;
}

void Input::onButton(int button, int action) {
    if (button < 0 || button >= 8) return;
    if (action == GLFW_PRESS) { buttons_[button] = true; pendingButton_[button] = true; }
    else if (action == GLFW_RELEASE) buttons_[button] = false;
}

void Input::onCursor(double x, double y) {
    vec2 p{float(x), float(y)};
    if (firstMouse_) { lastMouse_ = p; firstMouse_ = false; }
    deltaAccum_ = deltaAccum_ + (p - lastMouse_);
    lastMouse_ = p;
    mouse_ = p;
}

void Input::setCursorLocked(bool locked) {
    if (locked == locked_ || !win_) return;
    locked_ = locked;
    glfwSetInputMode(win_, GLFW_CURSOR, locked ? GLFW_CURSOR_DISABLED : GLFW_CURSOR_NORMAL);
    if (locked && glfwRawMouseMotionSupported()) glfwSetInputMode(win_, GLFW_RAW_MOUSE_MOTION, GLFW_TRUE);
    firstMouse_ = true;
    deltaAccum_ = {0, 0};
}

}  // namespace ps
