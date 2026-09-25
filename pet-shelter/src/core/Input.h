// Keyboard/mouse state with per-frame "pressed" edges.
#pragma once
#include "core/Math.h"

struct GLFWwindow;

namespace ps {

class Input {
public:
    void attach(GLFWwindow* w);
    void beginFrame();                  // call before glfwPollEvents
    bool down(int key) const;
    bool pressed(int key) const;        // went down this frame
    bool mouseDown(int button) const;
    bool mousePressed(int button) const;
    vec2 mousePos() const { return mouse_; }
    vec2 mouseDelta() const { return delta_; }
    float scroll() const { return scroll_; }
    void setCursorLocked(bool locked);
    bool cursorLocked() const { return locked_; }
    // Set by the UI layer when ImGui wants input
    bool uiWantsMouse = false, uiWantsKeyboard = false;

    // Touch controls (phones): virtual joystick (-1..1, y down = back), look/pan drags, twist
    vec2 touchMove;
    void addTouchLook(float dx, float dy) { lookAccum_ = lookAccum_ + vec2(dx, dy); }
    void addTouchPan(float dx, float dy) { panAccum_ = panAccum_ + vec2(dx, dy); }
    void addTouchTwist(float yaw, float pitch) { twistAccum_ = twistAccum_ + vec2(yaw, pitch); }
    vec2 touchLook() const { return look_; }
    vec2 touchPan() const { return pan_; }
    vec2 touchTwist() const { return twist_; }

    // GLFW callbacks
    void onKey(int key, int action);
    void onButton(int button, int action);
    void onScroll(double dy) { scrollAccum_ += float(dy); }
    void onCursor(double x, double y);

private:
    GLFWwindow* win_ = nullptr;
    static constexpr int kKeys = 512;
    bool keys_[kKeys] = {};
    bool buttons_[8] = {};
    bool pendingPress_[kKeys] = {}, pendingButton_[8] = {};
    bool framePress_[kKeys] = {}, frameButton_[8] = {};
    vec2 mouse_, lastMouse_, delta_, deltaAccum_;
    float scroll_ = 0, scrollAccum_ = 0;
    vec2 lookAccum_, look_, panAccum_, pan_, twistAccum_, twist_;
    bool locked_ = false, firstMouse_ = true;
};

}  // namespace ps
