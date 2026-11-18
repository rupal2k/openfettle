package com.rupal2k.openfit;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Wind down's link to {@link WindDownService}: start() while the sound plays (again on every
 * change, to update the notification), stop() when it stops. Emits "stopped" when the
 * notification's Stop button is pressed, so the WebView fades the sound out.
 */
@CapacitorPlugin(name = "WindDown")
public class WindDownPlugin extends Plugin {
    private static WindDownPlugin instance;

    @Override
    public void load() { instance = this; }

    @Override
    protected void handleOnDestroy() {
        if (instance == this) instance = null;
        WindDownService.stop(getContext());   // the WebView and its sound are gone
    }

    static void notifyStopped() {
        if (instance != null) instance.notifyListeners("stopped", new JSObject());
    }

    @PluginMethod
    public void start(PluginCall call) {
        Long until = call.getLong("until", 0L);
        WindDownService.start(getContext(), call.getString("title", "Wind down"), call.getString("text", ""),
            call.getString("stop", "Stop"), until == null ? 0 : until);
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        WindDownService.stop(getContext());
        call.resolve();
    }
}
