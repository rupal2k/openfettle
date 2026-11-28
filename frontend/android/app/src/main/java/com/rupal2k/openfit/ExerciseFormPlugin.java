package com.rupal2k.openfit;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.example.exerciseform.sdk.ui.ExerciseFormActivity;

/** Opens the native exercise-form SDK only when requested by the Android Home card. */
@CapacitorPlugin(name = "ExerciseForm")
public class ExerciseFormPlugin extends Plugin {
    @PluginMethod
    public void start(PluginCall call) {
        ExerciseFormActivity.start(getActivity());
        call.resolve();
    }
}
