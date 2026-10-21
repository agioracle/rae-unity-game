using UnityEngine;

namespace Reconstructed.Abilities
{
    public sealed class AbilityView : MonoBehaviour
    {
        [SerializeField] private AbilityLifecycle feature;
        private readonly Rect button = new Rect(500,300,380,70);
        public void Bind(AbilityLifecycle component) { feature = component; }
        private void OnGUI()
        {
            if (feature == null) return;
            var s=feature.State;
            GUI.Box(new Rect(480,40,440,440),"Skill lifecycle");
            GUI.Label(new Rect(500,80,380,25),"Hold Space: both controls; release to cast");
            GUI.Label(new Rect(500,110,380,25),"Hold button: cast when the hold completes");
            var ready=s.CanPrime;
            var previous=GUI.color;GUI.color=ready?new Color(0.1f,0.9f,0.2f):new Color(0.25f,0.25f,0.25f);
            GUI.DrawTexture(new Rect(500,145,100,50),Texture2D.whiteTexture);GUI.color=previous;
            GUI.Label(new Rect(620,155,240,25),s.Locked?"Locked":s.IsPrimed?"Primed":ready?"Ready":"Recharging");
            GUI.Label(new Rect(500,210,380,25),"Activations: "+s.Activations);
            GUI.Label(new Rect(500,235,380,25),"Cancelled: "+s.CancelledEvents);
            GUI.Label(new Rect(500,260,380,25),"Charge: "+Mathf.RoundToInt(s.Charge*100)+"%    Prime: "+Mathf.RoundToInt(s.PrimeFraction*100)+"%");
            GUI.Box(button,"HOLD SKILL");
            var e=Event.current;
            if(e.type==EventType.MouseDown && e.button==0 && button.Contains(e.mousePosition)){feature.HoldDirect(true);e.Use();}
            if(e.type==EventType.MouseUp && e.button==0){feature.HoldDirect(false);}
        }
        private void OnDisable(){if(feature!=null)feature.HoldDirect(false);}
    }
}
