package com.example.exerciseform.sdk.ui

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.core.content.ContextCompat
import com.example.exerciseform.sdk.api.ExerciseFormSdk

/** Minimal host Activity so the Capacitor shell can launch the SDK UI on demand. */
class ExerciseFormActivity : ComponentActivity() {
    private val engine by lazy { ExerciseFormSdk.create(this) }

    private var cameraPermissionGranted by mutableStateOf(false)
    private var instructionCoach by mutableStateOf(true)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        cameraPermissionGranted = ContextCompat.checkSelfPermission(
            this,
            Manifest.permission.CAMERA
        ) == PackageManager.PERMISSION_GRANTED
        if (!cameraPermissionGranted) {
            requestPermissions(arrayOf(Manifest.permission.CAMERA), CAMERA_REQUEST_CODE)
        }
        engine.start()
        renderContent()
    }

    private fun renderContent() {
        setContent {
            MaterialTheme {
                Box(
                    modifier = Modifier
                        .safeDrawingPadding()
                        .fillMaxSize(),
                ) {
                    if (instructionCoach) {
                        InstructionCoachMode(
                            engine = engine,
                            owner = this@ExerciseFormActivity,
                            cameraPermissionGranted = cameraPermissionGranted,
                            requestCameraPermission = {
                                requestPermissions(arrayOf(Manifest.permission.CAMERA), CAMERA_REQUEST_CODE)
                            },
                            onExit = { instructionCoach = false })
                    } else if (cameraPermissionGranted) {
                        ExerciseFormPreview(engine, this@ExerciseFormActivity, this@ExerciseFormActivity)
                    } else {
                        Text("Camera permission is required to start the exercise session.")
                    }
                }
            }
        }
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == CAMERA_REQUEST_CODE) {
            cameraPermissionGranted = grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED
            renderContent()
        }
    }

    override fun onDestroy() {
        engine.close()
        super.onDestroy()
    }

    companion object {
        private const val CAMERA_REQUEST_CODE = 4201

        @JvmStatic
        fun start(context: Context) {
            context.startActivity(Intent(context, ExerciseFormActivity::class.java))
        }
    }
}
