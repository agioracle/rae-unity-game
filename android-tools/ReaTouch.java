import android.os.SystemClock;
import android.view.InputDevice;
import android.view.InputEvent;
import android.view.MotionEvent;
import java.lang.reflect.Method;

/** Normal Android input injection under the already-authorized adb shell UID. */
public final class ReaTouch {
    public static void main(String[] args) throws Exception {
        if (args.length < 3 || args.length % 2 != 1) throw new IllegalArgumentException("duration-ms x1 y1 [x2 y2 ...]");
        int duration = Integer.parseInt(args[0]), count = (args.length - 1) / 2;
        if (duration < 1 || duration > 10000 || count > 5) throw new IllegalArgumentException("gesture budget exceeded");
        Class<?> type;
        try { type = Class.forName("android.hardware.input.InputManagerGlobal"); }
        catch (ClassNotFoundException olderAndroid) { type = Class.forName("android.hardware.input.InputManager"); }
        Object manager = type.getMethod("getInstance").invoke(null);
        Method inject = type.getMethod("injectInputEvent", InputEvent.class, int.class);
        MotionEvent.PointerProperties[] properties = new MotionEvent.PointerProperties[count];
        MotionEvent.PointerCoords[] coordinates = new MotionEvent.PointerCoords[count];
        for (int i = 0; i < count; i++) {
            properties[i] = new MotionEvent.PointerProperties(); properties[i].id = i; properties[i].toolType = MotionEvent.TOOL_TYPE_FINGER;
            coordinates[i] = new MotionEvent.PointerCoords(); coordinates[i].x = Float.parseFloat(args[1 + i * 2]); coordinates[i].y = Float.parseFloat(args[2 + i * 2]); coordinates[i].pressure = 1; coordinates[i].size = 0.01f;
            if (!Float.isFinite(coordinates[i].x) || !Float.isFinite(coordinates[i].y) || coordinates[i].x < 0 || coordinates[i].y < 0 || coordinates[i].x > 16384 || coordinates[i].y > 16384) throw new IllegalArgumentException("coordinate budget exceeded");
        }
        long down = SystemClock.uptimeMillis(); int active = 0;
        try {
            for (int i = 0; i < count; i++) { send(manager, inject, down, i == 0 ? MotionEvent.ACTION_DOWN : MotionEvent.ACTION_POINTER_DOWN | (i << 8), i + 1, properties, coordinates); active = i + 1; }
            while (SystemClock.uptimeMillis() - down < duration) { send(manager, inject, down, MotionEvent.ACTION_MOVE, count, properties, coordinates); SystemClock.sleep(16); }
        } finally {
            for (int i = active - 1; i >= 0; i--) send(manager, inject, down, i == 0 ? MotionEvent.ACTION_UP : MotionEvent.ACTION_POINTER_UP | (i << 8), i + 1, properties, coordinates);
        }
        System.out.println("{\"injected\":true,\"pointers\":" + count + ",\"duration_ms\":" + duration + "}");
    }
    private static void send(Object manager, Method inject, long down, int action, int count, MotionEvent.PointerProperties[] properties, MotionEvent.PointerCoords[] coordinates) throws Exception {
        MotionEvent event = MotionEvent.obtain(down, SystemClock.uptimeMillis(), action, count, properties, coordinates, 0, 0, 1, 1, 0, 0, InputDevice.SOURCE_TOUCHSCREEN, 0);
        try { if (!Boolean.TRUE.equals(inject.invoke(manager, event, 2))) throw new IllegalStateException("Android rejected input injection"); } finally { event.recycle(); }
    }
}
