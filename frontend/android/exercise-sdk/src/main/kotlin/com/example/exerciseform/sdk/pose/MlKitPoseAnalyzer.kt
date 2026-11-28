package com.example.exerciseform.sdk.pose

import androidx.annotation.OptIn
import androidx.camera.core.ExperimentalGetImage
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.pose.PoseDetection
import com.google.mlkit.vision.pose.PoseDetector
import com.google.mlkit.vision.pose.defaults.PoseDetectorOptions
import java.util.concurrent.atomic.AtomicBoolean

class MlKitPoseAnalyzer(
    mirrorHorizontally: Boolean,
    private val onPoseFrame: (com.example.exerciseform.sdk.api.PoseFrame) -> Unit,
    private val onError: (Throwable) -> Unit = {}
) : ImageAnalysis.Analyzer {
    private val adapter = MlKitPoseAdapter(mirrorHorizontally)
    private val processing = AtomicBoolean(false)
    private val closed = AtomicBoolean(false)
    private val detector: PoseDetector? = runCatching {
        PoseDetection.getClient(PoseDetectorOptions.Builder().setDetectorMode(PoseDetectorOptions.STREAM_MODE).build())
    }.onFailure(onError).getOrNull()

    @OptIn(ExperimentalGetImage::class)
    override fun analyze(imageProxy: ImageProxy) {
        val active = detector
        val image = imageProxy.image
        if (active == null || image == null || closed.get() || !processing.compareAndSet(false, true)) { imageProxy.close(); return }
        val rotation = imageProxy.imageInfo.rotationDegrees
        val input = InputImage.fromMediaImage(image, rotation)
        val width = if (rotation == 90 || rotation == 270) imageProxy.height else imageProxy.width
        val height = if (rotation == 90 || rotation == 270) imageProxy.width else imageProxy.height
        active.process(input)
            .addOnSuccessListener { pose -> if (!closed.get()) onPoseFrame(adapter.toPoseFrame(pose, width, height, imageProxy.imageInfo.timestamp)) }
            .addOnFailureListener { if (!closed.get()) onError(it) }
            .addOnCompleteListener { processing.set(false); imageProxy.close() }
    }

    fun close() { if (closed.compareAndSet(false, true)) detector?.close() }
}
