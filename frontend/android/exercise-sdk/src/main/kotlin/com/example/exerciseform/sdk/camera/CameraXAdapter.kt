package com.example.exerciseform.sdk.camera

import android.content.Context
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.lifecycle.LifecycleOwner
import com.example.exerciseform.sdk.api.ExerciseFormEngine
import com.example.exerciseform.sdk.pose.MlKitPoseAnalyzer
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/** SDK-owned CameraX preview and ML Kit pose-analysis bridge. */
class CameraXAdapter(private val context: Context, private val engine: ExerciseFormEngine) {
    private var lensFacing = CameraSelector.LENS_FACING_BACK
    private var previewView: PreviewView? = null
    private var provider: ProcessCameraProvider? = null
    private var analyzer: MlKitPoseAnalyzer? = null
    private var analysis: ImageAnalysis? = null
    private var executor: ExecutorService? = null

    fun bind(owner: LifecycleOwner, previewView: PreviewView) {
        this.previewView = previewView
        bindCurrentCamera(owner)
    }

    fun toggleCamera(owner: LifecycleOwner) {
        engine.resetMovementObserver()
        unbind()
        lensFacing = if (lensFacing == CameraSelector.LENS_FACING_FRONT) CameraSelector.LENS_FACING_BACK else CameraSelector.LENS_FACING_FRONT
        bindCurrentCamera(owner)
    }

    private fun bindCurrentCamera(owner: LifecycleOwner) {
        val target = previewView ?: return
        val future = ProcessCameraProvider.getInstance(context)
        future.addListener({
            runCatching {
                val cameraProvider = future.get(); provider = cameraProvider
                val poseAnalyzer = MlKitPoseAnalyzer(lensFacing == CameraSelector.LENS_FACING_FRONT, engine::submitPose)
                analyzer = poseAnalyzer
                val cameraExecutor = Executors.newSingleThreadExecutor(); executor = cameraExecutor
                val imageAnalysis = ImageAnalysis.Builder()
                    .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                    .setImageQueueDepth(1)
                    .build()
                    .also { it.setAnalyzer(cameraExecutor, poseAnalyzer) }
                analysis = imageAnalysis
                val preview = Preview.Builder().build().also { it.setSurfaceProvider(target.surfaceProvider) }
                val selector = CameraSelector.Builder().requireLensFacing(lensFacing).build()
                cameraProvider.unbindAll(); cameraProvider.bindToLifecycle(owner, selector, preview, imageAnalysis)
            }
        }, context.mainExecutor)
    }

    fun unbind() {
        analysis?.clearAnalyzer(); provider?.unbindAll(); analyzer?.close(); executor?.shutdown()
        analysis = null; provider = null; analyzer = null; executor = null
    }

    fun close() { unbind(); previewView = null }

}
