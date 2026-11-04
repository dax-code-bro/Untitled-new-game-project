// John on foot: walk, jog, sprint (stamina from the needs system), jump,
// crouch, aim-walk. Movement is relative to the camera like the web game.
using UnityEngine;

namespace Southbound
{
    [RequireComponent(typeof(CharacterController))]
    public sealed class PlayerController : MonoBehaviour
    {
        public Transform cameraRig;
        public float walkSpeed = 1.5f, jogSpeed = 3.6f, sprintSpeed = 6.5f, aimSpeed = 1.4f, crouchSpeed = 1.2f;
        public float jumpSpeed = 4.6f, gravity = 18f, turnSpeed = 10f;
        [Tooltip("The character model (child). Gets the needs system's body shape.")]
        public Transform model;
        public Retargeter animator;

        CharacterController cc;
        Vector3 vel;
        float speedNow;
        bool crouched;
        public float Speed => speedNow;
        public bool Sprinting { get; private set; }
        public bool Grounded => cc != null && cc.isGrounded;
        public bool Crouched => crouched;

        void Awake()
        {
            cc = GetComponent<CharacterController>();
            if (cameraRig == null && Camera.main != null) cameraRig = Camera.main.transform;
        }

        void Update()
        {
            var game = SouthboundGame.Instance;
            if (game != null && game.Health <= 0) { if (animator) animator.Play("Death01"); return; }
            Vector2 mv = SbInput.Move;
            bool aiming = SbInput.Aim && game != null && game.gunplay != null && game.gunplay.Drawn;
            if (SbInput.CrouchDown) crouched = !crouched;
            var needs = game != null ? game.Needs : null;
            Sprinting = SbInput.Sprint && mv.y > 0.1f && !aiming && !crouched && (needs == null || needs.CanSprint);
            float target = mv.magnitude * (aiming ? aimSpeed : crouched ? crouchSpeed : Sprinting ? sprintSpeed : mv.magnitude > 0.6f ? jogSpeed : walkSpeed);

            Vector3 fwd = cameraRig != null ? Vector3.ProjectOnPlane(cameraRig.forward, Vector3.up).normalized : transform.forward;
            Vector3 right = Vector3.Cross(Vector3.up, fwd);
            Vector3 dir = (fwd * mv.y + right * mv.x);
            if (dir.sqrMagnitude > 1) dir.Normalize();
            speedNow = Mathf.MoveTowards(speedNow, target, (target > speedNow ? 9f : 14f) * Time.deltaTime);

            // face where you move, or where the camera looks while aiming
            Vector3 face = aiming ? fwd : dir;
            if (face.sqrMagnitude > 0.001f)
                transform.rotation = Quaternion.Slerp(transform.rotation, Quaternion.LookRotation(face), 1 - Mathf.Exp(-turnSpeed * Time.deltaTime));

            Vector3 h = (dir.sqrMagnitude > 0.0001f ? dir.normalized : Vector3.zero) * speedNow;
            if (cc.isGrounded)
            {
                vel.y = -2f;
                if (SbInput.JumpDown && !crouched) { vel.y = jumpSpeed; if (animator) animator.Play("Jump_Start", 0.08f); }
            }
            vel.y -= gravity * Time.deltaTime;
            cc.Move((h + Vector3.up * vel.y) * Time.deltaTime);

            if (model != null && needs != null)
            {
                var (x, y, z) = needs.BodyScale;
                model.localScale = new Vector3((float)x, (float)y, (float)z);
            }
            if (animator != null) Animate(aiming);
        }

        void Animate(bool aiming)
        {
            if (!cc.isGrounded) { animator.Loop("Jump_Loop", 1); return; }
            if (crouched) { animator.Loop("Crouch_Idle_Loop", 1); return; }
            if (aiming && speedNow < 0.25f) { animator.Loop("Pistol_Idle_Loop", 1); return; }
            // gait as in the web game's human.js
            float s = speedNow;
            if (s < 0.25f) animator.Loop("Idle_Loop", 1);
            else if (s < 2.4f) animator.Loop("Walk_Loop", s / 1.5f);
            else if (s < 5.2f) animator.Loop("Jog_Fwd_Loop", s / 3.6f);
            else animator.Loop("Sprint_Loop", s / 6.5f);
        }
    }
}
