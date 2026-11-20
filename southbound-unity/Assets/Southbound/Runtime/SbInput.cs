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

        /// <summary>Steering, -1 left .. 1 right (the move stick / A and D).</summary>
        public static float Steer => Move.x;

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
        // driving (the web game's keys: W/S, A/D, Space handbrake, Shift nitrous, F in/out, H horn)
        public static bool InteractDown => Pressed(UnityEngine.InputSystem.Key.F) || Pressed(UnityEngine.InputSystem.Key.Enter) || (Gamepad.current?.buttonNorth.wasPressedThisFrame ?? false);
        public static float Throttle => Mathf.Clamp01(Mathf.Max(Move.y, Gamepad.current?.rightTrigger.ReadValue() ?? 0));
        public static float Brake => Mathf.Clamp01(Mathf.Max(-Move.y, Gamepad.current?.leftTrigger.ReadValue() ?? 0));
        public static bool Handbrake => Held(UnityEngine.InputSystem.Key.Space) || (Gamepad.current?.buttonSouth.isPressed ?? false) || (Gamepad.current?.rightShoulder.isPressed ?? false);
        public static bool Nitro => Held(UnityEngine.InputSystem.Key.LeftShift) || (Gamepad.current?.leftStickButton.isPressed ?? false);
        public static bool Horn => Held(UnityEngine.InputSystem.Key.H) || (Gamepad.current?.rightStickButton.isPressed ?? false);
        public static bool LightsDown => Pressed(UnityEngine.InputSystem.Key.L) || (Gamepad.current?.dpad.up.wasPressedThisFrame ?? false);
        public static bool SirenDown => Pressed(UnityEngine.InputSystem.Key.B) || (Gamepad.current?.dpad.down.wasPressedThisFrame ?? false);
        public static bool PhotoDown => Pressed(UnityEngine.InputSystem.Key.F10) || (Gamepad.current?.selectButton.wasPressedThisFrame ?? false);
        public static bool WeatherDown => Pressed(UnityEngine.InputSystem.Key.F8);
        public static bool TierDown => Pressed(UnityEngine.InputSystem.Key.F7);
        // menus (store screens): arrows or W/S, Enter or Space, Esc or Backspace, Tab or A/D between tabs
        public static bool MenuUp => Pressed(UnityEngine.InputSystem.Key.UpArrow) || Pressed(UnityEngine.InputSystem.Key.W) || (Gamepad.current?.dpad.up.wasPressedThisFrame ?? false);
        public static bool MenuDown => Pressed(UnityEngine.InputSystem.Key.DownArrow) || Pressed(UnityEngine.InputSystem.Key.S) || (Gamepad.current?.dpad.down.wasPressedThisFrame ?? false);
        public static bool MenuNext => Pressed(UnityEngine.InputSystem.Key.Tab) || Pressed(UnityEngine.InputSystem.Key.RightArrow) || Pressed(UnityEngine.InputSystem.Key.D) || (Gamepad.current?.rightShoulder.wasPressedThisFrame ?? false);
        public static bool MenuPrev => Pressed(UnityEngine.InputSystem.Key.LeftArrow) || Pressed(UnityEngine.InputSystem.Key.A) || (Gamepad.current?.leftShoulder.wasPressedThisFrame ?? false);
        public static bool MenuConfirm => Pressed(UnityEngine.InputSystem.Key.Enter) || Pressed(UnityEngine.InputSystem.Key.Space) || (Gamepad.current?.buttonSouth.wasPressedThisFrame ?? false);
        public static bool MenuBack => Pressed(UnityEngine.InputSystem.Key.Escape) || Pressed(UnityEngine.InputSystem.Key.Backspace) || (Gamepad.current?.buttonEast.wasPressedThisFrame ?? false);
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
        public static bool InteractDown => Input.GetKeyDown(KeyCode.F) || Input.GetKeyDown(KeyCode.Return);
        public static float Throttle => Mathf.Clamp01(Move.y);
        public static float Brake => Mathf.Clamp01(-Move.y);
        public static bool Handbrake => Input.GetKey(KeyCode.Space);
        public static bool Nitro => Input.GetKey(KeyCode.LeftShift);
        public static bool Horn => Input.GetKey(KeyCode.H);
        public static bool LightsDown => Input.GetKeyDown(KeyCode.L);
        public static bool SirenDown => Input.GetKeyDown(KeyCode.B);
        public static bool PhotoDown => Input.GetKeyDown(KeyCode.F10);
        public static bool WeatherDown => Input.GetKeyDown(KeyCode.F8);
        public static bool TierDown => Input.GetKeyDown(KeyCode.F7);
        public static bool MenuUp => Input.GetKeyDown(KeyCode.UpArrow) || Input.GetKeyDown(KeyCode.W);
        public static bool MenuDown => Input.GetKeyDown(KeyCode.DownArrow) || Input.GetKeyDown(KeyCode.S);
        public static bool MenuNext => Input.GetKeyDown(KeyCode.Tab) || Input.GetKeyDown(KeyCode.RightArrow) || Input.GetKeyDown(KeyCode.D);
        public static bool MenuPrev => Input.GetKeyDown(KeyCode.LeftArrow) || Input.GetKeyDown(KeyCode.A);
        public static bool MenuConfirm => Input.GetKeyDown(KeyCode.Return) || Input.GetKeyDown(KeyCode.Space);
        public static bool MenuBack => Input.GetKeyDown(KeyCode.Escape) || Input.GetKeyDown(KeyCode.Backspace);
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
