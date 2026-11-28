package com.example.exerciseform.sdk.api

import com.example.exerciseform.sdk.movementobserver.MovementObserverConfig
import com.example.exerciseform.sdk.movementscoring.MovementScoringConfig

import com.example.exerciseform.sdk.physics.SkeletalPhysicsConfig

enum class SmoothingType { EMA, SMA, ONE_EURO }
data class ExerciseFormConfig(
    val smoothing: SmoothingType = SmoothingType.EMA,
    val emaAlpha: Float = .35f,
    val smaWindow: Int = 4,
    val minLandmarkConfidence: Float = .55f,
    val maxProcessingFps: Int = 30,
    val physics: SkeletalPhysicsConfig = SkeletalPhysicsConfig(),
    val movementObserver: MovementObserverConfig = MovementObserverConfig(),
    val movementScoring: MovementScoringConfig = MovementScoringConfig(),
    /** Runtime-loaded pose plausibility gate asset. Set to null to disable it. */
    val poseQualityGateAssetPath: String? = "pose_quality_gate/joint-angle-limits-v1.json"
)

data class PoseLandmark(
    val index: Int,
    val x: Float,
    val y: Float,
    val z: Float,
    val visibility: Float,
    val presence: Float,
    val world: Boolean = false
) { val confidence: Float get() = minOf(visibility, presence).coerceIn(0f, 1f) }

data class PoseFrame(
    val timestampNs: Long,
    val landmarks: List<PoseLandmark>,
    val imageWidth: Int,
    val imageHeight: Int,
    val rotationDegrees: Int = 0,
    val mirrored: Boolean = false,
    /** Optional world-landmark stream from the same inference. */
    val worldLandmarks: List<PoseLandmark> = emptyList()
)

data class JointMetric(
    val name: String,
    val value: Float,
    val confidence: Float,
    val angularVelocity: Float? = null,
    val angularAcceleration: Float? = null
)

data class SdkResult(
    val pose: PoseFrame?,
    val metrics: List<JointMetric>,
    val processingLatencyMs: Long,
    val fps: Float
)

data class FrameInput(
    val timestampNs: Long,
    val rgba: ByteArray,
    val width: Int,
    val height: Int,
    val rotationDegrees: Int = 0,
    val mirrored: Boolean = false
)
