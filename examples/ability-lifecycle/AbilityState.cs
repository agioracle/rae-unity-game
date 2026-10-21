using System;

namespace Reconstructed.Abilities
{
    // Source-backed CoreNode/AbilityButton lifecycle. Rendering and effect consumers are target-owned.
    public sealed class AbilityState
    {
        public readonly float RechargeSeconds, PrimeSeconds;
        public readonly bool SingleUse;
        public bool CanControl = true;
        public float Charge { get; private set; }
        public float PrimeElapsed { get; private set; }
        public float DirectHold { get; private set; }
        public bool IsPrimed { get; private set; }
        public bool Locked { get; private set; }
        public int Activations { get; private set; }
        public int CancelledEvents { get; private set; }
        public int PrimedEvents { get; private set; }
        public int RechargedEvents { get; private set; }
        public event Action Activated;
        public bool CanPrime => !Locked && Charge >= 1f;
        public float PrimeFraction => Math.Max(Clamp(PrimeElapsed / PrimeSeconds), Clamp(DirectHold / PrimeSeconds));
        public AbilityState(float rechargeSeconds, float primeSeconds, bool singleUse, float initialCharge)
        {
            if (!(rechargeSeconds > 0f) || float.IsInfinity(rechargeSeconds) || !(primeSeconds > 0f) || float.IsInfinity(primeSeconds) || float.IsNaN(initialCharge)) throw new ArgumentOutOfRangeException("Invalid ability configuration");
            RechargeSeconds = rechargeSeconds; PrimeSeconds = primeSeconds; SingleUse = singleUse; Charge = Clamp(initialCharge);
        }
        public void Tick(float unscaledDelta, bool dualHeld, bool directHeld)
        {
            if (float.IsNaN(unscaledDelta) || float.IsInfinity(unscaledDelta) || unscaledDelta < 0f) throw new ArgumentOutOfRangeException(nameof(unscaledDelta));
            var before = Charge;
            if (!Locked && CanControl) Charge += unscaledDelta / RechargeSeconds;
            if (before < 1f && Charge >= 1f) RechargedEvents++;
            Charge = Math.Min(1f, Charge);
            if (IsPrimed)
            {
                PrimeElapsed += unscaledDelta;
                if (!dualHeld)
                {
                    if (PrimeElapsed >= PrimeSeconds) Activate();
                    else { IsPrimed = false; PrimeElapsed = 0f; CancelledEvents++; }
                }
            }
            else if (dualHeld && CanPrime) { IsPrimed = true; PrimedEvents++; }
            if (directHeld && CanControl && CanPrime)
            {
                DirectHold += unscaledDelta;
                if (DirectHold >= PrimeSeconds) { Activate(); DirectHold = 0f; }
            }
            else DirectHold = 0f;
        }
        public bool Activate()
        {
            if (!CanPrime) return false;
            Charge = 0f; IsPrimed = false; PrimeElapsed = 0f; Activations++;
            Activated?.Invoke();
            if (SingleUse) Locked = true;
            return true;
        }
        public void ClearInput() { DirectHold = 0f; }
        private static float Clamp(float value) => Math.Max(0f, Math.Min(1f, value));
    }
}
