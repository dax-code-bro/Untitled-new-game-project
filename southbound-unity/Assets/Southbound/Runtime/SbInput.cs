// One place to read the controls. Uses the Input System package (keyboard,
// mouse and gamepad) when it is installed and enabled, otherwise the classic
// Input Manager, so the project runs either way.
using UnityEngine;
#if SB_INPUTSYSTEM && ENABLE_INPUT_SYSTEM
using UnityEngine.InputSystem;
#endif

namespace Southbound
{
    public static class SbInput
    {
        /// <summary>Move stick / WASD, x = right, y = forward.</summary>
        public static Vector2 Move
        {
            get
            {
#if SB_INPUTSYSTEM && ENABLE_INPUT_SYSTEM
                Vector2 v = Vector2.zero;
                var k = Keyboard.current;
                if (k != null)
                {
                    if (k.wKey.isPressed) v.y += 1; if (k.sKey.isPressed) v.y -= 1;
                    if (k.dKey.isPressed) v.x += 1; if (k.aKey.isPressed) v.x -= 1;
                }
                var g = Gamepad.current;
                if (g != null) v += g.leftStick.ReadValue();
                return Vector2.ClampMagnitude(v, 1);
#else
                return Vector2.ClampMagnitude(new Vector2(Input.GetAxisRaw("Horizontal"), Input.GetAxisRaw("Vertical")), 1);
#endif
            }
        }

        /// <summary>Camera look in degrees this frame.</summary>
        public static Vector2 Look
        {
            get
            {
#if SB_INPUTSYSTEM && ENABLE_INPUT_SYSTEM
                Vector2 v = Vector2.zero;
                if (Mouse.current != null) v += Mouse.current.delta.ReadValue() * 0.1f;
                if (Gamepad.current != null) v += Gamepad.current.rightStick.ReadValue() * 180f * Time.deltaTime;
                return v;
#else
                return new Vector2(Input.GetAxisRaw("Mouse X"), Input.GetAxisRaw("Mouse Y")) * 2f;
#endif
            }
        }

#if SB_INPUTSYSTEM && ENABLE_INPUT_SYSTEM
        static bool Held(Key k) => Keyboard.current != null && Keyboard.current[k].isPressed;
        static bool Pressed(Key k) => Keyboard.current != null && Keyboard.current[k].wasPressedThisFrame;
        public static bool Sprint => Held(UnityEngine.InputSystem.Key.LeftShift) || (Gamepad.current?.leftStickButton.isPressed ?? false);
        public static bool JumpDown => Pressed(UnityEngine.InputSystem.Key.Space) || (Gamepad.current?.buttonSouth.wasPressedThisFrame ?? false);
        public static bool Aim => (Mouse.current?.rightButton.isPressed ?? false) || (Gamepad.current?.leftTrigger.isPressed ?? false);
        public static bool Fire => (Mouse.current?.leftButton.isPressed ?? false) || (Gamepad.current?.rightTrigger.isPressed ?? false);
        public static bool ReloadDown => Pressed(UnityEngine.InputSystem.Key.R) || (Gamepad.current?.buttonWest.wasPressedThisFrame ?? false);
        public static bool HolsterDown => Pressed(UnityEngine.InputSystem.Key.H);
        public static bool CrouchDown => Pressed(UnityEngine.InputSystem.Key.C) || (Gamepad.current?.rightStickButton.wasPressedThisFrame ?? false);
        public static float Scroll => (Mouse.current?.scroll.ReadValue().y ?? 0) / 120f + ((Gamepad.current?.rightShoulder.wasPressedThisFrame ?? false) ? 1 : 0) - ((Gamepad.current?.leftShoulder.wasPressedThisFrame ?? false) ? 1 : 0);
        public static bool PauseDown => Pressed(UnityEngine.InputSystem.Key.Escape) || (Gamepad.current?.startButton.wasPressedThisFrame ?? false);
        public static int NumberDown
        {
            get
            {
                if (Keyboard.current == null) return 0;
                for (int i = 1; i <= 9; i++) if (Keyboard.current[UnityEngine.InputSystem.Key.Digit1 + (i - 1)].wasPressedThisFrame) return i;
                return 0;
            }
        }
#else
        public static bool Sprint => Input.GetKey(KeyCode.LeftShift);
        public static bool JumpDown => Input.GetKeyDown(KeyCode.Space);
        public static bool Aim => Input.GetMouseButton(1);
        public static bool Fire => Input.GetMouseButton(0);
        public static bool ReloadDown => Input.GetKeyDown(KeyCode.R);
        public static bool HolsterDown => Input.GetKeyDown(KeyCode.H);
        public static bool CrouchDown => Input.GetKeyDown(KeyCode.C);
        public static float Scroll => Input.mouseScrollDelta.y;
        public static bool PauseDown => Input.GetKeyDown(KeyCode.Escape);
        public static int NumberDown
        {
            get
            {
                for (int i = 1; i <= 9; i++) if (Input.GetKeyDown(KeyCode.Alpha0 + i)) return i;
                return 0;
            }
        }
#endif
    }
}
