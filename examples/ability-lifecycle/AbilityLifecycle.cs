using UnityEngine;

namespace Reconstructed.Abilities
{
    public sealed class AbilityLifecycle : MonoBehaviour
    {
        [SerializeField] private float rechargeSeconds = 10f;
        [SerializeField] private float primeSeconds = 0.5f;
        [SerializeField] private bool singleUse;
        [SerializeField] private float initialCharge = 1f;
        private AbilityState state;
        private bool directHeld;
        public AbilityState State => state ?? (state = new AbilityState(rechargeSeconds,primeSeconds,singleUse,initialCharge));
        public void HoldDirect(bool held) { directHeld = held; }
        private void Update() { State.Tick(Time.unscaledDeltaTime, Input.GetKey(KeyCode.Space), directHeld); }
        private void OnDisable() { directHeld = false; if (state != null) state.ClearInput(); }
        private void OnApplicationFocus(bool focused) { if (!focused) { directHeld = false; if (state != null) state.ClearInput(); } }
    }
}
